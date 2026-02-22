import Database from 'better-sqlite3';

import { DEFAULT_SANCTIONS_SEED } from '../../src/db/default-seed';
import { createSanctionsSchema, seedSanctionsDatabase } from '../../src/db/schema';

export function createSanctionsTestDatabase(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  createSanctionsSchema(db);
  seedSanctionsDatabase(db, DEFAULT_SANCTIONS_SEED);
  return db;
}

export function closeSanctionsTestDatabase(db: Database.Database): void {
  db.close();
}
