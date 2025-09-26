import axios from 'axios';
import { z } from 'zod';
// Use CJS build via createRequire to avoid subpath export issues on Node 18
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const sdkCjsDir = resolve(__dirname, '../node_modules/@modelcontextprotocol/sdk/dist/cjs');
const { McpServer } = require(resolve(sdkCjsDir, 'server/mcp.js'));
const { StdioServerTransport } = require(resolve(sdkCjsDir, 'server/stdio.js'));

const server = new McpServer({ name: 'BraveSearchMCP', version: '0.1.0' });

server.registerTool(
  'brave.search',
  {
    title: 'Brave Search',
    description: 'Search the web using Brave Search API and return top results.',
    inputSchema: {
      // Zod raw shape; SDK wraps with z.object for JSON Schema conversion
      query: z.string(),
      count: z.number().int().min(1).max(10).optional(),
      mkt: z.string().optional(),
      safesearch: z.enum(['off', 'moderate', 'strict']).optional(),
    },
    outputSchema: {
      results: z.array(z.object({
        title: z.string(),
        url: z.string(),
        description: z.string().optional(),
      })),
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
    },
  },
  async ({ query, count = 5, mkt = 'th-TH', safesearch = 'moderate' }) => {
    const apiKey = process.env.BRAVE_API_KEY;
    if (!apiKey) {
      return {
        content: [{ type: 'text', text: 'BRAVE_API_KEY is not set' }],
        isError: true,
      };
    }

    try {
      const response = await axios.get('https://api.search.brave.com/res/v1/web/search', {
        params: { q: query, count, offset: 0, mkt, safesearch },
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': apiKey,
        },
      });

      const results = (response.data.web?.results || []).map((r) => ({
        title: r.title,
        url: r.url,
        description: r.description || '',
      }));

      const text = results
        .map((r, i) => `${i + 1}. ${r.title}\n   ${r.description}\n   ${r.url}`)
        .join('\n\n');

      return {
        content: text ? [{ type: 'text', text }] : [],
        structuredContent: { results },
      };
    } catch (error) {
      const msg = error?.response?.data || error?.message || String(error);
      return {
        content: [{ type: 'text', text: `Error calling Brave Search API: ${msg}` }],
        isError: true,
      };
    }
  },
);

await server.connect(new StdioServerTransport());
