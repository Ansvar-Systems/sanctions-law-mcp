import path from 'node:path';
import fs from 'node:fs';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { TOOLS, callTool } from '../src/tools/shared-tools.js';

/* ------------------------------------------------------------------ */
/*  WASM SQLite (Vercel serverless cannot run native C++ addons)      */
/* ------------------------------------------------------------------ */

let DatabaseSync: any;

const DB_PATH = path.join('/tmp', 'database.db');
const BUNDLED_DB = path.join(process.cwd(), 'data', 'database.db');

function ensureDb(): void {
  if (!fs.existsSync(DB_PATH)) {
    fs.copyFileSync(BUNDLED_DB, DB_PATH);
  }
}

function getWasmDb(): any {
  ensureDb();
  if (!DatabaseSync) {
    DatabaseSync = require('node-sqlite3-wasm').DatabaseSync;
  }
  return new DatabaseSync(DB_PATH, { readOnly: true });
}

/**
 * Create a better-sqlite3-compatible wrapper around the WASM database.
 * Prepares the statement once per db.prepare() call, then reuses it
 * for subsequent .get()/.all()/.run() calls on the same statement.
 */
function createDbProxy(wasmDb: any) {
  return {
    prepare(sql: string) {
      const stmt = wasmDb.prepare(sql);
      return {
        get(...params: any[]) {
          return params.length > 0 ? stmt.get(...params) : stmt.get();
        },
        all(...params: any[]) {
          return params.length > 0 ? stmt.all(...params) : stmt.all();
        },
        run(...params: any[]) {
          return params.length > 0 ? stmt.run(...params) : stmt.run();
        },
      };
    },
    pragma(_value: string) {
      // No-op for WASM readonly
    },
    close() {
      wasmDb.close();
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Vercel Streamable HTTP handler                                    */
/* ------------------------------------------------------------------ */

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // CORS preflight for Claude.ai / ChatGPT
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, Mcp-Session-Id',
      'Access-Control-Expose-Headers': 'Mcp-Session-Id',
    });
    res.end();
    return;
  }

  const server = new Server(
    { name: 'eu.ansvar/sanctions-law', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  const wasmDb = getWasmDb();
  const db = createDbProxy(wasmDb) as any;

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      const result = await callTool(db, name, (args ?? {}) as Record<string, unknown>);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error handling ${name}: ${message}`,
          },
        ],
        isError: true,
      };
    }
  });

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');

  await server.connect(transport);
  await transport.handleRequest(req, res);

  wasmDb.close();
}
