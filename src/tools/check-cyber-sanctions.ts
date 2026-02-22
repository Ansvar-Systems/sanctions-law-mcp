import type { Database } from 'better-sqlite3';

import { normalizeLimit, normalizeStringArray, parseJsonArray, sqlLikePattern } from './sanctions-utils.js';

export interface CheckCyberSanctionsInput {
  jurisdiction?: string;
  query?: string;
  limit?: number;
}

export interface CyberRegimeResult {
  regime_id: string;
  name: string;
  jurisdiction: string;
  authority: string;
  official_url: string;
}

export interface CyberExecutiveOrderResult {
  id: string;
  order_number: string;
  title: string;
  issued_on: string;
  jurisdiction: string;
  official_url: string;
}

export interface CyberProvisionResult {
  source_id: string;
  item_id: string;
  title: string;
  regime_id: string | null;
  jurisdiction: string;
  official_url: string;
  topics: string[];
}

export interface CheckCyberSanctionsResult {
  matched_query: string | null;
  jurisdictions_applied: string[];
  regimes: CyberRegimeResult[];
  executive_orders: CyberExecutiveOrderResult[];
  provisions: CyberProvisionResult[];
}

interface CyberRegimeRow {
  regime_id: string;
  name: string;
  jurisdiction: string;
  authority: string;
  official_url: string;
}

interface CyberExecutiveOrderRow {
  id: string;
  order_number: string;
  title: string;
  issued_on: string;
  regime_jurisdiction: string | null;
  source_id: string;
  official_url: string;
}

interface CyberProvisionRow {
  source_id: string;
  item_id: string;
  title: string;
  regime_id: string | null;
  regime_jurisdiction: string | null;
  official_url: string;
  topics: string;
}

export async function checkCyberSanctions(
  db: Database,
  input: CheckCyberSanctionsInput,
): Promise<CheckCyberSanctionsResult> {
  const limit = normalizeLimit(input.limit, 10);
  const jurisdictions = normalizeStringArray(
    input.jurisdiction ? [input.jurisdiction] : undefined,
  );

  const queryTerm = input.query?.trim() ?? '';
  const queryFilter = queryTerm.length > 0 ? sqlLikePattern(queryTerm) : null;

  const regimes = db
    .prepare(
      `
      SELECT
        id AS regime_id,
        name,
        jurisdiction,
        authority,
        official_url
      FROM sanctions_regimes
      WHERE cyber_related = 1
      ORDER BY jurisdiction, name
      LIMIT ?
    `,
    )
    .all(limit) as CyberRegimeRow[];

  const filteredRegimes = jurisdictions.length > 0
    ? regimes.filter((regime) => jurisdictions.includes(regime.jurisdiction))
    : regimes;

  let executiveOrderSql = `
    SELECT
      eo.id,
      eo.order_number,
      eo.title,
      eo.issued_on,
      r.jurisdiction AS regime_jurisdiction,
      eo.source_id,
      eo.official_url
    FROM executive_orders eo
    LEFT JOIN sanctions_regimes r ON r.id = eo.regime_id
    WHERE eo.cyber_related = 1
  `;

  const executiveOrderParams: Array<string | number> = [];
  if (queryFilter) {
    executiveOrderSql += ` AND (LOWER(eo.title) LIKE ? OR LOWER(eo.summary) LIKE ?)`;
    executiveOrderParams.push(queryFilter, queryFilter);
  }

  executiveOrderSql += ` ORDER BY eo.issued_on DESC LIMIT ?`;
  executiveOrderParams.push(limit);

  const executiveOrders = db
    .prepare(executiveOrderSql)
    .all(...executiveOrderParams) as CyberExecutiveOrderRow[];

  const normalizedExecutiveOrders = executiveOrders
    .map((order) => ({
      id: order.id,
      order_number: order.order_number,
      title: order.title,
      issued_on: order.issued_on,
      jurisdiction: order.regime_jurisdiction ?? inferJurisdiction(order.source_id),
      official_url: order.official_url,
    }))
    .filter((order) => jurisdictions.length === 0 || jurisdictions.includes(order.jurisdiction));

  let provisionSql = `
    SELECT
      p.source_id,
      p.item_id,
      p.title,
      p.regime_id,
      r.jurisdiction AS regime_jurisdiction,
      p.url AS official_url,
      p.topics
    FROM provisions p
    LEFT JOIN sanctions_regimes r ON r.id = p.regime_id
    WHERE LOWER(p.topics) LIKE ?
  `;

  const provisionParams: Array<string | number> = [sqlLikePattern('cyber')];

  if (queryFilter) {
    provisionSql += ` AND (LOWER(p.title) LIKE ? OR LOWER(p.text) LIKE ?)`;
    provisionParams.push(queryFilter, queryFilter);
  }

  provisionSql += ` ORDER BY p.issued_on DESC, p.item_id ASC LIMIT ?`;
  provisionParams.push(limit);

  const provisions = db.prepare(provisionSql).all(...provisionParams) as CyberProvisionRow[];

  const normalizedProvisions = provisions
    .map((provision) => ({
      source_id: provision.source_id,
      item_id: provision.item_id,
      title: provision.title,
      regime_id: provision.regime_id,
      jurisdiction: provision.regime_jurisdiction ?? inferJurisdiction(provision.source_id),
      official_url: provision.official_url,
      topics: parseJsonArray(provision.topics),
    }))
    .filter((provision) => jurisdictions.length === 0 || jurisdictions.includes(provision.jurisdiction));

  return {
    matched_query: queryTerm.length > 0 ? queryTerm : null,
    jurisdictions_applied: jurisdictions,
    regimes: filteredRegimes,
    executive_orders: normalizedExecutiveOrders,
    provisions: normalizedProvisions,
  };
}

function inferJurisdiction(sourceId: string): string {
  if (sourceId.startsWith('UN_')) {
    return 'UN';
  }
  if (sourceId.startsWith('EU_')) {
    return 'EU';
  }
  if (sourceId.startsWith('US_')) {
    return 'US';
  }
  if (sourceId.startsWith('UK_')) {
    return 'UK';
  }
  return 'INTL';
}
