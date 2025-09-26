// MCP client for Google Sheets server
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sdkCjsDir = resolve(__dirname, '../node_modules/@modelcontextprotocol/sdk/dist/cjs');
const { Client } = require(resolve(sdkCjsDir, 'client/index.js'));
const { StdioClientTransport } = require(resolve(sdkCjsDir, 'client/stdio.js'));

let clientInstance = null;
let transportInstance = null;
let connectingPromise = null;

async function ensureClient() {
  if (clientInstance) return clientInstance;
  if (connectingPromise) return connectingPromise;

  connectingPromise = (async () => {
    const serverPath = resolve(__dirname, './google-sheets-server.mjs');
    transportInstance = new StdioClientTransport({
      command: process.execPath,
      args: [serverPath],
      env: {
        GOOGLE_CLIENT_EMAIL: process.env.GOOGLE_CLIENT_EMAIL,
        GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY,
      },
      stderr: 'pipe',
      cwd: process.cwd(),
    });
    const client = new Client({ name: 'NeezsPilot-Sheets-MCP-Client', version: '0.1.0' });
    await client.connect(transportInstance);
    clientInstance = client;
    return client;
  })();

  try {
    return await connectingPromise;
  } finally {
    connectingPromise = null;
  }
}

export async function sheetsReadRange(spreadsheetId, range) {
  const c = await ensureClient();
  try { await c.listTools(); } catch {}
  const result = await c.callTool({ name: 'sheets.readRange', arguments: { spreadsheetId, range } });
  return result.structuredContent?.values || [];
}

export async function sheetsSummaryByMonth(params) {
  const c = await ensureClient();
  try { await c.listTools(); } catch {}
  const result = await c.callTool({ name: 'sheets.summaryByMonth', arguments: params });
  return result.structuredContent;
}

export async function getSheetsMcpStatus() {
  if (!clientInstance) {
    try { await ensureClient(); } catch {}
  }
  const status = {
    connected: !!clientInstance,
    pid: transportInstance?.pid ?? null,
    serverInfo: null,
    tools: [],
  };
  if (!clientInstance) return status;
  try { status.serverInfo = clientInstance.getServerVersion?.() ?? null; } catch {}
  try {
    const res = await clientInstance.listTools();
    status.tools = (res.tools || []).map(t => ({ name: t.name, title: t.title || t.name }));
  } catch {}
  return status;
}

export async function closeSheetsMcp() {
  try { await transportInstance?.close?.(); } catch {}
  try { await clientInstance?.close?.(); } catch {}
  clientInstance = null;
  transportInstance = null;
}

export async function driveListSpreadsheets({ query, pageSize = 10, pageToken } = {}) {
  const c = await ensureClient();
  try { await c.listTools(); } catch {}
  const res = await c.callTool({ name: 'drive.listSpreadsheets', arguments: { query, pageSize, pageToken } });
  return res.structuredContent;
}

export async function sheetsListTabs(spreadsheetId) {
  const c = await ensureClient();
  try { await c.listTools(); } catch {}
  const res = await c.callTool({ name: 'sheets.listTabs', arguments: { spreadsheetId } });
  return res.structuredContent?.sheets || [];
}

export async function sheetsPreview(spreadsheetId, sheetName, opts = {}) {
  const c = await ensureClient();
  try { await c.listTools(); } catch {}
  const res = await c.callTool({ name: 'sheets.preview', arguments: { spreadsheetId, sheetName, ...opts } });
  return res.structuredContent || {};
}
