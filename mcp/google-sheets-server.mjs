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
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  return google.sheets({ version: 'v4', auth });
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

