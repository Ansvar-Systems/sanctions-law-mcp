import type { Database } from 'better-sqlite3';

import {
  escapeFts5Query,
  normalizeLimit,
  normalizeStringArray,
  parseJsonArray,
  sqlLikePattern,
} from './sanctions-utils.js';

export interface SearchSanctionsLawInput {
  query: string;
  source_ids?: string[];
  jurisdictions?: string[];
  regime_id?: string;
  topics?: string[];
  limit?: number;
}

export interface SearchSanctionsLawResult {
  source_id: string;
  source_name: string;
  item_id: string;
  kind: string;
  title: string;
  snippet: string;
  relevance: number;
  regime_id: string | null;
  regime_name: string | null;
  issued_on: string | null;
  official_url: string;
  topics: string[];
}

interface SearchRow {
  source_id: string;
  source_name: string;
  item_id: string;
  kind: string;
  title: string;
  snippet: string;
  relevance: number;
  regime_id: string | null;
  regime_name: string | null;
  issued_on: string | null;
  official_url: string;
  topics: string;
}

export async function searchSanctionsLaw(
  db: Database,
  input: SearchSanctionsLawInput,
): Promise<SearchSanctionsLawResult[]> {
  if (!input.query || input.query.trim().length === 0) {
    return [];
  }

  const safeQuery = escapeFts5Query(input.query.trim());
  if (safeQuery.length === 0) {
    return [];
  }

  const limit = normalizeLimit(input.limit);
  const sourceIds = normalizeStringArray(input.source_ids);
  const jurisdictions = normalizeStringArray(input.jurisdictions);
  const topics = normalizeStringArray(input.topics).map((topic) => topic.toLowerCase());

  let sql = `
    SELECT
      p.source_id,
      s.name AS source_name,
      p.item_id,
      p.kind,
      p.title,
      snippet(provisions_fts, 3, '>>>', '<<<', '...', 36) AS snippet,
      bm25(provisions_fts) AS relevance,
      p.regime_id,
      r.name AS regime_name,
      p.issued_on,
      p.url AS official_url,
      p.topics
    FROM provisions_fts
    JOIN provisions p ON p.rowid = provisions_fts.rowid
    JOIN sources s ON s.id = p.source_id
    LEFT JOIN sanctions_regimes r ON r.id = p.regime_id
    WHERE provisions_fts MATCH ?
  `;

  const params: Array<string | number> = [safeQuery];

  if (sourceIds.length > 0) {
    sql += ` AND p.source_id IN (${sourceIds.map(() => '?').join(', ')})`;
    params.push(...sourceIds);
  }

  if (jurisdictions.length > 0) {
    sql += ` AND COALESCE(r.jurisdiction, '') IN (${jurisdictions.map(() => '?').join(', ')})`;
    params.push(...jurisdictions);
  }

  if (input.regime_id && input.regime_id.trim().length > 0) {
    sql += ` AND p.regime_id = ?`;
    params.push(input.regime_id.trim());
  }

  if (topics.length > 0) {
    sql += ` AND (${topics.map(() => 'LOWER(p.topics) LIKE ?').join(' OR ')})`;
    params.push(...topics.map((topic) => sqlLikePattern(topic)));
  }

  sql += ` ORDER BY relevance ASC LIMIT ?`;
  params.push(limit);

  const rows = db.prepare(sql).all(...params) as SearchRow[];

  return rows.map((row) => ({
    source_id: row.source_id,
    source_name: row.source_name,
    item_id: row.item_id,
    kind: row.kind,
    title: row.title,
    snippet: row.snippet,
    relevance: row.relevance,
    regime_id: row.regime_id,
    regime_name: row.regime_name,
    issued_on: row.issued_on,
    official_url: row.official_url,
    topics: parseJsonArray(row.topics),
  }));
}
