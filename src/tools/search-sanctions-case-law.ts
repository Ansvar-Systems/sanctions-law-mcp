import type { Database } from 'better-sqlite3';

import { normalizeLimit, parseJsonArray, sqlLikePattern } from './sanctions-utils.js';

export interface SearchSanctionsCaseLawInput {
  query?: string;
  regime_id?: string;
  court?: string;
  delisting_related?: boolean;
  limit?: number;
}

export interface SanctionsCaseLawResult {
  id: string;
  source_id: string;
  court: string;
  case_reference: string;
  title: string;
  decision_date: string;
  regime_id: string | null;
  regime_name: string | null;
  delisting_related: boolean;
  outcome: string;
  summary: string;
  keywords: string[];
  official_url: string;
}

interface CaseLawRow {
  id: string;
  source_id: string;
  court: string;
  case_reference: string;
  title: string;
  decision_date: string;
  regime_id: string | null;
  regime_name: string | null;
  delisting_related: number;
  outcome: string;
  summary: string;
  keywords: string;
  official_url: string;
}

export async function searchSanctionsCaseLaw(
  db: Database,
  input: SearchSanctionsCaseLawInput,
): Promise<SanctionsCaseLawResult[]> {
  const whereClauses: string[] = [];
  const params: Array<string | number> = [];

  if (input.query && input.query.trim().length > 0) {
    whereClauses.push(
      '(LOWER(c.case_reference) LIKE ? OR LOWER(c.title) LIKE ? OR LOWER(c.summary) LIKE ? OR LOWER(c.keywords) LIKE ?)',
    );
    const pattern = sqlLikePattern(input.query.trim());
    params.push(pattern, pattern, pattern, pattern);
  }

  if (input.regime_id && input.regime_id.trim().length > 0) {
    whereClauses.push('c.regime_id = ?');
    params.push(input.regime_id.trim());
  }

  if (input.court && input.court.trim().length > 0) {
    whereClauses.push('LOWER(c.court) LIKE ?');
    params.push(sqlLikePattern(input.court.trim()));
  }

  if (typeof input.delisting_related === 'boolean') {
    whereClauses.push('c.delisting_related = ?');
    params.push(input.delisting_related ? 1 : 0);
  }

  const limit = normalizeLimit(input.limit, 10);

  let sql = `
    SELECT
      c.id,
      c.source_id,
      c.court,
      c.case_reference,
      c.title,
      c.decision_date,
      c.regime_id,
      r.name AS regime_name,
      c.delisting_related,
      c.outcome,
      c.summary,
      c.keywords,
      c.official_url
    FROM sanctions_case_law c
    LEFT JOIN sanctions_regimes r ON r.id = c.regime_id
  `;

  if (whereClauses.length > 0) {
    sql += ` WHERE ${whereClauses.join(' AND ')}`;
  }

  sql += ` ORDER BY c.decision_date DESC LIMIT ?`;
  params.push(limit);

  const rows = db.prepare(sql).all(...params) as CaseLawRow[];

  return rows.map((row) => ({
    id: row.id,
    source_id: row.source_id,
    court: row.court,
    case_reference: row.case_reference,
    title: row.title,
    decision_date: row.decision_date,
    regime_id: row.regime_id,
    regime_name: row.regime_name,
    delisting_related: row.delisting_related === 1,
    outcome: row.outcome,
    summary: row.summary,
    keywords: parseJsonArray(row.keywords),
    official_url: row.official_url,
  }));
}
