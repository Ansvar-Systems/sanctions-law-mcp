import type { IncomingMessage, ServerResponse } from 'node:http';

export default function handler(_req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify({
    status: 'ok',
    name: 'Sanctions Law MCP',
    version: '0.1.0',
    category: 'threat_intel',
    stats: {
      tools: 11,
      sources: 7,
      provisions: 1280,
      executive_orders: 174,
      case_law: 124,
      export_controls: 97,
    },
    transport: 'streamable-http',
    endpoint: '/mcp',
  }));
}
