import type { Database } from 'better-sqlite3';

import { ageInDays, frequencyThresholdDays } from './sanctions-utils.js';

export interface CheckDataFreshnessInput {
  max_age_days?: number;
  as_of?: string;
  status?: 'fresh' | 'warning' | 'stale' | 'planned';
}

export interface FreshnessEntry {
  source_id: string;
  source_name: string;
  check_frequency: string;
  last_checked: string;
  last_updated: string;
  declared_status: string;
  expected_max_age_days: number;
  age_days: number;
  evaluated_status: 'fresh' | 'warning' | 'stale' | 'planned';
  is_within_max_age: boolean;
  notes: string;
}

export interface CheckDataFreshnessResult {
  as_of: string;
  max_age_days: number;
  totals: {
    fresh: number;
    warning: number;
    stale: number;
    planned: number;
  };
  entries: FreshnessEntry[];
}

interface FreshnessRow {
  source_id: string;
  source_name: string;
  check_frequency: string;
  last_checked: string;
  last_updated: string;
  declared_status: string;
  notes: string;
}

export async function checkDataFreshness(
  db: Database,
  input: CheckDataFreshnessInput,
): Promise<CheckDataFreshnessResult> {
  const asOf = input.as_of ?? new Date().toISOString().slice(0, 10);
  const maxAgeDays = typeof input.max_age_days === 'number' ? Math.max(1, Math.floor(input.max_age_days)) : 45;

  const rows = db
    .prepare(
      `
      SELECT
        sf.source_id,
        s.name AS source_name,
        sf.check_frequency,
        sf.last_checked,
        sf.last_updated,
        sf.status AS declared_status,
        sf.notes
      FROM source_freshness sf
      JOIN sources s ON s.id = sf.source_id
      ORDER BY s.id
    `,
    )
    .all() as FreshnessRow[];

  const entries = rows
    .map((row) => {
      const expectedMaxAgeDays = frequencyThresholdDays(row.check_frequency);
      const ageDays = ageInDays(row.last_updated, asOf);
      const evaluatedStatus = evaluateStatus(ageDays, expectedMaxAgeDays);

      return {
        source_id: row.source_id,
        source_name: row.source_name,
        check_frequency: row.check_frequency,
        last_checked: row.last_checked,
        last_updated: row.last_updated,
        declared_status: row.declared_status,
        expected_max_age_days: expectedMaxAgeDays,
        age_days: ageDays,
        evaluated_status: evaluatedStatus,
        is_within_max_age: ageDays <= maxAgeDays,
        notes: row.notes,
      } satisfies FreshnessEntry;
    })
    .filter((entry) => (input.status ? entry.evaluated_status === input.status : true));

  const totals = entries.reduce(
    (accumulator, entry) => {
      accumulator[entry.evaluated_status] += 1;
      return accumulator;
    },
    {
      fresh: 0,
      warning: 0,
      stale: 0,
      planned: 0,
    },
  );

  return {
    as_of: asOf,
    max_age_days: maxAgeDays,
    totals,
    entries,
  };
}

function evaluateStatus(ageDays: number, expectedMaxAgeDays: number): 'fresh' | 'warning' | 'stale' | 'planned' {
  if (!Number.isFinite(ageDays)) {
    return 'planned';
  }

  if (ageDays <= expectedMaxAgeDays) {
    return 'fresh';
  }

  if (ageDays <= expectedMaxAgeDays * 2) {
    return 'warning';
  }

  return 'stale';
}
