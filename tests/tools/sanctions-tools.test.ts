import type { Database } from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { about } from '../../src/tools/about';
import { checkCyberSanctions } from '../../src/tools/check-cyber-sanctions';
import { checkDataFreshness } from '../../src/tools/check-data-freshness';
import { getDelistingProcedure } from '../../src/tools/get-delisting-procedure';
import { getExecutiveOrder } from '../../src/tools/get-executive-order';
import { getExportControl } from '../../src/tools/get-export-control';
import { getProvision } from '../../src/tools/get-provision';
import { getSanctionsRegime } from '../../src/tools/get-sanctions-regime';
import { listSources } from '../../src/tools/list-sources';
import { searchSanctionsCaseLaw } from '../../src/tools/search-sanctions-case-law';
import { searchSanctionsLaw } from '../../src/tools/search-sanctions-law';
import { closeSanctionsTestDatabase, createSanctionsTestDatabase } from '../fixtures/sanctions-db';

describe('sanctions tool suite', () => {
  let db: Database;

  beforeAll(() => {
    db = createSanctionsTestDatabase();
  });

  afterAll(() => {
    closeSanctionsTestDatabase(db);
  });

  it('search_sanctions_law returns relevant provisions', async () => {
    const result = await searchSanctionsLaw(db, {
      query: 'cyber sanctions',
      jurisdictions: ['US'],
    });

    expect(result.length).toBeGreaterThan(0);
    expect(result.some((item) => item.source_id === 'US_OFAC_EXECUTIVE_ORDERS')).toBe(true);
  });

  it('get_provision returns provision details and related items', async () => {
    const result = await getProvision(db, {
      source_id: 'EU_RESTRICTIVE_MEASURES',
      item_id: 'EU833_ART2',
      include_related: true,
    });

    expect(result).not.toBeNull();
    expect(result?.regime_id).toBe('EU_RUSSIA_2014');
    expect(result?.topics.includes('export_controls')).toBe(true);
    expect(Array.isArray(result?.related)).toBe(true);
  });

  it('get_sanctions_regime finds regimes by jurisdiction', async () => {
    const result = await getSanctionsRegime(db, {
      jurisdiction: 'EU',
      include_provisions: true,
    });

    expect(result.length).toBeGreaterThan(0);
    expect(result.every((regime) => regime.jurisdiction === 'EU')).toBe(true);
    expect(result[0].provisions).not.toBeNull();
  });

  it('get_executive_order resolves EO by number', async () => {
    const result = await getExecutiveOrder(db, {
      order_number: '13694',
      include_related_provisions: true,
    });

    expect(result).not.toBeNull();
    expect(result?.cyber_related).toBe(true);
    expect(result?.order_number).toBe('13694');
  });

  it('check_cyber_sanctions returns cyber regime and EO coverage', async () => {
    const result = await checkCyberSanctions(db, { jurisdiction: 'EU' });

    expect(result.regimes.some((regime) => regime.regime_id === 'EU_CYBER_2019_796')).toBe(true);
    expect(result.jurisdictions_applied).toEqual(['EU']);
  });

  it('get_delisting_procedure returns regime-linked procedures', async () => {
    const result = await getDelistingProcedure(db, { regime_id: 'US_CYBER_13694' });

    expect(result.length).toBe(1);
    expect(result[0].id).toBe('DP_US_OFAC_RECONSIDERATION');
  });

  it('get_export_control filters export controls by jurisdiction', async () => {
    const result = await getExportControl(db, { jurisdiction: 'US' });

    expect(result.length).toBeGreaterThan(0);
    expect(result.every((item) => item.jurisdiction === 'US')).toBe(true);
  });

  it('search_sanctions_case_law supports delisting filter', async () => {
    const result = await searchSanctionsCaseLaw(db, {
      delisting_related: true,
      query: 'evidence',
    });

    expect(result.length).toBeGreaterThan(0);
    expect(result.every((item) => item.delisting_related)).toBe(true);
  });

  it('list_sources returns source summaries and detail views', async () => {
    const listResult = await listSources(db, {});
    expect(listResult.sources.length).toBe(7);

    const detailResult = await listSources(db, {
      source_id: 'US_BIS_EAR',
      include_samples: true,
    });

    expect(detailResult.source).not.toBeNull();
    expect(detailResult.source?.sample_items.length).toBeGreaterThan(0);
  });

  it('about returns complete totals for the seeded dataset', async () => {
    const result = await about(db);

    expect(result.stats.total_sources).toBe(7);
    expect(result.stats.sanctions_regimes).toBe(6);
    expect(result.supported_tools).toContain('check_data_freshness');
    expect(result.network.directory).toBe('https://ansvar.ai/mcp');
    expect(result.disclaimer).toContain('NOT entity screening');
  });

  it('check_data_freshness highlights stale sources', async () => {
    const result = await checkDataFreshness(db, {
      as_of: '2026-02-22',
      max_age_days: 60,
    });

    expect(result.entries.length).toBe(7);
    expect(result.entries.some((entry) => entry.evaluated_status === 'stale')).toBe(true);
  });
});
