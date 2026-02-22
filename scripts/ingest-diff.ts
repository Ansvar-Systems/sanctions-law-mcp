#!/usr/bin/env tsx
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

const HASHES_PATH = path.resolve(process.cwd(), 'data/.source-hashes.json');
const SEED_PATH = path.resolve(process.cwd(), 'data/seed/sanctions-seed.json');

interface SourceHashes {
  last_check: string;
  sources: Record<string, string>;
}

function hashFile(filePath: string): string {
  if (!fs.existsSync(filePath)) return '';
  const content = fs.readFileSync(filePath, 'utf8');
  return crypto.createHash('sha256').update(content).digest('hex');
}

function main(): void {
  const currentHash = hashFile(SEED_PATH);

  let previousHashes: SourceHashes = { last_check: '', sources: {} };
  if (fs.existsSync(HASHES_PATH)) {
    previousHashes = JSON.parse(fs.readFileSync(HASHES_PATH, 'utf8'));
  }

  const previousHash = previousHashes.sources['sanctions-seed'] ?? '';
  const changed = currentHash !== previousHash;

  // Update hashes
  previousHashes.last_check = new Date().toISOString();
  previousHashes.sources['sanctions-seed'] = currentHash;
  fs.mkdirSync(path.dirname(HASHES_PATH), { recursive: true });
  fs.writeFileSync(HASHES_PATH, JSON.stringify(previousHashes, null, 2));

  // Write outputs for CI
  fs.writeFileSync('.ingest-changed', changed ? 'true' : 'false');
  fs.writeFileSync('.ingest-summary', changed ? 'Seed data changed — rebuild required' : 'No changes detected');

  console.log(`sanctions-law-mcp: diff check — changed=${changed}`);
}

main();
