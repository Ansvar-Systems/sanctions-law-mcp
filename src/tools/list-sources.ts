import type { Database } from 'better-sqlite3';

import { parseJsonField } from './sanctions-utils.js';

export interface ListSourcesInput {
  source_id?: string;
  include_samples?: boolean;
}

export interface SourceSummary {
  id: string;
  name: string;
  authority: string;
  official_portal: string;
  update_frequency: string;
  priority: string;
  records_estimate: string;
  provision_count: number;
  regime_count: number;
  case_law_count: number;
  freshness_status: string | null;
  last_updated: string | null;
}

export interface SourceDetail extends SourceSummary {
  coverage_note: string;
  last_verified: string;
  metadata: Record<string, unknown> | null;
  sample_items: Array<{
    item_id: string;
    title: string;
    kind: string;
    official_url: string;
  }>;
}

export interface ListSourcesResult {
  sources: SourceSummary[];
  source: SourceDetail | null;
}

interface SourceSummaryRow extends SourceSummary {}

interface SourceDetailRow extends SourceSummaryRow {
  coverage_note: string;
  last_verified: string;
  metadata: string | null;
}

interface SampleItemRow {
  item_id: string;
  title: string;
  kind: string;
  official_url: string;
}

const SAMPLE_LIMIT = 5;

export async function listSources(
  db: Database,
  input: ListSourcesInput,
): Promise<ListSourcesResult> {
  const sources = db
    .prepare(
      `
      SELECT
        s.id,
        s.name,
        s.authority,
        s.official_portal,
        s.update_frequency,
        s.priority,
        s.records_estimate,
        (SELECT COUNT(*) FROM provisions p WHERE p.source_id = s.id) AS provision_count,
        (SELECT COUNT(DISTINCT p.regime_id) FROM provisions p WHERE p.source_id = s.id AND p.regime_id IS NOT NULL) AS regime_count,
        (SELECT COUNT(*) FROM sanctions_case_law c WHERE c.source_id = s.id) AS case_law_count,
        sf.status AS freshness_status,
        sf.last_updated AS last_updated
      FROM sources s
      LEFT JOIN source_freshness sf ON sf.source_id = s.id
      ORDER BY
        CASE s.priority
          WHEN 'critical' THEN 0
          WHEN 'high' THEN 1
          WHEN 'medium' THEN 2
          ELSE 3
        END,
        s.id
    `,
    )
    .all() as SourceSummaryRow[];

  if (!input.source_id || input.source_id.trim().length === 0) {
    return {
      sources,
      source: null,
    };
  }

  const sourceId = input.source_id.trim();
  const detailRow = db
    .prepare(
      `
      SELECT
        s.id,
        s.name,
        s.authority,
        s.official_portal,
        s.update_frequency,
        s.priority,
        s.records_estimate,
        (SELECT COUNT(*) FROM provisions p WHERE p.source_id = s.id) AS provision_count,
        (SELECT COUNT(DISTINCT p.regime_id) FROM provisions p WHERE p.source_id = s.id AND p.regime_id IS NOT NULL) AS regime_count,
        (SELECT COUNT(*) FROM sanctions_case_law c WHERE c.source_id = s.id) AS case_law_count,
        sf.status AS freshness_status,
        sf.last_updated AS last_updated,
        s.coverage_note,
        s.last_verified,
        s.metadata
      FROM sources s
      LEFT JOIN source_freshness sf ON sf.source_id = s.id
      WHERE s.id = ?
      LIMIT 1
    `,
    )
    .get(sourceId) as SourceDetailRow | undefined;

  if (!detailRow) {
    return {
      sources,
      source: null,
    };
  }

  const sampleItems = input.include_samples
    ? (db
        .prepare(
          `
          SELECT item_id, title, kind, url AS official_url
          FROM provisions
          WHERE source_id = ?
          ORDER BY issued_on DESC, item_id ASC
          LIMIT ?
        `,
        )
        .all(sourceId, SAMPLE_LIMIT) as SampleItemRow[])
    : [];

  return {
    sources,
    source: {
      id: detailRow.id,
      name: detailRow.name,
      authority: detailRow.authority,
      official_portal: detailRow.official_portal,
      update_frequency: detailRow.update_frequency,
      priority: detailRow.priority,
      records_estimate: detailRow.records_estimate,
      provision_count: detailRow.provision_count,
      regime_count: detailRow.regime_count,
      case_law_count: detailRow.case_law_count,
      freshness_status: detailRow.freshness_status,
      last_updated: detailRow.last_updated,
      coverage_note: detailRow.coverage_note,
      last_verified: detailRow.last_verified,
      metadata: parseJsonField<Record<string, unknown>>(detailRow.metadata),
      sample_items: sampleItems,
    },
  };
}
