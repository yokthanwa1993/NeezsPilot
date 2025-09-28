const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const SPREADSHEET_ID = process.env.TODO_SHEETS_SPREADSHEET_ID || process.env.GOOGLE_SHEETS_SPREADSHEET_ID || '';
const SHEET_NAME = process.env.TODO_SHEETS_SHEET_NAME || process.env.GOOGLE_SHEETS_SHEET_NAME || 'To-do list';
const MODE = (process.env.TODO_SHEETS_MODE || 'table').toLowerCase(); // 'table' | 'template'
const TEMPLATE_START_ROW = parseInt(process.env.TODO_SHEETS_TEMPLATE_START_ROW || '3', 10);
const TEMPLATE_RANGE = process.env.TODO_SHEETS_TEMPLATE_RANGE || 'A:C';

function getSheetsClient() {
  // Support service account via file, raw JSON, or env pair
  const keyFile = process.env.TODO_SHEETS_SERVICE_ACCOUNT_KEY_FILE || process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
  const keyJson = process.env.TODO_SHEETS_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  let clientEmail = process.env.GOOGLE_CLIENT_EMAIL || process.env.GOOGLE_TASKS_CLIENT_EMAIL;
  let privateKey = process.env.GOOGLE_PRIVATE_KEY || process.env.GOOGLE_TASKS_PRIVATE_KEY || '';
  const preferFile = /^1|true|yes$/i.test(String(process.env.TODO_SHEETS_PREFER_KEY_FILE || ''));
  if ((keyFile || keyJson) && (preferFile || !clientEmail || !privateKey)) {
    try {
      let obj;
      if (keyFile) {
        const filePath = path.resolve(process.cwd(), keyFile);
        obj = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } else {
        obj = JSON.parse(keyJson);
      }
      clientEmail = clientEmail || obj.client_email;
      privateKey = privateKey || obj.private_key;
    } catch (e) {
      throw new Error(`อ่าน service-account-key ไม่ได้: ${e.message || e}`);
    }
  }
  if (privateKey && privateKey.includes('\\n')) privateKey = privateKey.replace(/\\n/g, '\n');
  if (!clientEmail || !privateKey) {
    throw new Error('Missing GOOGLE_CLIENT_EMAIL or GOOGLE_PRIVATE_KEY for Google Sheets');
  }
  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

function quoteSheet(sheetName) {
  const needsQuote = /[^A-Za-z0-9_]/.test(sheetName);
  return needsQuote ? `'${String(sheetName).replace(/'/g, "''")}'` : sheetName;
}

function a1(range) {
  return `${quoteSheet(SHEET_NAME)}!${range}`;
}

function getNowIso() {
  return new Date().toISOString();
}

// Ensure header row exists
async function ensureHeaders() {
  if (MODE === 'template') return; // template sheet manages its own header
  const sheets = getSheetsClient();
  const headerRange = a1('A1:H1');
  try {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: headerRange });
    const values = res.data.values || [];
    if (values.length && values[0] && values[0].length) return; // already has headers
  } catch (_) {}
  const headers = [['id','chatKey','status','text','createdAt','createdBy','doneAt','deleted']];
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: headerRange,
    valueInputOption: 'RAW',
    requestBody: { values: headers },
  });
}

function chatKeyFromSource(source) {
  if (!source) return 'unknown';
  if (source.groupId) return `group:${source.groupId}`;
  if (source.roomId) return `room:${source.roomId}`;
  if (source.userId) return `user:${source.userId}`;
  return 'unknown';
}

async function addTodoForSource(source, { text, userId }) {
  if (!SPREADSHEET_ID) throw new Error('Missing TODO_SHEETS_SPREADSHEET_ID');
  if (MODE === 'template') {
    return await addTodoTemplate({ text });
  } else {
    await ensureHeaders();
    const sheets = getSheetsClient();
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const chatKey = chatKeyFromSource(source);
    const row = [id, chatKey, 'open', (text || '').trim(), getNowIso(), userId || '', '', ''];
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: a1('A1:H1'),
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });
    return { id, text: row[3], createdAt: row[4], userId: row[5] };
  }
}

async function listTodosForSource(source, { limit = 20, includeDone = false } = {}) {
  if (!SPREADSHEET_ID) throw new Error('Missing TODO_SHEETS_SPREADSHEET_ID');
  if (MODE === 'template') {
    const sheets = getSheetsClient();
    const start = TEMPLATE_START_ROW;
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: a1(`${TEMPLATE_RANGE}${start === 1 ? '' : ''}`.replace(/([A-Z]:[A-Z])$/, `$1`)),
      valueRenderOption: 'UNFORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING',
    });
    const values = res.data.values || [];
    const rows = [];
    for (let i = 0; i < values.length; i++) {
      const [done, date, task] = values[i] || [];
      if ((done === undefined && date === undefined && task === undefined) || task === undefined) continue;
      const status = String(done).toUpperCase() === 'TRUE' ? 'done' : 'open';
      if (!includeDone && status !== 'open') continue;
      rows.push({ id: `${start + i}`, text: task, createdAt: date, status });
    }
    return limit && limit > 0 ? rows.slice(-limit) : rows;
  } else {
    await ensureHeaders();
    const sheets = getSheetsClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: a1('A2:H2000'),
      valueRenderOption: 'UNFORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING',
    });
    const values = res.data.values || [];
    const chatKey = chatKeyFromSource(source);
    const items = [];
    for (const row of values) {
      const [id, ck, status, text, createdAt, createdBy, doneAt, deleted] = row;
      if (!id) continue;
      if (ck !== chatKey) continue;
      if (deleted === '1' || deleted === 1 || deleted === true) continue;
      if (!includeDone && String(status || '').toLowerCase() !== 'open') continue;
      items.push({ id, text, createdAt, createdBy, status, doneAt });
    }
    return limit && limit > 0 ? items.slice(-limit) : items;
  }
}

async function findRowById(id) {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: a1('A2:A2000') });
  const values = res.data.values || [];
  for (let i = 0; i < values.length; i++) {
    if ((values[i] || [])[0] === id) {
      return 2 + i; // row number in sheet
    }
  }
  return null;
}

async function markDoneById(id, done = true) {
  if (!SPREADSHEET_ID) throw new Error('Missing TODO_SHEETS_SPREADSHEET_ID');
  if (MODE === 'template') {
    // For template mode, id is row number string
    const rowNum = parseInt(id, 10);
    if (!rowNum || rowNum < TEMPLATE_START_ROW) throw new Error('id ไม่ถูกต้อง');
    const sheets = getSheetsClient();
    const range = a1(`A${rowNum}:A${rowNum}`); // checkbox column
    const value = done ? 'TRUE' : 'FALSE';
    await sheets.spreadsheets.values.update({ spreadsheetId: SPREADSHEET_ID, range, valueInputOption: 'USER_ENTERED', requestBody: { values: [[value]] } });
    return { id, status: done ? 'done' : 'open', doneAt: done ? getNowIso() : '' };
  }
  await ensureHeaders();
  const rowNum = await findRowById(id);
  if (!rowNum) throw new Error('ไม่พบรายการนี้');
  const sheets = getSheetsClient();
  const status = done ? 'done' : 'open';
  const doneAt = done ? getNowIso() : '';
  // Update columns C (status) and G (doneAt)
  const range = a1(`C${rowNum}:G${rowNum}`);
  const values = [[status, null, null, doneAt, null].map(v => (v === null ? '' : v))];
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range,
    valueInputOption: 'RAW',
    requestBody: { values },
  });
  return { id, status, doneAt };
}

async function deleteById(id) {
  if (!SPREADSHEET_ID) throw new Error('Missing TODO_SHEETS_SPREADSHEET_ID');
  if (MODE === 'template') {
    // Soft clear row values A:C for the given row number
    const rowNum = parseInt(id, 10);
    if (!rowNum || rowNum < TEMPLATE_START_ROW) throw new Error('id ไม่ถูกต้อง');
    const sheets = getSheetsClient();
    const range = a1(`A${rowNum}:C${rowNum}`);
    await sheets.spreadsheets.values.clear({ spreadsheetId: SPREADSHEET_ID, range });
    return { id, deleted: true };
  }
  await ensureHeaders();
  const rowNum = await findRowById(id);
  if (!rowNum) throw new Error('ไม่พบรายการนี้');
  const sheets = getSheetsClient();
  // Set deleted flag (H column) to 1
  const range = a1(`H${rowNum}:H${rowNum}`);
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range,
    valueInputOption: 'RAW',
    requestBody: { values: [['1']] },
  });
  return { id, deleted: true };
}

module.exports = {
  addTodoForSource,
  listTodosForSource,
  markDoneById,
  deleteById,
};

// Helpers for template mode
async function getSheetIdByName(title) {
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: 'sheets(properties(sheetId,title))' });
  const s = (meta.data.sheets || []).find(x => x.properties?.title === title);
  if (!s) throw new Error(`ไม่พบชีตชื่อ ${title}`);
  return s.properties.sheetId;
}

async function getNextTemplateRow() {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: a1(`A${TEMPLATE_START_ROW}:A`) });
  const rows = res.data.values || [];
  return TEMPLATE_START_ROW + rows.length; // next empty row
}

async function copyFormatFromRow3(targetRow) {
  try {
    const sheets = getSheetsClient();
    const sheetId = await getSheetIdByName(SHEET_NAME);
    const requests = [{
      copyPaste: {
        source: { sheetId, startRowIndex: TEMPLATE_START_ROW - 1, endRowIndex: TEMPLATE_START_ROW, startColumnIndex: 0, endColumnIndex: 3 },
        destination: { sheetId, startRowIndex: targetRow - 1, endRowIndex: targetRow, startColumnIndex: 0, endColumnIndex: 3 },
        pasteType: 'PASTE_FORMAT',
      }
    }];
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { requests } });
  } catch (_) {
    // ignore formatting errors
  }
}

async function addTodoTemplate({ text }) {
  const sheets = getSheetsClient();
  const sheetId = await getSheetIdByName(SHEET_NAME);
  // Insert a new row at row 3 (TEMPLATE_START_ROW), shifting others down.
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [{
        insertDimension: {
          range: { sheetId, dimension: 'ROWS', startIndex: TEMPLATE_START_ROW - 1, endIndex: TEMPLATE_START_ROW },
          inheritFromBefore: false,
        }
      }]
    }
  });
  // Copy format from the row that used to be row 3 (now row 4) into the new row 3
  await copyFormatFromRowToRow(TEMPLATE_START_ROW + 1, TEMPLATE_START_ROW);
  // Write values to row 3
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;
  const range = a1(`A${TEMPLATE_START_ROW}:C${TEMPLATE_START_ROW}`);
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[ 'FALSE', dateStr, (text || '').trim() ]] },
  });
  return { id: `${TEMPLATE_START_ROW}`, text, createdAt: dateStr };
}

async function ensureEnoughRows(targetRow) {
  try {
    const sheets = getSheetsClient();
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: 'sheets(properties(sheetId,title,gridProperties(rowCount)))' });
    const s = (meta.data.sheets || []).find(x => x.properties?.title === SHEET_NAME);
    if (!s) return;
    const sheetId = s.properties.sheetId;
    const current = s.properties.gridProperties?.rowCount || 1000;
    if (targetRow <= current) return;
    const toAppend = targetRow - current;
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { requests: [{
      appendDimension: { sheetId, dimension: 'ROWS', length: toAppend }
    }] } });
  } catch (_) {}
}

async function copyFormatFromRowToRow(sourceRow, targetRow) {
  try {
    const sheets = getSheetsClient();
    const sheetId = await getSheetIdByName(SHEET_NAME);
    const requests = [{
      copyPaste: {
        source: { sheetId, startRowIndex: sourceRow - 1, endRowIndex: sourceRow, startColumnIndex: 0, endColumnIndex: 3 },
        destination: { sheetId, startRowIndex: targetRow - 1, endRowIndex: targetRow, startColumnIndex: 0, endColumnIndex: 3 },
        pasteType: 'PASTE_FORMAT',
      }
    }];
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { requests } });
  } catch (_) {}
}
