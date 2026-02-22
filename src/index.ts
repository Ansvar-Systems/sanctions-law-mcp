#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';

import { about } from './tools/about.js';
import { checkCyberSanctions, type CheckCyberSanctionsInput } from './tools/check-cyber-sanctions.js';
import { checkDataFreshness, type CheckDataFreshnessInput } from './tools/check-data-freshness.js';
import { getDelistingProcedure, type GetDelistingProcedureInput } from './tools/get-delisting-procedure.js';
import { getExecutiveOrder, type GetExecutiveOrderInput } from './tools/get-executive-order.js';
import { getExportControl, type GetExportControlInput } from './tools/get-export-control.js';
import { getProvision, type GetProvisionInput } from './tools/get-provision.js';
import { getSanctionsRegime, type GetSanctionsRegimeInput } from './tools/get-sanctions-regime.js';
import { listSources, type ListSourcesInput } from './tools/list-sources.js';
import { searchSanctionsCaseLaw, type SearchSanctionsCaseLawInput } from './tools/search-sanctions-case-law.js';
import { searchSanctionsLaw, type SearchSanctionsLawInput } from './tools/search-sanctions-law.js';

const SERVER_NAME = 'eu.ansvar/sanctions-law';
const SERVER_VERSION = '0.1.0';
const DB_ENV_VAR = 'SANCTIONS_LAW_DB_PATH';
const DEFAULT_DB_PATH = '../data/database.db';

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

let dbInstance: Database.Database | null = null;

function getDefaultDbPath(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, DEFAULT_DB_PATH);
}

function getDb(): Database.Database {
  if (!dbInstance) {
    const dbPath = process.env[DB_ENV_VAR] || getDefaultDbPath();
    dbInstance = new Database(dbPath, { readonly: true });
    dbInstance.pragma('foreign_keys = ON');
  }
  return dbInstance;
}

function closeDb(): void {
  if (!dbInstance) {
    return;
  }
  dbInstance.close();
  dbInstance = null;
}

const server = new Server(
  {
    name: SERVER_NAME,
    version: SERVER_VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result: unknown;

    switch (name) {
      case 'search_sanctions_law':
        result = await searchSanctionsLaw(getDb(), (args ?? {}) as unknown as SearchSanctionsLawInput);
        break;
      case 'get_provision':
        result = await getProvision(getDb(), (args ?? {}) as unknown as GetProvisionInput);
        break;
      case 'get_sanctions_regime':
        result = await getSanctionsRegime(getDb(), (args ?? {}) as unknown as GetSanctionsRegimeInput);
        break;
      case 'get_executive_order':
        result = await getExecutiveOrder(getDb(), (args ?? {}) as unknown as GetExecutiveOrderInput);
        break;
      case 'check_cyber_sanctions':
        result = await checkCyberSanctions(getDb(), (args ?? {}) as unknown as CheckCyberSanctionsInput);
        break;
      case 'get_delisting_procedure':
        result = await getDelistingProcedure(getDb(), (args ?? {}) as unknown as GetDelistingProcedureInput);
        break;
      case 'get_export_control':
        result = await getExportControl(getDb(), (args ?? {}) as unknown as GetExportControlInput);
        break;
      case 'search_sanctions_case_law':
        result = await searchSanctionsCaseLaw(getDb(), (args ?? {}) as unknown as SearchSanctionsCaseLawInput);
        break;
      case 'list_sources':
        result = await listSources(getDb(), (args ?? {}) as unknown as ListSourcesInput);
        break;
      case 'about':
        result = await about(getDb());
        break;
      case 'check_data_freshness':
        result = await checkDataFreshness(getDb(), (args ?? {}) as unknown as CheckDataFreshnessInput);
        break;
      default:
        return {
          content: [
            {
              type: 'text',
              text: `Error: Unknown tool \"${name}\".`,
            },
          ],
          isError: true,
        };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: `Error executing ${name}: ${message}`,
        },
      ],
      isError: true,
    };
  }
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();

  process.on('SIGINT', () => {
    closeDb();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    closeDb();
    process.exit(0);
  });

  await server.connect(transport);
}

main().catch((error) => {
  console.error(`[${SERVER_NAME}] Fatal error:`, error);
  closeDb();
  process.exit(1);
});
