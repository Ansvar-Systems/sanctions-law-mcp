import type { Database } from 'better-sqlite3';
import type {
  DelistingProcedureRecord,
  ExecutiveOrderRecord,
  ExportControlRecord,
  ProvisionRecord,
  SanctionsCaseLawRecord,
  SanctionsRegimeRecord,
  SanctionsSeed,
  SourceFreshnessRecord,
  SourceRecord,
} from './types.js';

type PreparedStatement = {
  run: (...params: unknown[]) => unknown;
};

const SCHEMA_SQL = `
DROP TRIGGER IF EXISTS provisions_ai;
DROP TRIGGER IF EXISTS provisions_ad;
DROP TRIGGER IF EXISTS provisions_au;

DROP TABLE IF EXISTS source_freshness;
DROP TABLE IF EXISTS sanctions_case_law;
DROP TABLE IF EXISTS export_controls;
DROP TABLE IF EXISTS delisting_procedures;
DROP TABLE IF EXISTS executive_orders;
DROP TABLE IF EXISTS provisions;
DROP TABLE IF EXISTS sanctions_regimes;
DROP TABLE IF EXISTS sources;
DROP TABLE IF EXISTS provisions_fts;

CREATE TABLE sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  authority TEXT NOT NULL,
  official_portal TEXT NOT NULL,
  retrieval_method TEXT NOT NULL,
  update_frequency TEXT NOT NULL,
  records_estimate TEXT NOT NULL,
  priority TEXT NOT NULL,
  coverage_note TEXT NOT NULL,
  last_verified TEXT NOT NULL,
  metadata TEXT
);

CREATE TABLE sanctions_regimes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  jurisdiction TEXT NOT NULL,
  authority TEXT NOT NULL,
  summary TEXT NOT NULL,
  legal_basis TEXT NOT NULL,
  cyber_related INTEGER NOT NULL CHECK (cyber_related IN (0, 1)),
  delisting_procedure_id TEXT,
  official_url TEXT NOT NULL
);

CREATE TABLE provisions (
  rowid INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  parent TEXT,
  kind TEXT NOT NULL,
  regime_id TEXT,
  issued_on TEXT,
  url TEXT NOT NULL,
  topics TEXT NOT NULL,
  metadata TEXT,
  UNIQUE (source_id, item_id),
  FOREIGN KEY (source_id) REFERENCES sources(id),
  FOREIGN KEY (regime_id) REFERENCES sanctions_regimes(id)
);

CREATE VIRTUAL TABLE provisions_fts USING fts5(
  source_id UNINDEXED,
  item_id UNINDEXED,
  title,
  text,
  parent,
  regime_id,
  kind,
  topics,
  content='provisions',
  content_rowid='rowid'
);

CREATE TRIGGER provisions_ai AFTER INSERT ON provisions BEGIN
  INSERT INTO provisions_fts(rowid, source_id, item_id, title, text, parent, regime_id, kind, topics)
  VALUES (new.rowid, new.source_id, new.item_id, new.title, new.text, new.parent, new.regime_id, new.kind, new.topics);
END;

CREATE TRIGGER provisions_ad AFTER DELETE ON provisions BEGIN
  INSERT INTO provisions_fts(provisions_fts, rowid, source_id, item_id, title, text, parent, regime_id, kind, topics)
  VALUES ('delete', old.rowid, old.source_id, old.item_id, old.title, old.text, old.parent, old.regime_id, old.kind, old.topics);
END;

CREATE TRIGGER provisions_au AFTER UPDATE ON provisions BEGIN
  INSERT INTO provisions_fts(provisions_fts, rowid, source_id, item_id, title, text, parent, regime_id, kind, topics)
  VALUES ('delete', old.rowid, old.source_id, old.item_id, old.title, old.text, old.parent, old.regime_id, old.kind, old.topics);
  INSERT INTO provisions_fts(rowid, source_id, item_id, title, text, parent, regime_id, kind, topics)
  VALUES (new.rowid, new.source_id, new.item_id, new.title, new.text, new.parent, new.regime_id, new.kind, new.topics);
END;

CREATE TABLE executive_orders (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  regime_id TEXT,
  order_number TEXT NOT NULL,
  title TEXT NOT NULL,
  issued_on TEXT NOT NULL,
  status TEXT NOT NULL,
  summary TEXT NOT NULL,
  cyber_related INTEGER NOT NULL CHECK (cyber_related IN (0, 1)),
  legal_basis TEXT NOT NULL,
  official_url TEXT NOT NULL,
  FOREIGN KEY (source_id) REFERENCES sources(id),
  FOREIGN KEY (regime_id) REFERENCES sanctions_regimes(id)
);

CREATE TABLE delisting_procedures (
  id TEXT PRIMARY KEY,
  regime_id TEXT NOT NULL,
  authority TEXT NOT NULL,
  procedure_summary TEXT NOT NULL,
  evidentiary_standard TEXT NOT NULL,
  review_body TEXT NOT NULL,
  review_timeline TEXT NOT NULL,
  application_url TEXT NOT NULL,
  legal_basis TEXT NOT NULL,
  FOREIGN KEY (regime_id) REFERENCES sanctions_regimes(id)
);

CREATE TABLE export_controls (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  jurisdiction TEXT NOT NULL,
  instrument TEXT NOT NULL,
  section TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  focus TEXT NOT NULL,
  official_url TEXT NOT NULL,
  FOREIGN KEY (source_id) REFERENCES sources(id)
);

CREATE TABLE sanctions_case_law (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  court TEXT NOT NULL,
  case_reference TEXT NOT NULL,
  title TEXT NOT NULL,
  decision_date TEXT NOT NULL,
  regime_id TEXT,
  delisting_related INTEGER NOT NULL CHECK (delisting_related IN (0, 1)),
  outcome TEXT NOT NULL,
  summary TEXT NOT NULL,
  keywords TEXT NOT NULL,
  official_url TEXT NOT NULL,
  FOREIGN KEY (source_id) REFERENCES sources(id),
  FOREIGN KEY (regime_id) REFERENCES sanctions_regimes(id)
);

CREATE TABLE source_freshness (
  source_id TEXT PRIMARY KEY,
  last_checked TEXT NOT NULL,
  last_updated TEXT NOT NULL,
  check_frequency TEXT NOT NULL,
  status TEXT NOT NULL,
  notes TEXT NOT NULL,
  FOREIGN KEY (source_id) REFERENCES sources(id)
);

CREATE INDEX idx_provisions_source ON provisions(source_id);
CREATE INDEX idx_provisions_regime ON provisions(regime_id);
CREATE INDEX idx_regimes_jurisdiction ON sanctions_regimes(jurisdiction);
CREATE INDEX idx_executive_orders_order_number ON executive_orders(order_number);
CREATE INDEX idx_case_law_regime ON sanctions_case_law(regime_id);
`;

export function createSanctionsSchema(db: Database): void {
  db.exec(SCHEMA_SQL);
}

export function seedSanctionsDatabase(db: Database, seed: SanctionsSeed): void {
  const insertSource = db.prepare(`
    INSERT INTO sources (
      id,
      name,
      authority,
      official_portal,
      retrieval_method,
      update_frequency,
      records_estimate,
      priority,
      coverage_note,
      last_verified,
      metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertRegime = db.prepare(`
    INSERT INTO sanctions_regimes (
      id,
      name,
      jurisdiction,
      authority,
      summary,
      legal_basis,
      cyber_related,
      delisting_procedure_id,
      official_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertProvision = db.prepare(`
    INSERT INTO provisions (
      source_id,
      item_id,
      title,
      text,
      parent,
      kind,
      regime_id,
      issued_on,
      url,
      topics,
      metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertExecutiveOrder = db.prepare(`
    INSERT INTO executive_orders (
      id,
      source_id,
      regime_id,
      order_number,
      title,
      issued_on,
      status,
      summary,
      cyber_related,
      legal_basis,
      official_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertDelistingProcedure = db.prepare(`
    INSERT INTO delisting_procedures (
      id,
      regime_id,
      authority,
      procedure_summary,
      evidentiary_standard,
      review_body,
      review_timeline,
      application_url,
      legal_basis
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertExportControl = db.prepare(`
    INSERT INTO export_controls (
      id,
      source_id,
      jurisdiction,
      instrument,
      section,
      title,
      summary,
      focus,
      official_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertCaseLaw = db.prepare(`
    INSERT INTO sanctions_case_law (
      id,
      source_id,
      court,
      case_reference,
      title,
      decision_date,
      regime_id,
      delisting_related,
      outcome,
      summary,
      keywords,
      official_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertFreshness = db.prepare(`
    INSERT INTO source_freshness (
      source_id,
      last_checked,
      last_updated,
      check_frequency,
      status,
      notes
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    for (const source of seed.sources) {
      insertSourceRecord(insertSource, source);
    }

    for (const regime of seed.sanctions_regimes) {
      insertRegimeRecord(insertRegime, regime);
    }

    for (const provision of seed.provisions) {
      insertProvisionRecord(insertProvision, provision);
    }

    for (const executiveOrder of seed.executive_orders) {
      insertExecutiveOrderRecord(insertExecutiveOrder, executiveOrder);
    }

    for (const procedure of seed.delisting_procedures) {
      insertDelistingProcedureRecord(insertDelistingProcedure, procedure);
    }

    for (const control of seed.export_controls) {
      insertExportControlRecord(insertExportControl, control);
    }

    for (const caseLaw of seed.sanctions_case_law) {
      insertCaseLawRecord(insertCaseLaw, caseLaw);
    }

    for (const freshness of seed.source_freshness) {
      insertFreshnessRecord(insertFreshness, freshness);
    }
  });

  transaction();
}

function insertSourceRecord(statement: PreparedStatement, source: SourceRecord): void {
  statement.run(
    source.id,
    source.name,
    source.authority,
    source.official_portal,
    source.retrieval_method,
    source.update_frequency,
    source.records_estimate,
    source.priority,
    source.coverage_note,
    source.last_verified,
    optionalJson(source.metadata),
  );
}

function insertRegimeRecord(statement: PreparedStatement, regime: SanctionsRegimeRecord): void {
  statement.run(
    regime.id,
    regime.name,
    regime.jurisdiction,
    regime.authority,
    regime.summary,
    JSON.stringify(regime.legal_basis),
    regime.cyber_related ? 1 : 0,
    regime.delisting_procedure_id ?? null,
    regime.official_url,
  );
}

function insertProvisionRecord(statement: PreparedStatement, provision: ProvisionRecord): void {
  statement.run(
    provision.source_id,
    provision.item_id,
    provision.title,
    provision.text,
    provision.parent,
    provision.kind,
    provision.regime_id ?? null,
    provision.issued_on ?? null,
    provision.url,
    JSON.stringify(provision.topics),
    optionalJson(provision.metadata),
  );
}

function insertExecutiveOrderRecord(
  statement: PreparedStatement,
  executiveOrder: ExecutiveOrderRecord,
): void {
  statement.run(
    executiveOrder.id,
    executiveOrder.source_id,
    executiveOrder.regime_id ?? null,
    executiveOrder.order_number,
    executiveOrder.title,
    executiveOrder.issued_on,
    executiveOrder.status,
    executiveOrder.summary,
    executiveOrder.cyber_related ? 1 : 0,
    JSON.stringify(executiveOrder.legal_basis),
    executiveOrder.official_url,
  );
}

function insertDelistingProcedureRecord(
  statement: PreparedStatement,
  procedure: DelistingProcedureRecord,
): void {
  statement.run(
    procedure.id,
    procedure.regime_id,
    procedure.authority,
    procedure.procedure_summary,
    procedure.evidentiary_standard,
    procedure.review_body,
    procedure.review_timeline,
    procedure.application_url,
    JSON.stringify(procedure.legal_basis),
  );
}

function insertExportControlRecord(statement: PreparedStatement, control: ExportControlRecord): void {
  statement.run(
    control.id,
    control.source_id,
    control.jurisdiction,
    control.instrument,
    control.section,
    control.title,
    control.summary,
    control.focus,
    control.official_url,
  );
}

function insertCaseLawRecord(statement: PreparedStatement, caseLaw: SanctionsCaseLawRecord): void {
  statement.run(
    caseLaw.id,
    caseLaw.source_id,
    caseLaw.court,
    caseLaw.case_reference,
    caseLaw.title,
    caseLaw.decision_date,
    caseLaw.regime_id ?? null,
    caseLaw.delisting_related ? 1 : 0,
    caseLaw.outcome,
    caseLaw.summary,
    JSON.stringify(caseLaw.keywords),
    caseLaw.official_url,
  );
}

function insertFreshnessRecord(statement: PreparedStatement, freshness: SourceFreshnessRecord): void {
  statement.run(
    freshness.source_id,
    freshness.last_checked,
    freshness.last_updated,
    freshness.check_frequency,
    freshness.status,
    freshness.notes,
  );
}

function optionalJson(value: Record<string, unknown> | null | undefined): string | null {
  if (!value) {
    return null;
  }
  return JSON.stringify(value);
}

export function summarizeSeed(seed: SanctionsSeed): Record<string, number> {
  return {
    sources: seed.sources.length,
    sanctions_regimes: seed.sanctions_regimes.length,
    provisions: seed.provisions.length,
    executive_orders: seed.executive_orders.length,
    delisting_procedures: seed.delisting_procedures.length,
    export_controls: seed.export_controls.length,
    sanctions_case_law: seed.sanctions_case_law.length,
    source_freshness: seed.source_freshness.length,
  };
}
