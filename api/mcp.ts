import path from 'node:path';
import fs from 'node:fs';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { about } from '../src/tools/about.js';
import { checkCyberSanctions, type CheckCyberSanctionsInput } from '../src/tools/check-cyber-sanctions.js';
import { checkDataFreshness, type CheckDataFreshnessInput } from '../src/tools/check-data-freshness.js';
import { getDelistingProcedure, type GetDelistingProcedureInput } from '../src/tools/get-delisting-procedure.js';
import { getExecutiveOrder, type GetExecutiveOrderInput } from '../src/tools/get-executive-order.js';
import { getExportControl, type GetExportControlInput } from '../src/tools/get-export-control.js';
import { getProvision, type GetProvisionInput } from '../src/tools/get-provision.js';
import { getSanctionsRegime, type GetSanctionsRegimeInput } from '../src/tools/get-sanctions-regime.js';
import { listSources, type ListSourcesInput } from '../src/tools/list-sources.js';
import { searchSanctionsCaseLaw, type SearchSanctionsCaseLawInput } from '../src/tools/search-sanctions-case-law.js';
import { searchSanctionsLaw, type SearchSanctionsLawInput } from '../src/tools/search-sanctions-law.js';

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
 * Create a better-sqlite3-compatible wrapper around the WASM database
 * so that existing tool functions (which expect db.prepare(sql).get() etc.)
 * work without modification.
 */
function createDbProxy(wasmDb: any) {
  return {
    prepare(sql: string) {
      return {
        get(...params: any[]) {
          const stmt = wasmDb.prepare(sql);
          if (params.length > 0) {
            return stmt.get(...params);
          }
          return stmt.get();
        },
        all(...params: any[]) {
          const stmt = wasmDb.prepare(sql);
          if (params.length > 0) {
            return stmt.all(...params);
          }
          return stmt.all();
        },
        run(...params: any[]) {
          const stmt = wasmDb.prepare(sql);
          if (params.length > 0) {
            return stmt.run(...params);
          }
          return stmt.run();
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
/*  Tool definitions (mirrored from src/index.ts)                     */
/* ------------------------------------------------------------------ */

const TOOLS: Tool[] = [
  {
    name: 'search_sanctions_law',
    description:
      'Full-text search across sanctions legal provisions and guidance. Supports source, jurisdiction, regime, and topic filters.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search text or keywords (required).' },
        source_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional source filters, e.g., ["EU_RESTRICTIVE_MEASURES"].',
        },
        jurisdictions: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional jurisdiction filters, e.g., ["EU", "US"].',
        },
        regime_id: { type: 'string', description: 'Optional sanctions regime id filter.' },
        topics: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional topic filters, e.g., ["cyber", "asset_freeze"].',
        },
        limit: { type: 'number', description: 'Maximum rows to return. Default 10, max 50.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_provision',
    description: 'Get a specific sanctions provision by source and item id, with optional related provisions.',
    inputSchema: {
      type: 'object',
      properties: {
        source_id: { type: 'string' },
        item_id: { type: 'string' },
        include_related: { type: 'boolean' },
      },
      required: ['source_id', 'item_id'],
    },
  },
  {
    name: 'get_sanctions_regime',
    description: 'Retrieve sanctions regime metadata, legal basis, and optional representative provisions.',
    inputSchema: {
      type: 'object',
      properties: {
        regime_id: { type: 'string' },
        name: { type: 'string' },
        jurisdiction: { type: 'string' },
        include_provisions: { type: 'boolean' },
        limit: { type: 'number' },
      },
      required: [],
    },
  },
  {
    name: 'get_executive_order',
    description: 'Return executive order details by EO number (or id), including optional related provisions.',
    inputSchema: {
      type: 'object',
      properties: {
        order_number: { type: 'string' },
        include_related_provisions: { type: 'boolean' },
      },
      required: ['order_number'],
    },
  },
  {
    name: 'check_cyber_sanctions',
    description: 'Find cyber-related sanctions regimes, executive orders, and provisions.',
    inputSchema: {
      type: 'object',
      properties: {
        jurisdiction: { type: 'string' },
        query: { type: 'string' },
        limit: { type: 'number' },
      },
      required: [],
    },
  },
  {
    name: 'get_delisting_procedure',
    description: 'Retrieve delisting or reconsideration procedures by regime id or procedure id.',
    inputSchema: {
      type: 'object',
      properties: {
        regime_id: { type: 'string' },
        procedure_id: { type: 'string' },
        limit: { type: 'number' },
      },
      required: [],
    },
  },
  {
    name: 'get_export_control',
    description: 'List export-control provisions relevant to sanctions by jurisdiction, section, or text query.',
    inputSchema: {
      type: 'object',
      properties: {
        jurisdiction: { type: 'string' },
        section: { type: 'string' },
        query: { type: 'string' },
        limit: { type: 'number' },
      },
      required: [],
    },
  },
  {
    name: 'search_sanctions_case_law',
    description: 'Search sanctions-related case law (CJEU/General Court) by keywords and filters.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        regime_id: { type: 'string' },
        court: { type: 'string' },
        delisting_related: { type: 'boolean' },
        limit: { type: 'number' },
      },
      required: [],
    },
  },
  {
    name: 'list_sources',
    description: 'List source coverage, counts, and freshness status. Can include detailed sample items for one source.',
    inputSchema: {
      type: 'object',
      properties: {
        source_id: { type: 'string' },
        include_samples: { type: 'boolean' },
      },
      required: [],
    },
  },
  {
    name: 'about',
    description: 'Return MCP scope, tier, and live database totals.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'check_data_freshness',
    description: 'Compute freshness status per source and flag stale datasets.',
    inputSchema: {
      type: 'object',
      properties: {
        max_age_days: { type: 'number' },
        as_of: { type: 'string', description: 'ISO date override for deterministic checks.' },
        status: {
          type: 'string',
          enum: ['fresh', 'warning', 'stale', 'planned'],
        },
      },
      required: [],
    },
  },
];

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
      let result: unknown;

      switch (name) {
        case 'search_sanctions_law':
          result = await searchSanctionsLaw(db, (args ?? {}) as unknown as SearchSanctionsLawInput);
          break;
        case 'get_provision':
          result = await getProvision(db, (args ?? {}) as unknown as GetProvisionInput);
          break;
        case 'get_sanctions_regime':
          result = await getSanctionsRegime(db, (args ?? {}) as unknown as GetSanctionsRegimeInput);
          break;
        case 'get_executive_order':
          result = await getExecutiveOrder(db, (args ?? {}) as unknown as GetExecutiveOrderInput);
          break;
        case 'check_cyber_sanctions':
          result = await checkCyberSanctions(db, (args ?? {}) as unknown as CheckCyberSanctionsInput);
          break;
        case 'get_delisting_procedure':
          result = await getDelistingProcedure(db, (args ?? {}) as unknown as GetDelistingProcedureInput);
          break;
        case 'get_export_control':
          result = await getExportControl(db, (args ?? {}) as unknown as GetExportControlInput);
          break;
        case 'search_sanctions_case_law':
          result = await searchSanctionsCaseLaw(db, (args ?? {}) as unknown as SearchSanctionsCaseLawInput);
          break;
        case 'list_sources':
          result = await listSources(db, (args ?? {}) as unknown as ListSourcesInput);
          break;
        case 'about':
          result = await about(db);
          break;
        case 'check_data_freshness':
          result = await checkDataFreshness(db, (args ?? {}) as unknown as CheckDataFreshnessInput);
          break;
        default:
          return {
            content: [
              {
                type: 'text' as const,
                text: `Error: Unknown tool "${name}".`,
              },
            ],
            isError: true,
          };
      }

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
