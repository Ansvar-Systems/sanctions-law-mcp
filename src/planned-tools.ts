import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const DOMAIN_NAME = "Sanctions Law MCP";
export const TIER1_BASELINE_DATE = "2026-02-22";
export const PLANNED_TOOL_NAMES = [
  "search_sanctions_law",
  "get_provision",
  "get_sanctions_regime",
  "get_executive_order",
  "check_cyber_sanctions",
  "get_delisting_procedure",
  "get_export_control",
  "search_sanctions_case_law",
  "check_data_freshness",
  "about"
] as const;

const PLANNED_TOOL_SET = new Set<string>(PLANNED_TOOL_NAMES);

export const PLANNED_TOOLS: Tool[] = PLANNED_TOOL_NAMES.map((toolName) => ({
  name: toolName,
  description:
    `Tier 1 planned tool for ${DOMAIN_NAME}. This placeholder exists in scaffold mode until source ingestion and domain logic are implemented.`,
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: true,
  },
}));

export function isPlannedTool(name: string): boolean {
  return PLANNED_TOOL_SET.has(name);
}

export function createPlannedToolResponse(toolName: string, args: unknown): Record<string, unknown> {
  return {
    status: 'planned_not_implemented',
    tool: toolName,
    domain: DOMAIN_NAME,
    baseline_date: TIER1_BASELINE_DATE,
    next_step: 'Implement ingestion, schema mapping, and domain-specific tool handlers.',
    received_args: args ?? {},
  };
}
