import type { Database } from 'better-sqlite3';

import { normalizeLimit, parseJsonArray, sqlLikePattern } from './sanctions-utils.js';

export interface GetSanctionsRegimeInput {
  regime_id?: string;
  name?: string;
  jurisdiction?: string;
  include_provisions?: boolean;
  limit?: number;
}

export interface RegimeProvisionSummary {
  source_id: string;
  item_id: string;
  title: string;
  kind: string;
  official_url: string;
}

export interface SanctionsRegimeDetail {
  id: string;
  name: string;
  jurisdiction: string;
  authority: string;
  summary: string;
  legal_basis: string[];
  cyber_related: boolean;
  delisting_procedure_id: string | null;
  official_url: string;
  provision_count: number;
  case_law_count: number;
  provisions: RegimeProvisionSummary[] | null;
}

interface RegimeRow {
  id: string;
  name: string;
  jurisdiction: string;
  authority: string;
  summary: string;
  legal_basis: string;
  cyber_related: number;
  delisting_procedure_id: string | null;
  official_url: string;
  provision_count: number;
  case_law_count: number;
}

interface ProvisionSummaryRow {
  source_id: string;
  item_id: string;
  title: string;
  kind: string;
  official_url: string;
}

const PROVISION_PREVIEW_LIMIT = 5;

export async function getSanctionsRegime(
  db: Database,
  input: GetSanctionsRegimeInput,
): Promise<SanctionsRegimeDetail[]> {
  const whereClauses: string[] = [];
  const params: Array<string | number> = [];

  if (input.regime_id && input.regime_id.trim().length > 0) {
    whereClauses.push('r.id = ?');
    params.push(input.regime_id.trim());
  }

  if (input.name && input.name.trim().length > 0) {
    whereClauses.push('LOWER(r.name) LIKE ?');
    params.push(sqlLikePattern(input.name.trim()));
  }

  if (input.jurisdiction && input.jurisdiction.trim().length > 0) {
    whereClauses.push('r.jurisdiction = ?');
    params.push(input.jurisdiction.trim());
  }

  const limit = normalizeLimit(input.limit, input.regime_id ? 1 : 10);

  let sql = `
    SELECT
      r.id,
      r.name,
      r.jurisdiction,
      r.authority,
      r.summary,
      r.legal_basis,
      r.cyber_related,
      r.delisting_procedure_id,
      r.official_url,
      (SELECT COUNT(*) FROM provisions p WHERE p.regime_id = r.id) AS provision_count,
      (SELECT COUNT(*) FROM sanctions_case_law c WHERE c.regime_id = r.id) AS case_law_count
    FROM sanctions_regimes r
  `;

  if (whereClauses.length > 0) {
    sql += ` WHERE ${whereClauses.join(' AND ')}`;
  }

  sql += ` ORDER BY r.jurisdiction, r.name LIMIT ?`;
  params.push(limit);

  const rows = db.prepare(sql).all(...params) as RegimeRow[];

  const includeProvisions = Boolean(input.include_provisions);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    jurisdiction: row.jurisdiction,
    authority: row.authority,
    summary: row.summary,
    legal_basis: parseJsonArray(row.legal_basis),
    cyber_related: row.cyber_related === 1,
    delisting_procedure_id: row.delisting_procedure_id,
    official_url: row.official_url,
    provision_count: row.provision_count,
    case_law_count: row.case_law_count,
    provisions: includeProvisions ? getProvisionPreview(db, row.id) : null,
  }));
}

function getProvisionPreview(db: Database, regimeId: string): RegimeProvisionSummary[] {
  const rows = db
    .prepare(
      `
      SELECT source_id, item_id, title, kind, url AS official_url
      FROM provisions
      WHERE regime_id = ?
      ORDER BY issued_on DESC, item_id ASC
      LIMIT ?
    `,
    )
    .all(regimeId, PROVISION_PREVIEW_LIMIT) as ProvisionSummaryRow[];

  return rows;
}
