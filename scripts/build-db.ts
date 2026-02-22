#!/usr/bin/env tsx
import fs from 'node:fs/promises';
import path from 'node:path';

import BetterSqlite3 from 'better-sqlite3';

import { DEFAULT_SANCTIONS_SEED } from '../src/db/default-seed.js';
import { createSanctionsSchema, seedSanctionsDatabase, summarizeSeed } from '../src/db/schema.js';
import type { SanctionsSeed } from '../src/db/types.js';

const DB_ENV_VAR = 'SANCTIONS_LAW_DB_PATH';
const SEED_ENV_VAR = 'SANCTIONS_LAW_SEED_PATH';

function defaultDatabasePath(): string {
  return path.resolve(process.cwd(), 'data/database.db');
}

function defaultSeedPath(): string {
  return path.resolve(process.cwd(), 'data/seed/sanctions-seed.json');
}

async function loadSeed(seedPath: string): Promise<SanctionsSeed> {
  try {
    const raw = await fs.readFile(seedPath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    return validateSeed(parsed);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      return DEFAULT_SANCTIONS_SEED;
    }
    throw error;
  }
}

function validateSeed(value: unknown): SanctionsSeed {
  if (!value || typeof value !== 'object') {
    throw new Error('Seed file must be a JSON object');
  }

  const seed = value as Partial<SanctionsSeed>;
  const requiredArrays: Array<keyof SanctionsSeed> = [
    'sources',
    'sanctions_regimes',
    'provisions',
    'executive_orders',
    'delisting_procedures',
    'export_controls',
    'sanctions_case_law',
    'source_freshness',
  ];

  for (const key of requiredArrays) {
    if (!Array.isArray(seed[key])) {
      throw new Error(`Seed is missing required array: ${String(key)}`);
    }
  }

  if (typeof seed.schema_version !== 'string' || typeof seed.generated_on !== 'string') {
    throw new Error('Seed must include schema_version and generated_on strings');
  }

  return seed as SanctionsSeed;
}

async function main(): Promise<void> {
  const dbPath = path.resolve(process.cwd(), process.env[DB_ENV_VAR] ?? defaultDatabasePath());
  const seedPath = path.resolve(process.cwd(), process.env[SEED_ENV_VAR] ?? defaultSeedPath());

  await fs.mkdir(path.dirname(dbPath), { recursive: true });

  const seed = await loadSeed(seedPath);

  const db = new BetterSqlite3(dbPath);
  db.pragma('foreign_keys = ON');

  try {
    createSanctionsSchema(db);
    seedSanctionsDatabase(db, seed);
  } finally {
    db.close();
  }

  const summary = summarizeSeed(seed);
  console.log(`sanctions-law-mcp: database built at ${dbPath}`);
  console.log(`sanctions-law-mcp: seed source ${seedPath}`);
  console.log(
    `sources=${summary.sources} regimes=${summary.sanctions_regimes} provisions=${summary.provisions} executive_orders=${summary.executive_orders} export_controls=${summary.export_controls} case_law=${summary.sanctions_case_law}`,
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`sanctions-law-mcp: build-db failed: ${message}`);
  process.exit(1);
});
