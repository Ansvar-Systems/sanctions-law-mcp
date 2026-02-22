#!/usr/bin/env tsx
import fs from 'node:fs/promises';
import path from 'node:path';

import BetterSqlite3 from 'better-sqlite3';

import { DEFAULT_SANCTIONS_SEED } from '../src/db/default-seed.js';
import type { FreshnessStatus, SanctionsSeed } from '../src/db/types.js';

interface FreshnessRow {
  source_id: string;
  source_name: string;
  update_frequency: string;
  last_checked: string;
  last_updated: string;
  declared_status: FreshnessStatus;
  notes: string;
}

interface UpdateReportEntry extends FreshnessRow {
  age_days: number;
  expected_max_age_days: number;
  evaluated_status: FreshnessStatus;
  needs_refresh: boolean;
}

interface UpdateReport {
  generated_at: string;
  as_of: string;
  totals: {
    fresh: number;
    warning: number;
    stale: number;
    planned: number;
  };
  entries: UpdateReportEntry[];
}

const DB_ENV_VAR = 'SANCTIONS_LAW_DB_PATH';
const REPORT_PATH_ENV_VAR = 'SANCTIONS_LAW_UPDATE_REPORT_PATH';

function defaultDatabasePath(): string {
  return path.resolve(process.cwd(), 'data/database.db');
}

function defaultReportPath(): string {
  return path.resolve(process.cwd(), 'data/source-updates-report.json');
}

function parseArguments(argv: string[]): { outputPath?: string; asOf?: string } {
  const result: { outputPath?: string; asOf?: string } = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--output') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --output');
      }
      result.outputPath = value;
      index += 1;
      continue;
    }

    if (token === '--as-of') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --as-of');
      }
      result.asOf = value;
      index += 1;
      continue;
    }

    if (token === '--help' || token === '-h') {
      printUsage();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  return result;
}

function printUsage(): void {
  console.log('Usage: npm run check-updates -- [--as-of YYYY-MM-DD] [--output path]');
}

function frequencyThresholdDays(frequency: string): number {
  switch (frequency) {
    case 'daily':
      return 30;
    case 'weekly':
      return 60;
    case 'monthly':
      return 120;
    case 'on_change':
      return 90;
    default:
      return 30;
  }
}

function parseDate(date: string): Date {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date value: ${date}`);
  }
  return parsed;
}

function dateDiffInDays(fromDate: string, toDate: string): number {
  const from = parseDate(fromDate);
  const to = parseDate(toDate);
  const millisecondsPerDay = 1000 * 60 * 60 * 24;
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / millisecondsPerDay));
}

function evaluateStatus(ageDays: number, thresholdDays: number): FreshnessStatus {
  if (ageDays <= thresholdDays) {
    return 'fresh';
  }
  if (ageDays <= thresholdDays * 2) {
    return 'warning';
  }
  return 'stale';
}

async function loadFreshnessRowsFromDatabase(dbPath: string): Promise<FreshnessRow[] | null> {
  try {
    await fs.access(dbPath);
  } catch {
    return null;
  }

  const db = new BetterSqlite3(dbPath, { readonly: true });

  try {
    const rows = db
      .prepare(
        `
        SELECT
          sf.source_id,
          s.name AS source_name,
          s.update_frequency,
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

    return rows;
  } catch {
    return null;
  } finally {
    db.close();
  }
}

function loadFreshnessRowsFromSeed(seed: SanctionsSeed): FreshnessRow[] {
  const sourceById = new Map(seed.sources.map((source) => [source.id, source]));

  return seed.source_freshness.map((row) => {
    const source = sourceById.get(row.source_id);
    if (!source) {
      throw new Error(`Freshness row references unknown source: ${row.source_id}`);
    }

    return {
      source_id: row.source_id,
      source_name: source.name,
      update_frequency: row.check_frequency,
      last_checked: row.last_checked,
      last_updated: row.last_updated,
      declared_status: row.status,
      notes: row.notes,
    };
  });
}

function buildReport(rows: FreshnessRow[], asOf: string): UpdateReport {
  const entries = rows.map((row) => {
    const expectedMaxAgeDays = frequencyThresholdDays(row.update_frequency);
    const ageDays = dateDiffInDays(row.last_updated, asOf);
    const evaluatedStatus = evaluateStatus(ageDays, expectedMaxAgeDays);

    return {
      ...row,
      age_days: ageDays,
      expected_max_age_days: expectedMaxAgeDays,
      evaluated_status: evaluatedStatus,
      needs_refresh: evaluatedStatus !== 'fresh' || row.declared_status === 'stale',
    } satisfies UpdateReportEntry;
  });

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
    generated_at: new Date().toISOString(),
    as_of: asOf,
    totals,
    entries,
  };
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  const asOf = args.asOf ?? new Date().toISOString().slice(0, 10);

  parseDate(asOf);

  const dbPath = path.resolve(process.cwd(), process.env[DB_ENV_VAR] ?? defaultDatabasePath());
  const outputPath = path.resolve(
    process.cwd(),
    args.outputPath ?? process.env[REPORT_PATH_ENV_VAR] ?? defaultReportPath(),
  );

  const fromDb = await loadFreshnessRowsFromDatabase(dbPath);
  const rows = fromDb ?? loadFreshnessRowsFromSeed(DEFAULT_SANCTIONS_SEED);
  const report = buildReport(rows, asOf);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`sanctions-law-mcp: freshness report written to ${outputPath}`);
  console.log(
    `fresh=${report.totals.fresh} warning=${report.totals.warning} stale=${report.totals.stale} planned=${report.totals.planned}`,
  );

  const staleSources = report.entries
    .filter((entry) => entry.evaluated_status === 'stale' || entry.declared_status === 'stale')
    .map((entry) => entry.source_id);
  if (staleSources.length > 0) {
    console.log(`stale_sources=${staleSources.join(',')}`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`sanctions-law-mcp: check-updates failed: ${message}`);
  process.exit(1);
});
