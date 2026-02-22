import type { Database } from 'better-sqlite3';

import { normalizeLimit, parseJsonArray } from './sanctions-utils.js';

export interface GetDelistingProcedureInput {
  regime_id?: string;
  procedure_id?: string;
  limit?: number;
}

export interface DelistingProcedureResult {
  id: string;
  regime_id: string;
  regime_name: string;
  jurisdiction: string;
  authority: string;
  procedure_summary: string;
  evidentiary_standard: string;
  review_body: string;
  review_timeline: string;
  application_url: string;
  legal_basis: string[];
}

interface DelistingProcedureRow {
  id: string;
  regime_id: string;
  regime_name: string;
  jurisdiction: string;
  authority: string;
  procedure_summary: string;
  evidentiary_standard: string;
  review_body: string;
  review_timeline: string;
  application_url: string;
  legal_basis: string;
}

export async function getDelistingProcedure(
  db: Database,
  input: GetDelistingProcedureInput,
): Promise<DelistingProcedureResult[]> {
  const whereClauses: string[] = [];
  const params: Array<string | number> = [];

  if (input.procedure_id && input.procedure_id.trim().length > 0) {
    whereClauses.push('dp.id = ?');
    params.push(input.procedure_id.trim());
  }

  if (input.regime_id && input.regime_id.trim().length > 0) {
    whereClauses.push('dp.regime_id = ?');
    params.push(input.regime_id.trim());
  }

  const limit = normalizeLimit(input.limit, 10);

  let sql = `
    SELECT
      dp.id,
      dp.regime_id,
      r.name AS regime_name,
      r.jurisdiction,
      dp.authority,
      dp.procedure_summary,
      dp.evidentiary_standard,
      dp.review_body,
      dp.review_timeline,
      dp.application_url,
      dp.legal_basis
    FROM delisting_procedures dp
    JOIN sanctions_regimes r ON r.id = dp.regime_id
  `;

  if (whereClauses.length > 0) {
    sql += ` WHERE ${whereClauses.join(' AND ')}`;
  }

  sql += ` ORDER BY r.jurisdiction, r.name LIMIT ?`;
  params.push(limit);

  const rows = db.prepare(sql).all(...params) as DelistingProcedureRow[];

  return rows.map((row) => ({
    id: row.id,
    regime_id: row.regime_id,
    regime_name: row.regime_name,
    jurisdiction: row.jurisdiction,
    authority: row.authority,
    procedure_summary: row.procedure_summary,
    evidentiary_standard: row.evidentiary_standard,
    review_body: row.review_body,
    review_timeline: row.review_timeline,
    application_url: row.application_url,
    legal_basis: parseJsonArray(row.legal_basis),
  }));
}
