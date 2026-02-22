import type { Database } from 'better-sqlite3';

import { parseJsonArray, parseJsonField, sqlLikePattern } from './sanctions-utils.js';

export interface GetProvisionInput {
  source_id: string;
  item_id: string;
  include_related?: boolean;
}

export interface RelatedProvision {
  source_id: string;
  item_id: string;
  title: string;
  kind: string;
  regime_id: string | null;
  official_url: string;
}

export interface ProvisionDetail {
  source_id: string;
  source_name: string;
  item_id: string;
  title: string;
  text: string;
  parent: string | null;
  kind: string;
  regime_id: string | null;
  regime_name: string | null;
  issued_on: string | null;
  official_url: string;
  topics: string[];
  metadata: Record<string, unknown> | null;
  related: RelatedProvision[] | null;
}

interface ProvisionRow {
  source_id: string;
  source_name: string;
  item_id: string;
  title: string;
  text: string;
  parent: string | null;
  kind: string;
  regime_id: string | null;
  regime_name: string | null;
  issued_on: string | null;
  official_url: string;
  topics: string;
  metadata: string | null;
}

interface RelatedProvisionRow {
  source_id: string;
  item_id: string;
  title: string;
  kind: string;
  regime_id: string | null;
  official_url: string;
}

const RELATED_LIMIT = 5;

export async function getProvision(
  db: Database,
  input: GetProvisionInput,
): Promise<ProvisionDetail | null> {
  const sourceId = input.source_id?.trim();
  const itemId = input.item_id?.trim();

  if (!sourceId) {
    throw new Error('source_id is required');
  }

  if (!itemId) {
    throw new Error('item_id is required');
  }

  const row = db
    .prepare(
      `
      SELECT
        p.source_id,
        s.name AS source_name,
        p.item_id,
        p.title,
        p.text,
        p.parent,
        p.kind,
        p.regime_id,
        r.name AS regime_name,
        p.issued_on,
        p.url AS official_url,
        p.topics,
        p.metadata
      FROM provisions p
      JOIN sources s ON s.id = p.source_id
      LEFT JOIN sanctions_regimes r ON r.id = p.regime_id
      WHERE p.source_id = ? AND p.item_id = ?
    `,
    )
    .get(sourceId, itemId) as ProvisionRow | undefined;

  if (!row) {
    return null;
  }

  const topics = parseJsonArray(row.topics);
  const metadata = parseJsonField<Record<string, unknown>>(row.metadata);

  const related = input.include_related
    ? getRelatedProvisions(db, row.source_id, row.item_id, row.regime_id, topics)
    : null;

  return {
    source_id: row.source_id,
    source_name: row.source_name,
    item_id: row.item_id,
    title: row.title,
    text: row.text,
    parent: row.parent,
    kind: row.kind,
    regime_id: row.regime_id,
    regime_name: row.regime_name,
    issued_on: row.issued_on,
    official_url: row.official_url,
    topics,
    metadata,
    related,
  };
}

function getRelatedProvisions(
  db: Database,
  sourceId: string,
  itemId: string,
  regimeId: string | null,
  topics: string[],
): RelatedProvision[] {
  if (regimeId) {
    const rows = db
      .prepare(
        `
        SELECT source_id, item_id, title, kind, regime_id, url AS official_url
        FROM provisions
        WHERE regime_id = ? AND NOT (source_id = ? AND item_id = ?)
        ORDER BY issued_on DESC, item_id ASC
        LIMIT ?
      `,
      )
      .all(regimeId, sourceId, itemId, RELATED_LIMIT) as RelatedProvisionRow[];

    return rows;
  }

  if (topics.length === 0) {
    return [];
  }

  const primaryTopic = topics[0].toLowerCase();
  const rows = db
    .prepare(
      `
      SELECT source_id, item_id, title, kind, regime_id, url AS official_url
      FROM provisions
      WHERE LOWER(topics) LIKE ?
        AND NOT (source_id = ? AND item_id = ?)
      ORDER BY issued_on DESC, item_id ASC
      LIMIT ?
    `,
    )
    .all(sqlLikePattern(primaryTopic), sourceId, itemId, RELATED_LIMIT) as RelatedProvisionRow[];

  return rows;
}
