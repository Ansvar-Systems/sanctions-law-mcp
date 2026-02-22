#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

interface CoverageSource {
  id: string;
  actual_records: number;
}

interface CoverageJson {
  summary: {
    provisions: number;
    sources: number;
  };
  source_coverage: CoverageSource[];
}

const DB_PATH = path.resolve(process.cwd(), 'data/database.db');
const COVERAGE_PATH = path.resolve(process.cwd(), 'data/coverage.json');

function main(): void {
  const errors: string[] = [];

  // Check files exist
  if (!fs.existsSync(DB_PATH)) {
    console.error('FAIL: data/database.db not found');
    process.exit(1);
  }
  if (!fs.existsSync(COVERAGE_PATH)) {
    console.error('FAIL: data/coverage.json not found');
    process.exit(1);
  }

  const db = new Database(DB_PATH, { readonly: true });
  const coverage = JSON.parse(fs.readFileSync(COVERAGE_PATH, 'utf8')) as CoverageJson;

  // Check 1: Source count matches
  const dbSourceCount = (db.prepare('SELECT COUNT(*) AS count FROM sources').get() as { count: number }).count;
  if (dbSourceCount !== coverage.summary.sources) {
    errors.push(`Source count mismatch: DB has ${dbSourceCount}, coverage.json says ${coverage.summary.sources}`);
  }

  // Check 2: Provision count matches
  const dbProvisionCount = (db.prepare('SELECT COUNT(*) AS count FROM provisions').get() as { count: number }).count;
  if (dbProvisionCount !== coverage.summary.provisions) {
    errors.push(`Provision count mismatch: DB has ${dbProvisionCount}, coverage.json says ${coverage.summary.provisions}`);
  }

  // Check 3: Per-source record counts
  for (const source of coverage.source_coverage) {
    const row = db.prepare('SELECT COUNT(*) AS count FROM provisions WHERE source_id = ?').get(source.id) as { count: number } | undefined;
    const dbCount = row?.count ?? 0;
    if (dbCount !== source.actual_records) {
      errors.push(`Source ${source.id}: DB has ${dbCount} provisions, coverage.json says ${source.actual_records}`);
    }
  }

  // Check 4: FTS5 index is populated
  const ftsCount = (db.prepare("SELECT COUNT(*) AS count FROM provisions_fts WHERE provisions_fts MATCH 'law'").get() as { count: number }).count;
  if (ftsCount === 0) {
    errors.push('FTS5 index appears empty: no results for MATCH "law"');
  }

  // Check 5: Journal mode is DELETE
  const journalMode = (db.prepare('PRAGMA journal_mode').get() as { journal_mode: string }).journal_mode;
  if (journalMode !== 'delete') {
    errors.push(`Journal mode is "${journalMode}", expected "delete"`);
  }

  db.close();

  if (errors.length > 0) {
    console.error('COVERAGE VERIFICATION FAILED:');
    for (const error of errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }

  console.log('COVERAGE VERIFICATION PASSED');
  console.log(`  Sources: ${dbSourceCount}`);
  console.log(`  Provisions: ${dbProvisionCount}`);
  console.log(`  FTS5 index: OK`);
  console.log(`  Journal mode: delete`);
}

main();
