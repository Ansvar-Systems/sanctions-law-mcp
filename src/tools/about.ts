import type { Database } from 'better-sqlite3';

export interface AboutResult {
  name: string;
  package: string;
  version: string;
  category: string;
  description: string;
  stats: {
    total_items: number;
    total_sources: number;
    provisions: number;
    executive_orders: number;
    delisting_procedures: number;
    export_controls: number;
    sanctions_case_law: number;
    sanctions_regimes: number;
  };
  data_sources: Array<{
    name: string;
    url: string;
    authority: string;
  }>;
  freshness: {
    last_ingestion: string;
    database_built: string;
  };
  disclaimer: string;
  network: {
    name: string;
    directory: string;
    total_servers: number;
  };
  supported_tools: string[];
}

interface CountRow {
  count: number;
}

interface SourceRow {
  name: string;
  official_portal: string;
  authority: string;
}

export async function about(db: Database): Promise<AboutResult> {
  const sources = queryCount(db, 'SELECT COUNT(*) AS count FROM sources');
  const sanctionsRegimes = queryCount(db, 'SELECT COUNT(*) AS count FROM sanctions_regimes');
  const provisions = queryCount(db, 'SELECT COUNT(*) AS count FROM provisions');
  const executiveOrders = queryCount(db, 'SELECT COUNT(*) AS count FROM executive_orders');
  const delistingProcedures = queryCount(db, 'SELECT COUNT(*) AS count FROM delisting_procedures');
  const exportControls = queryCount(db, 'SELECT COUNT(*) AS count FROM export_controls');
  const sanctionsCaseLaw = queryCount(db, 'SELECT COUNT(*) AS count FROM sanctions_case_law');
  const totalItems = provisions + executiveOrders + delistingProcedures + exportControls + sanctionsCaseLaw;

  const sourceRows = db.prepare('SELECT name, official_portal, authority FROM sources').all() as SourceRow[];

  return {
    name: 'Sanctions Law MCP',
    package: '@ansvar/sanctions-law-mcp',
    version: '0.1.0',
    category: 'threat_intel',
    description:
      'Legal-basis retrieval for sanctions frameworks across UN, EU, US, UK, and CJEU case law. Not an entity-screening sanctions list.',
    stats: {
      total_items: totalItems,
      total_sources: sources,
      provisions,
      executive_orders: executiveOrders,
      delisting_procedures: delistingProcedures,
      export_controls: exportControls,
      sanctions_case_law: sanctionsCaseLaw,
      sanctions_regimes: sanctionsRegimes,
    },
    data_sources: sourceRows.map((s) => ({
      name: s.name,
      url: s.official_portal,
      authority: s.authority,
    })),
    freshness: {
      last_ingestion: '2026-02-22',
      database_built: '2026-02-22',
    },
    disclaimer:
      'This is a reference tool, not professional advice. Verify critical data against authoritative sources. This tool provides legal-basis research, NOT entity screening.',
    network: {
      name: 'Ansvar MCP Network',
      directory: 'https://ansvar.ai/mcp',
      total_servers: 80,
    },
    supported_tools: [
      'search_sanctions_law',
      'get_provision',
      'get_sanctions_regime',
      'get_executive_order',
      'check_cyber_sanctions',
      'get_delisting_procedure',
      'get_export_control',
      'search_sanctions_case_law',
      'list_sources',
      'about',
      'check_data_freshness',
    ],
  };
}

function queryCount(db: Database, sql: string): number {
  const row = db.prepare(sql).get() as CountRow;
  return row.count;
}
