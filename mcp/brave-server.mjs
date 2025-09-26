import axios from 'axios';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio';

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
      type: 'object',
      properties: {
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              url: { type: 'string' },
              description: { type: 'string' },
            },
            required: ['title', 'url'],
          },
        },
      },
      required: ['results'],
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

