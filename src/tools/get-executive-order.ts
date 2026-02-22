import type { Database } from 'better-sqlite3';

import { parseJsonArray } from './sanctions-utils.js';

export interface GetExecutiveOrderInput {
  order_number: string;
  include_related_provisions?: boolean;
}

export interface ExecutiveOrderProvisionSummary {
  source_id: string;
  item_id: string;
  title: string;
  kind: string;
  official_url: string;
}

export interface ExecutiveOrderDetail {
  id: string;
  source_id: string;
  source_name: string;
  regime_id: string | null;
  regime_name: string | null;
  order_number: string;
  title: string;
  issued_on: string;
  status: 'active' | 'amended' | 'revoked';
  summary: string;
  cyber_related: boolean;
  legal_basis: string[];
  official_url: string;
  related_provisions: ExecutiveOrderProvisionSummary[] | null;
}

interface ExecutiveOrderRow {
  id: string;
  source_id: string;
  source_name: string;
  regime_id: string | null;
  regime_name: string | null;
  order_number: string;
  title: string;
  issued_on: string;
  status: 'active' | 'amended' | 'revoked';
  summary: string;
  cyber_related: number;
  legal_basis: string;
  official_url: string;
}

interface RelatedProvisionRow {
  source_id: string;
  item_id: string;
  title: string;
  kind: string;
  official_url: string;
}

const RELATED_LIMIT = 5;

export async function getExecutiveOrder(
  db: Database,
  input: GetExecutiveOrderInput,
): Promise<ExecutiveOrderDetail | null> {
  const orderNumber = input.order_number?.trim();

  if (!orderNumber) {
    throw new Error('order_number is required');
  }

  const row = db
    .prepare(
      `
      SELECT
        eo.id,
        eo.source_id,
        s.name AS source_name,
        eo.regime_id,
        r.name AS regime_name,
        eo.order_number,
        eo.title,
        eo.issued_on,
        eo.status,
        eo.summary,
        eo.cyber_related,
        eo.legal_basis,
        eo.official_url
      FROM executive_orders eo
      JOIN sources s ON s.id = eo.source_id
      LEFT JOIN sanctions_regimes r ON r.id = eo.regime_id
      WHERE eo.order_number = ? OR eo.id = ?
      LIMIT 1
    `,
    )
    .get(orderNumber, orderNumber) as ExecutiveOrderRow | undefined;

  if (!row) {
    return null;
  }

  const relatedProvisions = input.include_related_provisions
    ? getRelatedProvisions(db, row.source_id, row.regime_id)
    : null;

  return {
    id: row.id,
    source_id: row.source_id,
    source_name: row.source_name,
    regime_id: row.regime_id,
    regime_name: row.regime_name,
    order_number: row.order_number,
    title: row.title,
    issued_on: row.issued_on,
    status: row.status,
    summary: row.summary,
    cyber_related: row.cyber_related === 1,
    legal_basis: parseJsonArray(row.legal_basis),
    official_url: row.official_url,
    related_provisions: relatedProvisions,
  };
}

function getRelatedProvisions(
  db: Database,
  sourceId: string,
  regimeId: string | null,
): ExecutiveOrderProvisionSummary[] {
  if (regimeId) {
    return db
      .prepare(
        `
        SELECT source_id, item_id, title, kind, url AS official_url
        FROM provisions
        WHERE regime_id = ?
        ORDER BY issued_on DESC, item_id ASC
        LIMIT ?
      `,
      )
      .all(regimeId, RELATED_LIMIT) as RelatedProvisionRow[];
  }

  return db
    .prepare(
      `
      SELECT source_id, item_id, title, kind, url AS official_url
      FROM provisions
      WHERE source_id = ?
        AND kind IN ('executive_order_section', 'guidance')
      ORDER BY issued_on DESC, item_id ASC
      LIMIT ?
    `,
    )
    .all(sourceId, RELATED_LIMIT) as RelatedProvisionRow[];
}
