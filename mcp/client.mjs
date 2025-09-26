import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { Client } from '@modelcontextprotocol/sdk/client';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let clientInstance = null;
let transportInstance = null;
let connectingPromise = null;

async function ensureClient() {
  if (clientInstance) return clientInstance;
  if (connectingPromise) return connectingPromise;

  connectingPromise = (async () => {
    const serverPath = resolve(__dirname, './brave-server.mjs');

    transportInstance = new StdioClientTransport({
      command: process.execPath,
      args: [serverPath],
      env: { BRAVE_API_KEY: process.env.BRAVE_API_KEY },
      stderr: 'pipe',
      cwd: process.cwd(),
    });

    const client = new Client({ name: 'NeezsPilot-MCP-Client', version: '0.1.0' });
    await client.connect(transportInstance);
    clientInstance = client;
    return client;
  })();

  try {
    const c = await connectingPromise;
    return c;
  } finally {
    connectingPromise = null;
  }
}

export async function braveMcpSearch(query, count = 5, options = {}) {
  const c = await ensureClient();
  // Warm the tool cache so output validation can apply if defined
  try {
    await c.listTools();
  } catch (_) {
    // non-fatal
  }
  const args = { query, count, ...options };
  const result = await c.callTool({ name: 'brave.search', arguments: args });
  if (result.isError) return [];

  if (result.structuredContent && result.structuredContent.results) {
    return result.structuredContent.results;
  }

  // Fallback to parse text content when structured content not present
  const textBlock = (result.content || []).find((b) => b.type === 'text');
  if (!textBlock?.text) return [];

  // Very simple parse: expect lines separated by blank lines
  const lines = textBlock.text.split('\n');
  const items = [];
  let buf = [];
  for (const line of lines) {
    if (line.trim() === '') {
      if (buf.length) {
        const [titleLine, descLine, urlLine] = buf;
        items.push({
          title: titleLine?.replace(/^\d+\.\s*/, '')?.trim() || '',
          description: descLine?.trim() || '',
          url: urlLine?.trim() || '',
        });
        buf = [];
      }
    } else {
      buf.push(line);
    }
  }
  if (buf.length) {
    const [titleLine, descLine, urlLine] = buf;
    items.push({
      title: titleLine?.replace(/^\d+\.\s*/, '')?.trim() || '',
      description: descLine?.trim() || '',
      url: urlLine?.trim() || '',
    });
  }
  return items;
}

export async function closeMcp() {
  try {
    await transportInstance?.close?.();
  } catch (_) {}
  try {
    await clientInstance?.close?.();
  } catch (_) {}
  clientInstance = null;
  transportInstance = null;
}
