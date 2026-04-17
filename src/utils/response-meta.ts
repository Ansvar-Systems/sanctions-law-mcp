/**
 * Response envelope metadata (`_meta`) — conforms to Golden Standard §4.9b.
 *
 * Watchdog (scripts/mcp-watchdog.sh:~410) asserts:
 *   - `_meta.disclaimer` is non-empty
 *   - `_meta.data_age` matches ISO 8601 (YYYY-MM-DD...)
 *
 * This MCP is hand-built (not law-scaffold), so the `_meta` envelope is
 * assembled at the dispatcher layer (tools/shared-tools.ts callTool) rather
 * than inside each tool. Tools return their data-shaped result as-is;
 * the dispatcher wraps watchdog-tested responses with `_meta`.
 */

export interface MetaEnvelope {
  disclaimer: string;
  data_age: string;
  source_url?: string;
  source_authority?: string;
  jurisdiction?: string;
}

const DATA_AGE = '2026-02-27';

const DISCLAIMER =
  'Reference tool only. Not legal advice. Sanctions data changes frequently; verify against official government lists before acting.';

const SOURCE_AUTHORITY =
  'Official government sanctions portals: OFAC (Treasury.gov), EU Council (sanctionsmap.eu), UK OFSI (gov.uk), UN Security Council.';

export function buildMeta(): MetaEnvelope {
  return {
    disclaimer: DISCLAIMER,
    data_age: DATA_AGE,
    source_authority: SOURCE_AUTHORITY,
    jurisdiction: 'INTERNATIONAL',
  };
}
