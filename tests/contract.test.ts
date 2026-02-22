import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type Database from 'better-sqlite3';
import { createSanctionsTestDatabase, closeSanctionsTestDatabase } from './fixtures/sanctions-db.js';

// Import all tool functions
import { searchSanctionsLaw } from '../src/tools/search-sanctions-law.js';
import { getProvision } from '../src/tools/get-provision.js';
import { getSanctionsRegime } from '../src/tools/get-sanctions-regime.js';
import { getExecutiveOrder } from '../src/tools/get-executive-order.js';
import { checkCyberSanctions } from '../src/tools/check-cyber-sanctions.js';
import { getDelistingProcedure } from '../src/tools/get-delisting-procedure.js';
import { getExportControl } from '../src/tools/get-export-control.js';
import { searchSanctionsCaseLaw } from '../src/tools/search-sanctions-case-law.js';
import { listSources } from '../src/tools/list-sources.js';
import { about } from '../src/tools/about.js';
import { checkDataFreshness } from '../src/tools/check-data-freshness.js';

interface GoldenTest {
  id: string;
  category: string;
  description: string;
  tool: string;
  input: Record<string, unknown>;
  assertions: Record<string, unknown>;
}

interface GoldenTestFile {
  version: string;
  mcp_name: string;
  tests: GoldenTest[];
}

const TOOL_MAP: Record<string, (db: any, input: any) => Promise<any>> = {
  search_sanctions_law: searchSanctionsLaw,
  get_provision: getProvision,
  get_sanctions_regime: getSanctionsRegime,
  get_executive_order: getExecutiveOrder,
  check_cyber_sanctions: checkCyberSanctions,
  get_delisting_procedure: getDelistingProcedure,
  get_export_control: getExportControl,
  search_sanctions_case_law: searchSanctionsCaseLaw,
  list_sources: listSources,
  about: (db: any) => about(db),
  check_data_freshness: checkDataFreshness,
};

// Load test definitions at module level so they're available for test registration
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const testFile = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../fixtures/golden-tests.json'), 'utf8'),
) as GoldenTestFile;

describe('Golden Contract Tests', () => {
  let db: Database.Database;

  beforeAll(() => {
    db = createSanctionsTestDatabase();
  });

  afterAll(() => {
    closeSanctionsTestDatabase(db);
  });

  it('should have loaded at least 10 golden tests', () => {
    expect(testFile.tests.length).toBeGreaterThanOrEqual(10);
  });

  for (const test of testFile.tests) {
    it(`[${test.id}] ${test.description}`, async () => {
      const toolFn = TOOL_MAP[test.tool];
      expect(toolFn, `Unknown tool: ${test.tool}`).toBeDefined();

      // Tool should not throw
      const result = await toolFn(db, test.input);
      expect(result).toBeDefined();

      // Check assertions
      if (test.assertions.has_fields) {
        const fields = test.assertions.has_fields as string[];
        for (const field of fields) {
          expect(result).toHaveProperty(field);
        }
      }
    });
  }
});
