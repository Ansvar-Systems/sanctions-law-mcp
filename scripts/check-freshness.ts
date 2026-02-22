#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const DB_PATH = path.resolve(process.cwd(), 'data/database.db');

interface FreshnessRow {
  source_id: string;
  last_checked: string;
  last_updated: string;
  check_frequency: string;
  status: string;
  notes: string;
}

const FREQUENCY_DAYS: Record<string, number> = {
  daily: 2,
  weekly: 10,
  monthly: 45,
  quarterly: 120,
  on_change: 30,
};

function main(): void {
  const db = new Database(DB_PATH, { readonly: true });
  const rows = db.prepare('SELECT * FROM source_freshness').all() as FreshnessRow[];
  db.close();

  const now = Date.now();
  let anyStale = false;
  const lines: string[] = ['# Data Freshness Report', '', `Generated: ${new Date().toISOString()}`, ''];
  lines.push('| Source | Last Checked | Frequency | Status |');
  lines.push('|--------|-------------|-----------|--------|');

  for (const row of rows) {
    const lastChecked = new Date(row.last_checked).getTime();
    const ageDays = Math.floor((now - lastChecked) / (1000 * 60 * 60 * 24));
    const maxDays = FREQUENCY_DAYS[row.check_frequency] ?? 30;
    let status = 'Current';
    if (ageDays > maxDays) {
      status = `OVERDUE (${ageDays} days)`;
      anyStale = true;
    } else if (ageDays > maxDays * 0.8) {
      status = `Due soon (${ageDays} days)`;
    }
    lines.push(`| ${row.source_id} | ${row.last_checked} | ${row.check_frequency} | ${status} |`);
  }

  fs.writeFileSync('.freshness-stale', anyStale ? 'true' : 'false');
  fs.writeFileSync('.freshness-report', lines.join('\n'));

  console.log(anyStale ? 'WARNING: Stale sources detected' : 'All sources current');
}

main();
