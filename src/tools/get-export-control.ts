import type { Database } from 'better-sqlite3';

import { normalizeLimit, sqlLikePattern } from './sanctions-utils.js';

export interface GetExportControlInput {
  jurisdiction?: string;
  section?: string;
  query?: string;
  limit?: number;
}

export interface ExportControlResult {
  id: string;
  source_id: string;
  source_name: string;
  jurisdiction: string;
  instrument: string;
  section: string;
  title: string;
  summary: string;
  focus: string;
  official_url: string;
}

interface ExportControlRow {
  id: string;
  source_id: string;
  source_name: string;
  jurisdiction: string;
  instrument: string;
  section: string;
  title: string;
  summary: string;
  focus: string;
  official_url: string;
}

export async function getExportControl(
  db: Database,
  input: GetExportControlInput,
): Promise<ExportControlResult[]> {
  const whereClauses: string[] = [];
  const params: Array<string | number> = [];

  if (input.jurisdiction && input.jurisdiction.trim().length > 0) {
    whereClauses.push('ec.jurisdiction = ?');
    params.push(input.jurisdiction.trim());
  }

  if (input.section && input.section.trim().length > 0) {
    whereClauses.push('LOWER(ec.section) LIKE ?');
    params.push(sqlLikePattern(input.section.trim()));
  }

  if (input.query && input.query.trim().length > 0) {
    whereClauses.push('(LOWER(ec.title) LIKE ? OR LOWER(ec.summary) LIKE ? OR LOWER(ec.focus) LIKE ?)');
    const queryPattern = sqlLikePattern(input.query.trim());
    params.push(queryPattern, queryPattern, queryPattern);
  }

  const limit = normalizeLimit(input.limit, 10);

  let sql = `
    SELECT
      ec.id,
      ec.source_id,
      s.name AS source_name,
      ec.jurisdiction,
      ec.instrument,
      ec.section,
      ec.title,
      ec.summary,
      ec.focus,
      ec.official_url
    FROM export_controls ec
    JOIN sources s ON s.id = ec.source_id
  `;

  if (whereClauses.length > 0) {
    sql += ` WHERE ${whereClauses.join(' AND ')}`;
  }

  sql += ` ORDER BY ec.jurisdiction, ec.instrument, ec.section LIMIT ?`;
  params.push(limit);

  return db.prepare(sql).all(...params) as ExportControlRow[];
}
