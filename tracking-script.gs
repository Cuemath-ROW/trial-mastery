/**
 * Cuemath Trial Mastery — Teacher Tracking Backend
 *
 * Deploy as a Google Apps Script Web App:
 * 1. Create a new Google Sheet (this becomes your tracking dashboard)
 * 2. Go to Extensions → Apps Script
 * 3. Paste this entire file, save
 * 4. Click Deploy → New Deployment → Web App
 *      - Execute as: Me
 *      - Who has access: Anyone
 * 5. Copy the web app URL → paste into index.html as TRACKING_URL
 *
 * If redeploying over an older version: delete the old "Teachers" tab first —
 * this version uses a new "Progress" tab with richer columns.
 *
 * Tabs created automatically:
 *   "Events"   — raw log of every user action (login, intro ack, section ack, quiz, etc.)
 *   "Progress" — one row per teacher with live status + section-by-section completion
 */

const SECTIONS = ['a1','a2','b1','b2','b3','b4','b5','b6','c1','c2','c3','d1','d2'];
const TOTAL_SECTIONS = SECTIONS.length;

const STATUS = {
  NOT_STARTED: 'Not Started',
  IN_PROGRESS: 'In Progress',
  ASSESSMENT_PENDING: 'Assessment Pending',
  COMPLETED: 'Completed',
};

const STATUS_STYLE = {
  'Not Started':        { bg: '#E5E5E5', fg: '#555555' },
  'In Progress':        { bg: '#FFF3CD', fg: '#856404' },
  'Assessment Pending': { bg: '#FFE0B2', fg: '#8A4A00' },
  'Completed':          { bg: '#D4EDDA', fg: '#155724' },
};

const PROGRESS_HEADERS = [
  'Email', 'Name', 'Mobile',
  'Status', 'Progress',
  'Intro',
  'A1','A2','B1','B2','B3','B4','B5','B6','C1','C2','C3','D1','D2',
  'Quiz Score', 'Quiz Attempts',
  'First Login', 'Started At', 'Last Activity', 'Completed At',
];

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
  if (!sheet) {
    sheet = ss.insertSheet('Events');
    sheet.appendRow(['Timestamp', 'Email', 'Name', 'Mobile', 'Action', 'Detail']);
    sheet.getRange('1:1').setFontWeight('bold').setBackground('#2A2A2A').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 170);
    sheet.setColumnWidth(2, 220);
    sheet.setColumnWidth(3, 150);
    sheet.setColumnWidth(4, 130);
    sheet.setColumnWidth(5, 140);
    sheet.setColumnWidth(6, 180);
  }
  // Force Detail column to plain text so "5/6" etc. are not auto-converted to dates
  sheet.getRange(1, 6, sheet.getMaxRows(), 1).setNumberFormat('@');
  sheet.appendRow([ts, data.email || '', data.name || '', data.mobile || '', data.action || '', data.section || '']);
}

// ───────────────────────── Progress (per-user dashboard) ─────────────────────────

function updateProgress(ss, ts, data) {
  const sheet = getOrCreateProgressSheet(ss);
  const email = String(data.email || '').toLowerCase().trim();
  if (!email) return;

  const row = findOrCreateUserRow(sheet, email, data, ts);

  // Last activity always updates
  sheet.getRange(row, COL['Last Activity']).setValue(ts);
  if (data.name) sheet.getRange(row, COL['Name']).setValue(String(data.name));
  if (data.mobile) sheet.getRange(row, COL['Mobile']).setValue(String(data.mobile));

  const action = String(data.action || '');
  const section = String(data.section || '').toLowerCase();

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
    // Center-align section cells
    sheet.getRange(2, COL['Intro'], sheet.getMaxRows() - 1, (COL['D2'] - COL['Intro'] + 1))
      .setHorizontalAlignment('center');
    // Force Quiz Score column to plain text so "5/6" is not auto-converted to a date
    sheet.getRange(1, COL['Quiz Score'], sheet.getMaxRows(), 1).setNumberFormat('@');
  }
  return sheet;
}

function findOrCreateUserRow(sheet, email, data, ts) {
  const last = sheet.getLastRow();
  if (last >= 2) {
    const emails = sheet.getRange(2, COL['Email'], last - 1, 1).getValues().flat().map(s => String(s).toLowerCase().trim());
    const idx = emails.indexOf(email);
    if (idx !== -1) return idx + 2;
  }
  const row = last + 1;
  sheet.getRange(row, COL['Email']).setValue(email);
  sheet.getRange(row, COL['Name']).setValue(data.name || '');
  sheet.getRange(row, COL['Mobile']).setValue(data.mobile || '');
  sheet.getRange(row, COL['First Login']).setValue(ts);
  sheet.getRange(row, COL['Last Activity']).setValue(ts);
  sheet.getRange(row, COL['Progress']).setValue('0/' + TOTAL_SECTIONS);
  setStatus(sheet, row, STATUS.NOT_STARTED);
  return row;
}

function recomputeStatus(sheet, row) {
  const values = sheet.getRange(row, COL['Intro'], 1, COL['D2'] - COL['Intro'] + 1).getValues()[0];
  const introDone = String(values[0]).trim() === '✓';
  let sectionsDone = 0;
  for (let i = 1; i < values.length; i++) if (String(values[i]).trim() === '✓') sectionsDone++;

  // Primary signal: Completed At timestamp is set only when frontend fires 'completed' (quiz passed).
  // Secondary: parse quiz score if present (using DisplayValue so date-auto-conversion doesn't break it).
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
 * Run this once from the Apps Script editor (Run → rebuildProgress) if you ever
 * need to rebuild the Progress sheet from the Events log — e.g. after editing columns.
 */
function rebuildProgress() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const old = ss.getSheetByName('Progress');
  if (old) ss.deleteSheet(old);
  const events = ss.getSheetByName('Events');
  if (!events) return;
  // Use display values so dates/numbers come back as strings — matches how the webhook sees them
  const data = events.getDataRange().getDisplayValues();
  for (let i = 1; i < data.length; i++) {
    const [ts, email, name, mobile, action, detail] = data[i];
    updateProgress(ss, ts || new Date().toISOString(), {
      email: String(email || ''),
      name: String(name || ''),
      mobile: String(mobile || ''),
      action: String(action || ''),
      section: String(detail || ''),
    });
  }
}
