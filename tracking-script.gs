/**
 * Cuemath Trial Mastery — Teacher Tracking Backend (V3)
 *
 * Deploy as a Google Apps Script Web App:
 * 1. Open the tracking Google Sheet
 * 2. Extensions → Apps Script
 * 3. Replace Code.gs with this file, save
 * 4. Deploy → Manage Deployments → pencil → New version → Deploy
 *    (the web app URL stays the same)
 *
 * V3 changes from V2:
 *   - Two separate Progress tabs: Progress_APAC and Progress_EUK
 *   - Region column added to Events tab
 *   - EUK section IDs (uk_a1..uk_d2) map to same display labels (A1..E2)
 *   - data.region field from the module payload routes the row correctly
 *
 * Both regions use identical 20-section schemas with display labels A1..E2.
 * Schema auto-migration: old Progress/Events tabs are archived on first mismatch.
 */

// ─── APAC section IDs (sent by module when region = APAC) ───────────────────
const APAC_SECTIONS = [
  'a1','a2','a3','a4','a5',
  'u1','u2','u3',
  'b1','b2','b3','b4','b5','b6','b7',
  'c1','c2','c3',
  'd1','d2',
];

// ─── EUK section IDs (sent by module when region = EUK) ────────────────────
const EUK_SECTIONS = [
  'uk_a1','uk_a2','uk_a3','uk_a4','uk_a5',
  'uk_u1','uk_u2','uk_u3',
  'uk_b1','uk_b2','uk_b3','uk_b4','uk_b5','uk_b6','uk_b7',
  'uk_c1','uk_c2','uk_c3',
  'uk_d1','uk_d2',
];

const TOTAL_SECTIONS = APAC_SECTIONS.length; // 20 — same for both

// Display labels A1..E2 — identical for both regions (same structure, different content)
const DISPLAY_LABELS = [
  'A1','A2','A3','A4','A5',
  'B1','B2','B3',
  'C1','C2','C3','C4','C5','C6','C7',
  'D1','D2','D3',
  'E1','E2',
];

// Build lookup: internal ID → display label (covers both APAC and EUK IDs)
const ID_TO_LABEL = {};
APAC_SECTIONS.forEach(function(id, i) { ID_TO_LABEL[id] = DISPLAY_LABELS[i]; });
EUK_SECTIONS.forEach(function(id, i) { ID_TO_LABEL[id] = DISPLAY_LABELS[i]; });

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

// Progress sheet column headers — shared by both APAC and EUK tabs
const PROGRESS_HEADERS = [
  'Email', 'Name', 'Mobile',
  'Status', 'Progress',
  'Intro',
].concat(DISPLAY_LABELS).concat([
  'Quiz Score', 'Quiz Attempts',
  'First Login', 'Started At', 'Last Activity', 'Completed At',
  'Session ID',
]);

const EVENTS_HEADERS = ['Timestamp', 'Email', 'Name', 'Mobile', 'Region', 'Action', 'Detail', 'Session ID'];

// Column indices (1-based for Apps Script ranges)
const COL = {};
PROGRESS_HEADERS.forEach(function(h, i) { COL[h] = i + 1; });

const FIRST_SECTION_COL = COL[DISPLAY_LABELS[0]];
const LAST_SECTION_COL  = COL[DISPLAY_LABELS[DISPLAY_LABELS.length - 1]];

// ─── Web app entry points ────────────────────────────────────────────────────

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
  return ContentService.createTextOutput(
    'Trial Mastery Tracking API V3 — APAC + EUK, 20 sections each.'
  ).setMimeType(ContentService.MimeType.TEXT);
}

// ─── Events (raw log) ────────────────────────────────────────────────────────

function logEvent(ss, ts, data) {
  let sheet = ss.getSheetByName('Events');
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
    sheet.setColumnWidth(5, 80);
    sheet.setColumnWidth(6, 140);
    sheet.setColumnWidth(7, 180);
    sheet.setColumnWidth(8, 180);
  }
  // Force Detail column to plain text so "5/6" etc. are not auto-converted to dates
  sheet.getRange(1, 7, sheet.getMaxRows(), 1).setNumberFormat('@');
  sheet.appendRow([
    ts,
    data.email   || '',
    data.name    || '',
    data.mobile  || '',
    data.region  || 'APAC',
    data.action  || '',
    data.section || '',
    data.session_id || '',
  ]);
}

// ─── Progress (per-user dashboard) ──────────────────────────────────────────

function updateProgress(ss, ts, data) {
  const region = String(data.region || 'APAC').toUpperCase() === 'EUK' ? 'EUK' : 'APAC';
  const sheetName = 'Progress_' + region;
  const sheet = getOrCreateProgressSheet(ss, sheetName);
  const email = String(data.email || '').toLowerCase().trim();
  if (!email) return;
  const session = String(data.session_id || '');

  const row = findOrCreateUserRow(sheet, email, session, data, ts);

  sheet.getRange(row, COL['Last Activity']).setValue(ts);
  if (data.name)   sheet.getRange(row, COL['Name']).setValue(String(data.name));
  if (data.mobile) sheet.getRange(row, COL['Mobile']).setValue(String(data.mobile));

  const action  = String(data.action  || '');
  const section = String(data.section || '').toLowerCase();

  if (action === 'reset') {
    const current = String(sheet.getRange(row, COL['Status']).getValue() || '');
    if (current !== STATUS.COMPLETED) setStatus(sheet, row, STATUS.ABORTED);
    return;
  }

  if (action === 'acknowledge') {
    if (section === 'intro') {
      if (!sheet.getRange(row, COL['Started At']).getValue()) {
        sheet.getRange(row, COL['Started At']).setValue(ts);
      }
      sheet.getRange(row, COL['Intro']).setValue('✓');
    } else if (ID_TO_LABEL[section]) {
      sheet.getRange(row, COL[ID_TO_LABEL[section]]).setValue('✓');
    }
  }

  if (action === 'quiz_score') {
    const parts    = (data.section || '').split('/');
    const newScore = parseInt(parts[0], 10);
    if (!isNaN(newScore)) {
      const total     = parts[1] || '20';
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

function getOrCreateProgressSheet(ss, sheetName) {
  let sheet = ss.getSheetByName(sheetName);
  if (sheet) {
    const lastCol = sheet.getLastColumn();
    const headers = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String) : [];
    const matches = PROGRESS_HEADERS.length === headers.length &&
      PROGRESS_HEADERS.every(function(h, i) { return headers[i] === h; });
    if (!matches) {
      sheet.setName(sheetName + '_archive_' + new Date().getTime());
      sheet = null;
    }
  }
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(PROGRESS_HEADERS);
    const header = sheet.getRange(1, 1, 1, PROGRESS_HEADERS.length);
    header.setFontWeight('bold').setBackground('#2A2A2A').setFontColor('#FFFFFF').setHorizontalAlignment('center');
    sheet.setFrozenRows(1);
    sheet.setFrozenColumns(3);
    sheet.setColumnWidth(COL['Email'],    220);
    sheet.setColumnWidth(COL['Name'],     150);
    sheet.setColumnWidth(COL['Mobile'],   130);
    sheet.setColumnWidth(COL['Status'],   170);
    sheet.setColumnWidth(COL['Progress'],  80);
    sheet.setColumnWidth(COL['Intro'],     46);
    for (var i = FIRST_SECTION_COL; i <= LAST_SECTION_COL; i++) sheet.setColumnWidth(i, 46);
    sheet.setColumnWidth(COL['Quiz Score'],    90);
    sheet.setColumnWidth(COL['Quiz Attempts'], 90);
    sheet.setColumnWidth(COL['First Login'],   170);
    sheet.setColumnWidth(COL['Started At'],    170);
    sheet.setColumnWidth(COL['Last Activity'], 170);
    sheet.setColumnWidth(COL['Completed At'],  170);
    sheet.setColumnWidth(COL['Session ID'],    180);
    sheet.getRange(2, COL['Intro'], sheet.getMaxRows() - 1, (LAST_SECTION_COL - COL['Intro'] + 1))
      .setHorizontalAlignment('center');
    sheet.getRange(1, COL['Quiz Score'], sheet.getMaxRows(), 1).setNumberFormat('@');
  }
  return sheet;
}

function findOrCreateUserRow(sheet, email, session, data, ts) {
  const last = sheet.getLastRow();
  if (last >= 2) {
    const emails   = sheet.getRange(2, COL['Email'],      last - 1, 1).getValues().flat().map(function(s) { return String(s).toLowerCase().trim(); });
    const sessions = sheet.getRange(2, COL['Session ID'], last - 1, 1).getValues().flat().map(String);
    for (var i = 0; i < emails.length; i++) {
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
  const current = String(sheet.getRange(row, COL['Status']).getValue() || '');
  if (current === STATUS.ABORTED) return;

  const introVal   = String(sheet.getRange(row, COL['Intro']).getValue()).trim();
  const introDone  = introVal === '✓';
  const sectionVals = sheet.getRange(row, FIRST_SECTION_COL, 1, LAST_SECTION_COL - FIRST_SECTION_COL + 1).getValues()[0];
  let sectionsDone = 0;
  for (var i = 0; i < sectionVals.length; i++) if (String(sectionVals[i]).trim() === '✓') sectionsDone++;

  const completedAt  = sheet.getRange(row, COL['Completed At']).getValue();
  const quizDisplay  = String(sheet.getRange(row, COL['Quiz Score']).getDisplayValue() || '');
  const quizScore    = quizDisplay.split('/');
  const scoreNum     = parseInt(quizScore[0], 10);
  const scoreTotal   = parseInt(quizScore[1], 10);
  const passThreshold = !isNaN(scoreTotal) ? Math.ceil(scoreTotal * 0.9) : 18;
  const passed       = !!completedAt || (!isNaN(scoreNum) && scoreNum >= passThreshold);

  var status;
  if (passed)                        status = STATUS.COMPLETED;
  else if (sectionsDone >= TOTAL_SECTIONS) status = STATUS.ASSESSMENT_PENDING;
  else if (introDone || sectionsDone > 0)  status = STATUS.IN_PROGRESS;
  else                               status = STATUS.NOT_STARTED;

  sheet.getRange(row, COL['Progress']).setValue(sectionsDone + '/' + TOTAL_SECTIONS);
  setStatus(sheet, row, status);
}

function setStatus(sheet, row, status) {
  const cell = sheet.getRange(row, COL['Status']);
  cell.setValue(status);
  const s = STATUS_STYLE[status] || STATUS_STYLE['Not Started'];
  cell.setBackground(s.bg).setFontColor(s.fg).setFontWeight('bold').setHorizontalAlignment('center');
}

// ─── One-time helpers ────────────────────────────────────────────────────────

/**
 * Run from the Apps Script editor to rebuild one region's Progress sheet
 * from the Events log. Pass 'APAC' or 'EUK'.
 */
function rebuildProgress(region) {
  region = (region || 'APAC').toUpperCase();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = 'Progress_' + region;
  const old = ss.getSheetByName(sheetName);
  if (old) ss.deleteSheet(old);
  const events = ss.getSheetByName('Events');
  if (!events) return;
  const data = events.getDataRange().getDisplayValues();
  // Events headers: Timestamp, Email, Name, Mobile, Region, Action, Detail, Session ID
  for (var i = 1; i < data.length; i++) {
    const r = data[i];
    if (String(r[4]).toUpperCase() !== region) continue;
    updateProgress(ss, r[0] || new Date().toISOString(), {
      email:      String(r[1] || ''),
      name:       String(r[2] || ''),
      mobile:     String(r[3] || ''),
      region:     String(r[4] || 'APAC'),
      action:     String(r[5] || ''),
      section:    String(r[6] || ''),
      session_id: String(r[7] || ''),
    });
  }
}

function rebuildProgressAPAC() { rebuildProgress('APAC'); }
function rebuildProgressEUK()  { rebuildProgress('EUK'); }
