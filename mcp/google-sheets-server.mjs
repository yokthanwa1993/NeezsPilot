import { google } from 'googleapis';
import { z } from 'zod';
// Use CJS build of MCP SDK on Node 18
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const sdkCjsDir = resolve(__dirname, '../node_modules/@modelcontextprotocol/sdk/dist/cjs');
const { McpServer } = require(resolve(sdkCjsDir, 'server/mcp.js'));
const { StdioServerTransport } = require(resolve(sdkCjsDir, 'server/stdio.js'));

function getSheetsClient() {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  let privateKey = process.env.GOOGLE_PRIVATE_KEY || '';
  if (privateKey.includes('\\n')) privateKey = privateKey.replace(/\\n/g, '\n');
  if (!clientEmail || !privateKey) {
    throw new Error('Missing GOOGLE_CLIENT_EMAIL or GOOGLE_PRIVATE_KEY');
  }
  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets.readonly',
      'https://www.googleapis.com/auth/drive.readonly',
    ],
  });
  return google.sheets({ version: 'v4', auth });
}

function getDriveClient() {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  let privateKey = process.env.GOOGLE_PRIVATE_KEY || '';
  if (privateKey.includes('\\n')) privateKey = privateKey.replace(/\\n/g, '\n');
  if (!clientEmail || !privateKey) {
    throw new Error('Missing GOOGLE_CLIENT_EMAIL or GOOGLE_PRIVATE_KEY');
  }
  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  return google.drive({ version: 'v3', auth });
}

const server = new McpServer({ name: 'GoogleSheetsMCP', version: '0.1.0' });

// Tool: sheets.readRange
server.registerTool(
  'sheets.readRange',
  {
    title: 'Read Google Sheets Range',
    description: 'Read values from a Google Sheet range (A1 notation).',
    inputSchema: {
      spreadsheetId: z.string(),
      range: z.string(), // e.g., 'Sheet1!A1:F100'
    },
    outputSchema: {
      values: z.array(z.array(z.string().nullable())).optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ spreadsheetId, range }) => {
    try {
      const sheets = getSheetsClient();
      const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
      const values = res.data.values || [];
      return {
        content: [],
        structuredContent: { values },
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Sheets API error: ${err.message || String(err)}` }],
        isError: true,
      };
    }
  }
);

// Tool: drive.listSpreadsheets
server.registerTool(
  'drive.listSpreadsheets',
  {
    title: 'List Google Drive Spreadsheets',
    description: 'List spreadsheets in Google Drive accessible by the service account.',
    inputSchema: {
      query: z.string().optional(), // Drive API query
      pageSize: z.number().int().min(1).max(100).default(10),
      pageToken: z.string().optional(),
    },
    outputSchema: {
      files: z.array(z.object({
        id: z.string(),
        name: z.string(),
        modifiedTime: z.string().optional(),
        webViewLink: z.string().optional(),
        owners: z.array(z.object({ displayName: z.string().optional(), emailAddress: z.string().optional() })).optional(),
      })),
      nextPageToken: z.string().optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ query, pageSize = 10, pageToken }) => {
    try {
      const drive = getDriveClient();
      const q = ["mimeType='application/vnd.google-apps.spreadsheet'", query].filter(Boolean).join(' and ');
      const res = await drive.files.list({
        q,
        pageSize,
        pageToken,
        fields: 'nextPageToken, files(id, name, modifiedTime, webViewLink, owners(displayName, emailAddress))',
        orderBy: 'modifiedTime desc',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      return { content: [], structuredContent: { files: res.data.files || [], nextPageToken: res.data.nextPageToken } };
    } catch (err) {
      return { content: [{ type: 'text', text: `Drive list error: ${err.message || String(err)}` }], isError: true };
    }
  }
);

// Tool: sheets.listTabs
server.registerTool(
  'sheets.listTabs',
  {
    title: 'List tabs (sheets) in spreadsheet',
    description: 'List sheet titles within a spreadsheet',
    inputSchema: { spreadsheetId: z.string() },
    outputSchema: { sheets: z.array(z.object({ sheetId: z.number().optional(), title: z.string() })) },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ spreadsheetId }) => {
    try {
      const sheets = getSheetsClient();
      const res = await sheets.spreadsheets.get({ spreadsheetId });
      const list = (res.data.sheets || []).map(s => ({ sheetId: s.properties?.sheetId, title: s.properties?.title || '' }));
      return { content: [], structuredContent: { sheets: list } };
    } catch (err) {
      return { content: [{ type: 'text', text: `Sheets listTabs error: ${err.message || String(err)}` }], isError: true };
    }
  }
);

// Tool: sheets.preview
server.registerTool(
  'sheets.preview',
  {
    title: 'Preview top rows in a sheet',
    description: 'Return first N rows from a sheet for preview',
    inputSchema: {
      spreadsheetId: z.string(),
      sheetName: z.string(),
      maxCols: z.number().int().min(1).max(26).default(10),
      maxRows: z.number().int().min(1).max(50).default(5),
      headerRow: z.number().int().default(1),
    },
    outputSchema: {
      headers: z.array(z.string()).optional(),
      rows: z.array(z.array(z.string().nullable())).optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ spreadsheetId, sheetName, maxCols = 10, maxRows = 5, headerRow = 1 }) => {
    try {
      const sheets = getSheetsClient();
      const endCol = String.fromCharCode('A'.charCodeAt(0) + maxCols - 1);
      const range = `${sheetName}!A${headerRow}:${endCol}${headerRow + maxRows}`;
      const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
      const values = res.data.values || [];
      const headers = values[0] || [];
      const rows = values.slice(1);
      return { content: [], structuredContent: { headers, rows } };
    } catch (err) {
      return { content: [{ type: 'text', text: `Sheets preview error: ${err.message || String(err)}` }], isError: true };
    }
  }
);

// Tool: sheets.summaryByMonth
server.registerTool(
  'sheets.summaryByMonth',
  {
    title: 'Monthly Income/Expense Summary',
    description: 'Summarize income and expense for given month/year from a sheet.',
    inputSchema: {
      spreadsheetId: z.string(),
      sheetName: z.string(),
      dateCol: z.string().default('A'),
      typeCol: z.string().default('B'),
      amountCol: z.string().default('C'),
      year: z.number().int(),
      month: z.number().int().min(1).max(12),
      headerRow: z.number().int().default(1),
      lastRow: z.number().int().default(2000),
    },
    outputSchema: {
      year: z.number(),
      month: z.number(),
      income: z.number(),
      expense: z.number(),
      net: z.number(),
      rows: z.array(
        z.object({ date: z.string(), type: z.string(), amount: z.number() })
      ).optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ spreadsheetId, sheetName, dateCol = 'A', typeCol = 'B', amountCol = 'C', year, month, headerRow = 1, lastRow = 2000 }) => {
    try {
      const col = (c) => c.toUpperCase();
      const range = `${sheetName}!${col(dateCol)}${headerRow}:${col(amountCol)}${lastRow}`;
      const sheets = getSheetsClient();
      const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
      const values = res.data.values || [];
      // Assuming columns are consecutive: dateCol .. amountCol
      const startIdx = col(dateCol).charCodeAt(0) - 'A'.charCodeAt(0);
      const typeIdx = col(typeCol).charCodeAt(0) - 'A'.charCodeAt(0);
      const amtIdx = col(amountCol).charCodeAt(0) - 'A'.charCodeAt(0);
      let income = 0, expense = 0;
      const rows = [];
      for (let i = 1; i < values.length; i++) { // skip header
        const row = values[i] || [];
        const dateStr = row[startIdx] || '';
        const typeStr = (row[typeIdx] || '').toString().toLowerCase();
        const amtNum = parseFloat((row[amtIdx] || '0').toString().replace(/[,\s]/g, '')) || 0;
        const d = new Date(dateStr);
        if (!isNaN(d) && d.getFullYear() === year && (d.getMonth() + 1) === month) {
          const isIncome = /รับ|income|in/i.test(typeStr);
          if (isIncome) income += amtNum; else expense += amtNum;
          rows.push({ date: dateStr, type: row[typeIdx] || '', amount: amtNum });
        }
      }
      return {
        content: [],
        structuredContent: { year, month, income, expense, net: income - expense, rows },
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Sheets summary error: ${err.message || String(err)}` }],
        isError: true,
      };
    }
  }
);

await server.connect(new StdioServerTransport());
