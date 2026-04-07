/**
 * Shared tool definitions and call dispatcher.
 * Used by both src/index.ts (stdio) and api/mcp.ts (Vercel HTTP).
 * Single source of truth — avoids duplication between transports.
 */
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

import { buildCitation } from '../citation.js';
import { about } from './about.js';
import { checkCyberSanctions, type CheckCyberSanctionsInput } from './check-cyber-sanctions.js';
import { checkDataFreshness, type CheckDataFreshnessInput } from './check-data-freshness.js';
import { getDelistingProcedure, type GetDelistingProcedureInput } from './get-delisting-procedure.js';
import { getExecutiveOrder, type GetExecutiveOrderInput } from './get-executive-order.js';
import { getExportControl, type GetExportControlInput } from './get-export-control.js';
import { getProvision, type GetProvisionInput } from './get-provision.js';
import { getSanctionsRegime, type GetSanctionsRegimeInput } from './get-sanctions-regime.js';
import { listSources, type ListSourcesInput } from './list-sources.js';
import { searchSanctionsCaseLaw, type SearchSanctionsCaseLawInput } from './search-sanctions-case-law.js';
import { searchSanctionsLaw, type SearchSanctionsLawInput } from './search-sanctions-law.js';

export const TOOLS: Tool[] = [
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

/**
 * Dispatch a tool call to the correct handler function.
 * Throws for unknown tools.
 */
export async function callTool(db: any, name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'search_sanctions_law': {
      const searchResults = await searchSanctionsLaw(db, args as unknown as SearchSanctionsLawInput);
      return searchResults.map((r: any) => ({
        ...r,
        _citation: buildCitation(
          `${r.source_name ?? r.source_id} ${r.item_id}`,
          r.title || `${r.source_id} ${r.item_id}`,
          'get_provision',
          { source_id: r.source_id, item_id: r.item_id },
          r.official_url || undefined,
        ),
      }));
    }
    case 'get_provision': {
      const provResult = await getProvision(db, args as unknown as GetProvisionInput);
      if (provResult) {
        return {
          ...provResult,
          _citation: buildCitation(
            `${provResult.source_name ?? provResult.source_id} ${provResult.item_id}`,
            provResult.title || `${provResult.source_id} ${provResult.item_id}`,
            'get_provision',
            { source_id: provResult.source_id, item_id: provResult.item_id },
            provResult.official_url || undefined,
          ),
        };
      }
      return provResult;
    }
    case 'get_sanctions_regime': {
      const regimeResults = await getSanctionsRegime(db, args as unknown as GetSanctionsRegimeInput);
      return regimeResults.map((r: any) => ({
        ...r,
        _citation: buildCitation(
          r.id,
          r.name || r.id,
          'get_sanctions_regime',
          { regime_id: r.id },
          r.official_url || undefined,
        ),
      }));
    }
    case 'get_executive_order': {
      const eoResult = await getExecutiveOrder(db, args as unknown as GetExecutiveOrderInput);
      if (eoResult) {
        return {
          ...eoResult,
          _citation: buildCitation(
            eoResult.order_number,
            eoResult.title || eoResult.order_number,
            'get_executive_order',
            { order_number: eoResult.order_number },
            eoResult.official_url || undefined,
          ),
        };
      }
      return eoResult;
    }
    case 'check_cyber_sanctions': {
      const cyberResult = await checkCyberSanctions(db, args as unknown as CheckCyberSanctionsInput);
      return {
        ...cyberResult,
        regimes: (cyberResult as any).regimes?.map((r: any) => ({
          ...r,
          _citation: buildCitation(
            r.regime_id,
            r.name || r.regime_id,
            'get_sanctions_regime',
            { regime_id: r.regime_id },
            r.official_url || undefined,
          ),
        })),
      };
    }
    case 'get_delisting_procedure': {
      const dpResults = await getDelistingProcedure(db, args as unknown as GetDelistingProcedureInput);
      return dpResults.map((r: any) => ({
        ...r,
        _citation: buildCitation(
          r.id,
          `Delisting procedure — ${r.regime_name || r.regime_id}`,
          'get_delisting_procedure',
          { procedure_id: r.id },
          r.application_url || undefined,
        ),
      }));
    }
    case 'get_export_control': {
      const ecResults = await getExportControl(db, args as unknown as GetExportControlInput);
      return ecResults.map((r: any) => ({
        ...r,
        _citation: buildCitation(
          `${r.jurisdiction} ${r.section}`,
          r.title || `${r.instrument} ${r.section}`,
          'get_export_control',
          { jurisdiction: r.jurisdiction, section: r.section },
          r.official_url || undefined,
        ),
      }));
    }
    case 'search_sanctions_case_law': {
      const clResults = await searchSanctionsCaseLaw(db, args as unknown as SearchSanctionsCaseLawInput);
      return clResults.map((r: any) => ({
        ...r,
        _citation: buildCitation(
          r.case_reference,
          r.title || r.case_reference,
          'search_sanctions_case_law',
          { query: r.case_reference },
          r.official_url || undefined,
        ),
      }));
    }
    case 'list_sources':
      return listSources(db, args as unknown as ListSourcesInput);
    case 'about':
      return about(db);
    case 'check_data_freshness':
      return checkDataFreshness(db, args as unknown as CheckDataFreshnessInput);
    default:
      throw new Error(`Unknown tool "${name}".`);
  }
}
