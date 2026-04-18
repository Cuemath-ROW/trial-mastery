/**
 * Cuemath Trial Mastery — Teacher Tracking Backend
 *
 * Deploy as a Google Apps Script Web App:
 * 1. Create a new Google Sheet (this becomes your tracking dashboard)
 * 2. Go to Extensions → Apps Script
 * 3. Paste this entire file, save
 * 4. Click Deploy → Manage Deployments → pencil → New version → Deploy
 * 5. The web app URL stays the same.
 *
 * Schema auto-migration: on first event after an update, any old Progress/Events
 * sheet with a mismatched schema is renamed to Progress_archive_<ts> / Events_archive_<ts>
 * and a fresh sheet is created. Your historical data stays in the archive tabs.
 *
 * Tabs created automatically:
 *   "Events"   — raw log of every user action with session_id
 *   "Progress" — one row per (teacher email × session_id). Each fresh attempt = new row.
 *                Previous attempts auto-flip to "Aborted" status when the user starts fresh.
 */

const SECTIONS = ['a1','a2','b1','b2','b3','b4','b5','b6','c1','c2','c3','d1','d2'];
const TOTAL_SECTIONS = SECTIONS.length;

const STATUS = {
  NOT_STARTED: 'Not Started',
  IN_PROGRESS: 'In Progress',
  ASSESSMENT_PENDING: 'Assessment Pending',
  COMPLETED: 'Completed',
  ABORTED: 'Aborted',
};

const STATUS_STYLE = {
  'Not Started':        { bg: '#E5E5E5', fg: '#555555' },
  'In Progress':        { bg: '#FFF3CD', fg: '#856404' },
  'Assessment Pending': { bg: '#FFE0B2', fg: '#8A4A00' },
  'Completed':          { bg: '#D4EDDA', fg: '#155724' },
  'Aborted':            { bg: '#E9C7C2', fg: '#6D2222' },
};

const PROGRESS_HEADERS = [
  'Email', 'Name', 'Mobile',
  'Status', 'Progress',
  'Intro',
  'A1','A2','B1','B2','B3','B4','B5','B6','C1','C2','C3','D1','D2',
  'Quiz Score', 'Quiz Attempts',
  'First Login', 'Started At', 'Last Activity', 'Completed At',
  'Session ID',
];

const EVENTS_HEADERS = ['Timestamp', 'Email', 'Name', 'Mobile', 'Action', 'Detail', 'Session ID'];

// Column indices (1-based for Apps Script ranges)
const COL = {};
PROGRESS_HEADERS.forEach((h, i) => { COL[h] = i + 1; });

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const ts = data.timestamp || new Date().toISOString();

    logEvent(ss, ts, data);
    updateProgress(ss, ts, data);

    return ContentService.createTextOutput(JSON.stringify({ status: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return ContentService.createTextOutput('Trial Mastery Tracking API is running.')
    .setMimeType(ContentService.MimeType.TEXT);
}

// ───────────────────────── Events (raw log) ─────────────────────────

function logEvent(ss, ts, data) {
  let sheet = ss.getSheetByName('Events');
  // Migration: if existing sheet has old schema (6 cols, no Session ID), archive it.
  if (sheet) {
    const lastCol = sheet.getLastColumn();
    const headers = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String) : [];
    const matches = EVENTS_HEADERS.every(function(h, i) { return headers[i] === h; });
    if (!matches) {
      sheet.setName('Events_archive_' + new Date().getTime());
      sheet = null;
    }
  }
  if (!sheet) {
    sheet = ss.insertSheet('Events');
    sheet.appendRow(EVENTS_HEADERS);
    sheet.getRange('1:1').setFontWeight('bold').setBackground('#2A2A2A').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 170);
    sheet.setColumnWidth(2, 220);
    sheet.setColumnWidth(3, 150);
    sheet.setColumnWidth(4, 130);
    sheet.setColumnWidth(5, 140);
    sheet.setColumnWidth(6, 180);
    sheet.setColumnWidth(7, 180);
  }
  // Force Detail column to plain text so "5/6" etc. are not auto-converted to dates
  sheet.getRange(1, 6, sheet.getMaxRows(), 1).setNumberFormat('@');
  sheet.appendRow([ts, data.email || '', data.name || '', data.mobile || '', data.action || '', data.section || '', data.session_id || '']);
}

// ───────────────────────── Progress (per-user dashboard) ─────────────────────────

function updateProgress(ss, ts, data) {
  const sheet = getOrCreateProgressSheet(ss);
  const email = String(data.email || '').toLowerCase().trim();
  if (!email) return;
  const session = String(data.session_id || '');

  const row = findOrCreateUserRow(sheet, email, session, data, ts);

  // Last activity always updates
  sheet.getRange(row, COL['Last Activity']).setValue(ts);
  if (data.name) sheet.getRange(row, COL['Name']).setValue(String(data.name));
  if (data.mobile) sheet.getRange(row, COL['Mobile']).setValue(String(data.mobile));

  const action = String(data.action || '');
  const section = String(data.section || '').toLowerCase();

  if (action === 'reset') {
    // Mark this row Aborted, unless it's already Completed (preserve achievement).
    const current = String(sheet.getRange(row, COL['Status']).getValue() || '');
    if (current !== STATUS.COMPLETED) {
      setStatus(sheet, row, STATUS.ABORTED);
    }
    return; // Don't recompute status
  }

  if (action === 'acknowledge') {
    if (section === 'intro') {
      if (!sheet.getRange(row, COL['Started At']).getValue()) {
        sheet.getRange(row, COL['Started At']).setValue(ts);
      }
      sheet.getRange(row, COL['Intro']).setValue('✓');
    } else if (SECTIONS.indexOf(section) !== -1) {
      sheet.getRange(row, COL[section.toUpperCase()]).setValue('✓');
    }
  }

  if (action === 'quiz_score') {
    const parts = (data.section || '').split('/');
    const newScore = parseInt(parts[0], 10);
    if (!isNaN(newScore)) {
      const total = parts[1] || '6';
      const scoreCell = sheet.getRange(row, COL['Quiz Score']);
      scoreCell.setNumberFormat('@');
      const prevDisplay = String(scoreCell.getDisplayValue() || '').split('/');
      const prev = parseInt(prevDisplay[0], 10);
      const best = isNaN(prev) ? newScore : Math.max(prev, newScore);
      scoreCell.setValue(best + '/' + total);
      const prevAttempts = parseInt(sheet.getRange(row, COL['Quiz Attempts']).getValue(), 10) || 0;
      sheet.getRange(row, COL['Quiz Attempts']).setValue(prevAttempts + 1);
    }
  }

  if (action === 'completed') {
    if (!sheet.getRange(row, COL['Completed At']).getValue()) {
      sheet.getRange(row, COL['Completed At']).setValue(ts);
    }
  }

  recomputeStatus(sheet, row);
}

function getOrCreateProgressSheet(ss) {
  let sheet = ss.getSheetByName('Progress');
  // Migration: if headers don't match, archive the old sheet.
  if (sheet) {
    const lastCol = sheet.getLastColumn();
    const headers = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String) : [];
    const matches = PROGRESS_HEADERS.every(function(h, i) { return headers[i] === h; });
    if (!matches) {
      sheet.setName('Progress_archive_' + new Date().getTime());
      sheet = null;
    }
  }
  if (!sheet) {
    sheet = ss.insertSheet('Progress');
    sheet.appendRow(PROGRESS_HEADERS);
    const header = sheet.getRange(1, 1, 1, PROGRESS_HEADERS.length);
    header.setFontWeight('bold').setBackground('#2A2A2A').setFontColor('#FFFFFF').setHorizontalAlignment('center');
    sheet.setFrozenRows(1);
    sheet.setFrozenColumns(3);
    sheet.setColumnWidth(COL['Email'], 220);
    sheet.setColumnWidth(COL['Name'], 150);
    sheet.setColumnWidth(COL['Mobile'], 130);
    sheet.setColumnWidth(COL['Status'], 170);
    sheet.setColumnWidth(COL['Progress'], 80);
    for (let i = COL['Intro']; i <= COL['D2']; i++) sheet.setColumnWidth(i, 46);
    sheet.setColumnWidth(COL['Quiz Score'], 90);
    sheet.setColumnWidth(COL['Quiz Attempts'], 90);
    sheet.setColumnWidth(COL['First Login'], 170);
    sheet.setColumnWidth(COL['Started At'], 170);
    sheet.setColumnWidth(COL['Last Activity'], 170);
    sheet.setColumnWidth(COL['Completed At'], 170);
    sheet.setColumnWidth(COL['Session ID'], 180);
    sheet.getRange(2, COL['Intro'], sheet.getMaxRows() - 1, (COL['D2'] - COL['Intro'] + 1))
      .setHorizontalAlignment('center');
    sheet.getRange(1, COL['Quiz Score'], sheet.getMaxRows(), 1).setNumberFormat('@');
  }
  return sheet;
}

function findOrCreateUserRow(sheet, email, session, data, ts) {
  const last = sheet.getLastRow();
  if (last >= 2) {
    const emails = sheet.getRange(2, COL['Email'], last - 1, 1).getValues().flat().map(function(s) { return String(s).toLowerCase().trim(); });
    const sessions = sheet.getRange(2, COL['Session ID'], last - 1, 1).getValues().flat().map(String);
    for (let i = 0; i < emails.length; i++) {
      if (emails[i] === email && sessions[i] === session) return i + 2;
    }
  }
  const row = last + 1;
  sheet.getRange(row, COL['Email']).setValue(email);
  sheet.getRange(row, COL['Name']).setValue(data.name || '');
  sheet.getRange(row, COL['Mobile']).setValue(data.mobile || '');
  sheet.getRange(row, COL['Session ID']).setValue(session);
  sheet.getRange(row, COL['First Login']).setValue(ts);
  sheet.getRange(row, COL['Last Activity']).setValue(ts);
  sheet.getRange(row, COL['Progress']).setValue('0/' + TOTAL_SECTIONS);
  setStatus(sheet, row, STATUS.NOT_STARTED);
  return row;
}

function recomputeStatus(sheet, row) {
  // Don't overwrite Aborted — that's a terminal state set by user action.
  const current = String(sheet.getRange(row, COL['Status']).getValue() || '');
  if (current === STATUS.ABORTED) return;

  const values = sheet.getRange(row, COL['Intro'], 1, COL['D2'] - COL['Intro'] + 1).getValues()[0];
  const introDone = String(values[0]).trim() === '✓';
  let sectionsDone = 0;
  for (let i = 1; i < values.length; i++) if (String(values[i]).trim() === '✓') sectionsDone++;

  const completedAt = sheet.getRange(row, COL['Completed At']).getValue();
  const quizDisplay = String(sheet.getRange(row, COL['Quiz Score']).getDisplayValue() || '');
  const quizScore = quizDisplay.split('/');
  const scoreNum = parseInt(quizScore[0], 10);
  const passed = !!completedAt || (!isNaN(scoreNum) && scoreNum >= 5);

  let status;
  if (passed) status = STATUS.COMPLETED;
  else if (sectionsDone >= TOTAL_SECTIONS) status = STATUS.ASSESSMENT_PENDING;
  else if (introDone || sectionsDone > 0) status = STATUS.IN_PROGRESS;
  else status = STATUS.NOT_STARTED;

  sheet.getRange(row, COL['Progress']).setValue(sectionsDone + '/' + TOTAL_SECTIONS);
  setStatus(sheet, row, status);
}

function setStatus(sheet, row, status) {
  const cell = sheet.getRange(row, COL['Status']);
  cell.setValue(status);
  const s = STATUS_STYLE[status] || STATUS_STYLE['Not Started'];
  cell.setBackground(s.bg).setFontColor(s.fg).setFontWeight('bold').setHorizontalAlignment('center');
}

// ───────────────────────── One-time helpers ─────────────────────────

/**
 * Run from the Apps Script editor if you need to rebuild the Progress sheet
 * from the Events log (e.g. after manual edits). Reads as display values so
 * date-auto-conversion doesn't break string fields like "5/6".
 */
function rebuildProgress() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const old = ss.getSheetByName('Progress');
  if (old) ss.deleteSheet(old);
  const events = ss.getSheetByName('Events');
  if (!events) return;
  const data = events.getDataRange().getDisplayValues();
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    updateProgress(ss, r[0] || new Date().toISOString(), {
      email: String(r[1] || ''),
      name: String(r[2] || ''),
      mobile: String(r[3] || ''),
      action: String(r[4] || ''),
      section: String(r[5] || ''),
      session_id: String(r[6] || ''),
    });
  }
}
