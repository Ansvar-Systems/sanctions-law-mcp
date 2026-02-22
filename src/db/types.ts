export type Priority = 'critical' | 'high' | 'medium' | 'low';
export type FreshnessStatus = 'fresh' | 'warning' | 'stale' | 'planned';

export interface SourceRecord {
  id: string;
  name: string;
  authority: string;
  official_portal: string;
  retrieval_method: string;
  update_frequency: string;
  records_estimate: string;
  priority: Priority;
  coverage_note: string;
  last_verified: string;
  metadata?: Record<string, unknown> | null;
}

export interface SanctionsRegimeRecord {
  id: string;
  name: string;
  jurisdiction: string;
  authority: string;
  summary: string;
  legal_basis: string[];
  cyber_related: boolean;
  delisting_procedure_id?: string | null;
  official_url: string;
}

export interface ProvisionRecord {
  source_id: string;
  item_id: string;
  title: string;
  text: string;
  parent: string | null;
  kind: string;
  regime_id?: string | null;
  issued_on?: string | null;
  url: string;
  topics: string[];
  metadata?: Record<string, unknown> | null;
}

export interface ExecutiveOrderRecord {
  id: string;
  source_id: string;
  regime_id?: string | null;
  order_number: string;
  title: string;
  issued_on: string;
  status: 'active' | 'amended' | 'revoked';
  summary: string;
  cyber_related: boolean;
  legal_basis: string[];
  official_url: string;
}

export interface DelistingProcedureRecord {
  id: string;
  regime_id: string;
  authority: string;
  procedure_summary: string;
  evidentiary_standard: string;
  review_body: string;
  review_timeline: string;
  application_url: string;
  legal_basis: string[];
}

export interface ExportControlRecord {
  id: string;
  source_id: string;
  jurisdiction: string;
  instrument: string;
  section: string;
  title: string;
  summary: string;
  focus: string;
  official_url: string;
}

export interface SanctionsCaseLawRecord {
  id: string;
  source_id: string;
  court: string;
  case_reference: string;
  title: string;
  decision_date: string;
  regime_id?: string | null;
  delisting_related: boolean;
  outcome: string;
  summary: string;
  keywords: string[];
  official_url: string;
}

export interface SourceFreshnessRecord {
  source_id: string;
  last_checked: string;
  last_updated: string;
  check_frequency: string;
  status: FreshnessStatus;
  notes: string;
}

export interface SanctionsSeed {
  schema_version: string;
  generated_on: string;
  sources: SourceRecord[];
  sanctions_regimes: SanctionsRegimeRecord[];
  provisions: ProvisionRecord[];
  executive_orders: ExecutiveOrderRecord[];
  delisting_procedures: DelistingProcedureRecord[];
  export_controls: ExportControlRecord[];
  sanctions_case_law: SanctionsCaseLawRecord[];
  source_freshness: SourceFreshnessRecord[];
}
