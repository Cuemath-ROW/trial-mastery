/**
 * Cuemath Trial Mastery — Teacher Tracking Backend (V3.1)
 *
 * Deploy as a Google Apps Script Web App:
 * 1. Open the tracking Google Sheet
 * 2. Extensions → Apps Script
 * 3. Replace Code.gs with this file, save
 * 4. Deploy → Manage Deployments → pencil → New version → Deploy
 *    (the web app URL stays the same)
 *
 * V3.1 changes from V3:
 *   - APAC: 20 sections (A1–C7–E2), EUK: 19 sections (A1–C6–E2, no C7)
 *   - Each region gets its own Progress sheet schema — column count differs
 *   - All region-specific constants bundled via getRegionConfig(region)
 *   - ID_TO_LABEL mapping is now correct for EUK (uk_c1→D1, not C7)
 */

// ─── APAC: 20 sections ───────────────────────────────────────────────────────
const APAC_SECTIONS = [
  'a1','a2','a3','a4','a5',
  'u1','u2','u3',
  'b1','b2','b3','b4','b5','b6','b7',
  'c1','c2','c3',
  'd1','d2',
];
const APAC_LABELS = [
  'A1','A2','A3','A4','A5',
  'B1','B2','B3',
  'C1','C2','C3','C4','C5','C6','C7',
  'D1','D2','D3',
  'E1','E2',
];

// ─── EUK: 19 sections (uk_b2 intentionally absent) ──────────────────────────
const EUK_SECTIONS = [
  'uk_a1','uk_a2','uk_a3','uk_a4','uk_a5',
  'uk_u1','uk_u2','uk_u3',
  'uk_b1','uk_b3','uk_b4','uk_b5','uk_b6','uk_b7',
  'uk_c1','uk_c2','uk_c3',
  'uk_d1','uk_d2',
];
const EUK_LABELS = [
  'A1','A2','A3','A4','A5',
  'B1','B2','B3',
  'C1','C2','C3','C4','C5','C6',
  'D1','D2','D3',
  'E1','E2',
];

// Build ID → display label lookup covering both regions
const ID_TO_LABEL = {};
APAC_SECTIONS.forEach(function(id, i) { ID_TO_LABEL[id] = APAC_LABELS[i]; });
EUK_SECTIONS.forEach(function(id, i)  { ID_TO_LABEL[id] = EUK_LABELS[i]; });

// ─── Region config bundle ────────────────────────────────────────────────────
// Returns all schema constants for a given region in one object so every
// function stays region-agnostic and just passes cfg around.
function getRegionConfig(region) {
  const isEUK  = String(region).toUpperCase() === 'EUK';
  const labels = isEUK ? EUK_LABELS : APAC_LABELS;
  const total  = labels.length; // 19 for EUK, 20 for APAC
  const base   = ['Email','Name','Mobile','Region','Grade','Status','Progress','Intro'];
  const tail   = ['Quiz Score','Quiz Attempts','First Login','Started At','Last Activity','Completed At','Session ID'];
  const headers = base.concat(labels).concat(tail);
  const col = {};
  headers.forEach(function(h, i) { col[h] = i + 1; });
  return {
    total:           total,
    labels:          labels,
    headers:         headers,
    col:             col,
    firstSectionCol: col[labels[0]],
    lastSectionCol:  col[labels[labels.length - 1]],
  };
}

const STATUS = {
  NOT_STARTED:        'Not Started',
  IN_PROGRESS:        'In Progress',
  ASSESSMENT_PENDING: 'Assessment Pending',
  COMPLETED:          'Completed',
  ABORTED:            'Aborted',
};

const STATUS_STYLE = {
  'Not Started':        { bg: '#E5E5E5', fg: '#555555' },
  'In Progress':        { bg: '#FFF3CD', fg: '#856404' },
  'Assessment Pending': { bg: '#FFE0B2', fg: '#8A4A00' },
  'Completed':          { bg: '#D4EDDA', fg: '#155724' },
  'Aborted':            { bg: '#E9C7C2', fg: '#6D2222' },
};

const EVENTS_HEADERS = ['Timestamp','Email','Name','Mobile','Region','Grade','Action','Detail','Session ID'];

// ─── Web app entry points ────────────────────────────────────────────────────

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const data = JSON.parse(e.postData.contents);
    const ss   = SpreadsheetApp.getActiveSpreadsheet();
    const ts   = data.timestamp || new Date().toISOString();

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
    'Trial Mastery Tracking API V3.1 — APAC: 20 sections, EUK: 19 sections.'
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
    sheet.setColumnWidth(6, 120);
    sheet.setColumnWidth(7, 140);
    sheet.setColumnWidth(8, 180);
    sheet.setColumnWidth(9, 180);
  }
  sheet.getRange(1, 8, sheet.getMaxRows(), 1).setNumberFormat('@');
  sheet.appendRow([
    ts,
    data.email      || '',
    data.name       || '',
    data.mobile     || '',
    data.region     || 'APAC',
    data.grade      || '',
    data.action     || '',
    data.section    || '',
    data.session_id || '',
  ]);
}

// ─── Progress (per-user dashboard) ──────────────────────────────────────────

function updateProgress(ss, ts, data) {
  const region = String(data.region || 'APAC').toUpperCase() === 'EUK' ? 'EUK' : 'APAC';
  const cfg    = getRegionConfig(region);
  const sheet  = getOrCreateProgressSheet(ss, 'Progress ' + region, cfg);
  const email  = String(data.email || '').toLowerCase().trim();
  if (!email) return;
  const session = String(data.session_id || '');

  const row = findOrCreateUserRow(sheet, email, session, data, ts, cfg);

  sheet.getRange(row, cfg.col['Last Activity']).setValue(ts);
  if (data.name)   sheet.getRange(row, cfg.col['Name']).setValue(String(data.name));
  if (data.mobile) sheet.getRange(row, cfg.col['Mobile']).setValue(String(data.mobile));
  if (data.grade)  sheet.getRange(row, cfg.col['Grade']).setValue(String(data.grade));
  sheet.getRange(row, cfg.col['Region']).setValue(region);

  const action  = String(data.action  || '');
  const section = String(data.section || '').toLowerCase();

  if (action === 'reset') {
    const current = String(sheet.getRange(row, cfg.col['Status']).getValue() || '');
    if (current !== STATUS.COMPLETED) setStatus(sheet, row, STATUS.ABORTED, cfg);
    return;
  }

  if (action === 'acknowledge') {
    if (section === 'intro') {
      if (!sheet.getRange(row, cfg.col['Started At']).getValue()) {
        sheet.getRange(row, cfg.col['Started At']).setValue(ts);
      }
      sheet.getRange(row, cfg.col['Intro']).setValue('✓');
    } else if (ID_TO_LABEL[section] && cfg.col[ID_TO_LABEL[section]]) {
      sheet.getRange(row, cfg.col[ID_TO_LABEL[section]]).setValue('✓');
    }
  }

  if (action === 'quiz_score') {
    const parts    = (data.section || '').split('/');
    const newScore = parseInt(parts[0], 10);
    if (!isNaN(newScore)) {
      const total     = parts[1] || '20';
      const scoreCell = sheet.getRange(row, cfg.col['Quiz Score']);
      scoreCell.setNumberFormat('@');
      const prevDisplay = String(scoreCell.getDisplayValue() || '').split('/');
      const prev = parseInt(prevDisplay[0], 10);
      const best = isNaN(prev) ? newScore : Math.max(prev, newScore);
      scoreCell.setValue(best + '/' + total);
      const prevAttempts = parseInt(sheet.getRange(row, cfg.col['Quiz Attempts']).getValue(), 10) || 0;
      sheet.getRange(row, cfg.col['Quiz Attempts']).setValue(prevAttempts + 1);
    }
  }

  if (action === 'completed') {
    if (!sheet.getRange(row, cfg.col['Completed At']).getValue()) {
      sheet.getRange(row, cfg.col['Completed At']).setValue(ts);
    }
  }

  recomputeStatus(sheet, row, cfg);
}

function getOrCreateProgressSheet(ss, sheetName, cfg) {
  let sheet = ss.getSheetByName(sheetName);
  if (sheet) {
    const lastCol = sheet.getLastColumn();
    const headers = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String) : [];
    const matches = cfg.headers.length === headers.length &&
      cfg.headers.every(function(h, i) { return headers[i] === h; });
    if (!matches) {
      sheet.setName(sheetName + '_archive_' + new Date().getTime());
      sheet = null;
    }
  }
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(cfg.headers);
    const header = sheet.getRange(1, 1, 1, cfg.headers.length);
    header.setFontWeight('bold').setBackground('#2A2A2A').setFontColor('#FFFFFF').setHorizontalAlignment('center');
    sheet.setFrozenRows(1);
    sheet.setFrozenColumns(3);
    sheet.setColumnWidth(cfg.col['Email'],    220);
    sheet.setColumnWidth(cfg.col['Name'],     150);
    sheet.setColumnWidth(cfg.col['Mobile'],   130);
    sheet.setColumnWidth(cfg.col['Region'],    70);
    sheet.setColumnWidth(cfg.col['Grade'],    120);
    sheet.setColumnWidth(cfg.col['Status'],   170);
    sheet.setColumnWidth(cfg.col['Progress'],  80);
    sheet.setColumnWidth(cfg.col['Intro'],     46);
    for (var i = cfg.firstSectionCol; i <= cfg.lastSectionCol; i++) sheet.setColumnWidth(i, 46);
    sheet.setColumnWidth(cfg.col['Quiz Score'],    90);
    sheet.setColumnWidth(cfg.col['Quiz Attempts'], 90);
    sheet.setColumnWidth(cfg.col['First Login'],   170);
    sheet.setColumnWidth(cfg.col['Started At'],    170);
    sheet.setColumnWidth(cfg.col['Last Activity'], 170);
    sheet.setColumnWidth(cfg.col['Completed At'],  170);
    sheet.setColumnWidth(cfg.col['Session ID'],    180);
    sheet.getRange(2, cfg.col['Intro'], sheet.getMaxRows() - 1, (cfg.lastSectionCol - cfg.col['Intro'] + 1))
      .setHorizontalAlignment('center');
    sheet.getRange(1, cfg.col['Quiz Score'], sheet.getMaxRows(), 1).setNumberFormat('@');
  }
  return sheet;
}

function findOrCreateUserRow(sheet, email, session, data, ts, cfg) {
  const last = sheet.getLastRow();
  if (last >= 2) {
    const emails   = sheet.getRange(2, cfg.col['Email'],      last - 1, 1).getValues().flat().map(function(s) { return String(s).toLowerCase().trim(); });
    const sessions = sheet.getRange(2, cfg.col['Session ID'], last - 1, 1).getValues().flat().map(String);
    for (var i = 0; i < emails.length; i++) {
      if (emails[i] === email && sessions[i] === session) return i + 2;
    }
  }
  const row = last + 1;
  sheet.getRange(row, cfg.col['Email']).setValue(email);
  sheet.getRange(row, cfg.col['Name']).setValue(data.name || '');
  sheet.getRange(row, cfg.col['Mobile']).setValue(data.mobile || '');
  sheet.getRange(row, cfg.col['Region']).setValue(String(data.region || 'APAC').toUpperCase());
  sheet.getRange(row, cfg.col['Grade']).setValue(data.grade || '');
  sheet.getRange(row, cfg.col['Session ID']).setValue(session);
  sheet.getRange(row, cfg.col['First Login']).setValue(ts);
  sheet.getRange(row, cfg.col['Last Activity']).setValue(ts);
  sheet.getRange(row, cfg.col['Progress']).setValue('0/' + cfg.total);
  setStatus(sheet, row, STATUS.NOT_STARTED, cfg);
  return row;
}

function recomputeStatus(sheet, row, cfg) {
  const current = String(sheet.getRange(row, cfg.col['Status']).getValue() || '');
  if (current === STATUS.ABORTED) return;

  const introVal    = String(sheet.getRange(row, cfg.col['Intro']).getValue()).trim();
  const introDone   = introVal === '✓';
  const sectionVals = sheet.getRange(row, cfg.firstSectionCol, 1, cfg.lastSectionCol - cfg.firstSectionCol + 1).getValues()[0];
  let sectionsDone = 0;
  for (var i = 0; i < sectionVals.length; i++) if (String(sectionVals[i]).trim() === '✓') sectionsDone++;

  const completedAt  = sheet.getRange(row, cfg.col['Completed At']).getValue();
  const quizDisplay  = String(sheet.getRange(row, cfg.col['Quiz Score']).getDisplayValue() || '');
  const quizScore    = quizDisplay.split('/');
  const scoreNum     = parseInt(quizScore[0], 10);
  const scoreTotal   = parseInt(quizScore[1], 10);
  const passThreshold = !isNaN(scoreTotal) ? Math.ceil(scoreTotal * 0.9) : 18;
  const passed       = !!completedAt || (!isNaN(scoreNum) && scoreNum >= passThreshold);

  var status;
  if (passed)                             status = STATUS.COMPLETED;
  else if (sectionsDone >= cfg.total)     status = STATUS.ASSESSMENT_PENDING;
  else if (introDone || sectionsDone > 0) status = STATUS.IN_PROGRESS;
  else                                    status = STATUS.NOT_STARTED;

  sheet.getRange(row, cfg.col['Progress']).setValue(sectionsDone + '/' + cfg.total);
  setStatus(sheet, row, status, cfg);
}

function setStatus(sheet, row, status, cfg) {
  const cell = sheet.getRange(row, cfg.col['Status']);
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
  region = String(region || 'APAC').toUpperCase();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = 'Progress ' + region;
  const old = ss.getSheetByName(sheetName);
  if (old) ss.deleteSheet(old);
  const events = ss.getSheetByName('Events');
  if (!events) return;
  const data = events.getDataRange().getDisplayValues();
  // Events headers: Timestamp, Email, Name, Mobile, Region, Grade, Action, Detail, Session ID
  for (var i = 1; i < data.length; i++) {
    const r = data[i];
    if (String(r[4]).toUpperCase() !== region) continue;
    updateProgress(ss, r[0] || new Date().toISOString(), {
      email:      String(r[1] || ''),
      name:       String(r[2] || ''),
      mobile:     String(r[3] || ''),
      region:     String(r[4] || 'APAC'),
      grade:      String(r[5] || ''),
      action:     String(r[6] || ''),
      section:    String(r[7] || ''),
      session_id: String(r[8] || ''),
    });
  }
}

function rebuildProgressAPAC() { rebuildProgress('APAC'); }
function rebuildProgressEUK()  { rebuildProgress('EUK'); }
