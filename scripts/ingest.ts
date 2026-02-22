#!/usr/bin/env tsx
import fs from 'node:fs/promises';
import path from 'node:path';

import { DEFAULT_SANCTIONS_SEED } from '../src/db/default-seed.js';
import { summarizeSeed } from '../src/db/schema.js';
import type {
  DelistingProcedureRecord,
  ExecutiveOrderRecord,
  ExportControlRecord,
  FreshnessStatus,
  ProvisionRecord,
  SanctionsCaseLawRecord,
  SanctionsRegimeRecord,
  SanctionsSeed,
  SourceFreshnessRecord,
  SourceRecord,
} from '../src/db/types.js';

const FULL_CORPUS_FLAG = '--full-corpus';
const SOURCE_FLAG = '--source';
const OUTPUT_FLAG = '--output';
const HELP_FLAGS = new Set(['--help', '-h']);

const DEFAULT_SEED_OUTPUT = 'data/seed/sanctions-seed.json';
const COVERAGE_OUTPUT = 'data/coverage.json';
const COVERAGE_MARKDOWN_OUTPUT = 'COVERAGE.md';

const USER_AGENT =
  'sanctions-law-mcp-ingest/1.0 (+https://github.com/Ansvar-Systems/sanctions-law-mcp)';

const REQUEST_TIMEOUT_MS = 30_000;

const UN_RESOLUTION_QUERIES = [
  'symbol:S/RES/* AND sanctions',
  'symbol:S/RES/* AND embargo',
  'symbol:S/RES/* AND "asset freeze"',
  'symbol:S/RES/* AND "travel ban"',
  'symbol:S/RES/* AND "restrictive measures"',
];

const UN_GUIDANCE_QUERIES = [
  'sanctions committee guidelines',
  'security council sanctions delisting guidelines',
  'sanctions committee exemptions procedures',
  'focal point delisting sanctions committee',
  'travel exemptions sanctions committee',
  'narrative summaries reasons for listing sanctions',
  'implementation assistance notices sanctions committee',
  'procedures for listing sanctions committee',
];

const OFAC_EXECUTIVE_ORDER_TERMS = ['sanctions', 'blocking the property'];

const EU_RESTRICTIVE_FEEDS = [
  'https://www.legislation.gov.uk/eur/data.feed?title=restrictive%20measures',
  'https://www.legislation.gov.uk/eudn/data.feed?title=restrictive%20measures',
];

const UK_SANCTIONS_FEEDS = [
  'https://www.legislation.gov.uk/uksi/data.feed?title=sanctions',
  'https://www.legislation.gov.uk/ukpga/data.feed?title=sanctions',
];

const CJEU_CASELAW_BASE_URL =
  'https://eur-lex.europa.eu/search.html?text=restrictive+measures&type=quick&scope=EURLEX&DTS_SUBDOM=EU_CASE_LAW';
const CJEU_CASELAW_MAX_PAGES = 12;

const LEGISLATION_MAX_PAGES = 12;

interface ParsedArgs {
  mode: 'curated' | 'full-corpus';
  sourceId?: string;
  outputPath?: string;
}

interface UnSearchDoc {
  id?: string;
  url?: string;
  title?: string;
  body?: string;
  ['Data Source']?: string;
}

interface UnSearchResponse {
  docs?: UnSearchDoc[];
}

interface FederalRegisterResult {
  document_number?: string;
  executive_order_number?: string;
  title?: string;
  publication_date?: string;
  html_url?: string;
  abstract?: string | null;
  excerpts?: string | null;
}

interface FederalRegisterResponse {
  total_pages?: number;
  results?: FederalRegisterResult[];
}

interface FeedEntry {
  id: string;
  title: string;
  summary: string;
  updated: string;
  url: string;
}

interface EcfrVersionItem {
  date?: string;
  amendment_date?: string;
  issue_date?: string;
  identifier?: string;
  name?: string;
  part?: string;
  substantive?: boolean;
  removed?: boolean;
  subpart?: string | null;
  title?: string;
  type?: string;
}

interface EcfrVersionsResponse {
  content_versions?: EcfrVersionItem[];
  meta?: {
    latest_amendment_date?: string;
    latest_issue_date?: string;
  };
}

interface FullCorpusHarvest {
  provisions: ProvisionRecord[];
  executiveOrders: ExecutiveOrderRecord[];
  exportControls: ExportControlRecord[];
  caseLaw: SanctionsCaseLawRecord[];
  warnings: string[];
}

function cloneDefaultSeed(): SanctionsSeed {
  return JSON.parse(JSON.stringify(DEFAULT_SANCTIONS_SEED)) as SanctionsSeed;
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, ' ');
}

function decodeHtmlEntities(value: string): string {
  const named = value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

  const withDecimal = named.replace(/&#(\d+);/g, (_match, decimal: string) => {
    const codepoint = Number(decimal);
    if (!Number.isFinite(codepoint)) {
      return _match;
    }
    return String.fromCodePoint(codepoint);
  });

  return withDecimal.replace(/&#x([0-9a-fA-F]+);/g, (_match, hex: string) => {
    const codepoint = Number.parseInt(hex, 16);
    if (!Number.isFinite(codepoint)) {
      return _match;
    }
    return String.fromCodePoint(codepoint);
  });
}

function cleanText(value: string | undefined | null): string {
  if (!value) {
    return '';
  }
  return normalizeWhitespace(decodeHtmlEntities(stripHtml(value)));
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function slug(value: string): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();

  if (normalized.length === 0) {
    return 'UNKNOWN';
  }

  return normalized;
}

function toIsoDate(value: string | undefined | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const dmy = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dmy) {
    const [, dd, mm, yyyy] = dmy;
    return `${yyyy}-${mm}-${dd}`;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

function yearFromText(value: string): string | null {
  const match = value.match(/\b(19|20)\d{2}\b/);
  if (!match) {
    return null;
  }
  return `${match[0]}-01-01`;
}

function extractTopics(value: string): string[] {
  const lower = value.toLowerCase();
  const topics = new Set<string>();

  if (lower.includes('sanction')) topics.add('sanctions');
  if (lower.includes('cyber')) topics.add('cyber');
  if (lower.includes('asset freeze') || lower.includes('freezing of funds')) topics.add('asset_freeze');
  if (lower.includes('travel ban')) topics.add('travel_ban');
  if (lower.includes('embargo')) topics.add('embargo');
  if (lower.includes('delisting') || lower.includes('reconsideration')) topics.add('delisting');
  if (lower.includes('designation') || lower.includes('listed')) topics.add('designation');
  if (lower.includes('export') || lower.includes('dual-use') || lower.includes('licens')) {
    topics.add('export_controls');
  }
  if (lower.includes('russia') || lower.includes('ukraine')) topics.add('russia');
  if (lower.includes('iran')) topics.add('iran');
  if (lower.includes('dprk') || lower.includes('north korea')) topics.add('dprk');

  return Array.from(topics);
}

function inferRegimeId(text: string): string | null {
  const lower = text.toLowerCase();

  if (lower.includes('dprk') || lower.includes('north korea') || lower.includes('1718')) {
    return 'UN_DPRK_1718';
  }

  if (lower.includes('cyber') && lower.includes('union')) {
    return 'EU_CYBER_2019_796';
  }

  if (lower.includes('cyber') && (lower.includes('executive order') || lower.includes('united states'))) {
    return 'US_CYBER_13694';
  }

  if (lower.includes('russia') || lower.includes('ukraine')) {
    return 'EU_RUSSIA_2014';
  }

  if (lower.includes('anti-corruption')) {
    return 'UK_GLOBAL_ANTI_CORRUPTION';
  }

  if (lower.includes('uk') && lower.includes('russia')) {
    return 'UK_RUSSIA_REGIME';
  }

  return null;
}

function safeUrl(value: string | undefined | null): string {
  if (!value) {
    return 'https://example.invalid';
  }

  const trimmed = value.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed.replace(/^http:\/\//i, 'https://');
  }

  if (trimmed.startsWith('./')) {
    return `https://eur-lex.europa.eu/${trimmed.slice(2)}`;
  }

  if (trimmed.startsWith('/')) {
    return `https://eur-lex.europa.eu${trimmed}`;
  }

  return trimmed;
}

function appendWarning(warnings: string[], warning: string): void {
  if (!warnings.includes(warning)) {
    warnings.push(warning);
  }
}

function uniqueBy<T>(records: T[], keyOf: (record: T) => string): T[] {
  const map = new Map<string, T>();
  for (const record of records) {
    map.set(keyOf(record), record);
  }
  return Array.from(map.values());
}

function mergeBy<T>(records: T[], keyOf: (record: T) => string): T[] {
  return uniqueBy(records, keyOf);
}

async function requestText(url: string): Promise<string> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'user-agent': USER_AGENT,
          accept: 'application/json, application/atom+xml, text/html, text/plain, */*',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.text();
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(`request failed for ${url}: ${String(lastError)}`);
}

async function requestJson<T>(url: string): Promise<T> {
  const text = await requestText(url);
  return JSON.parse(text) as T;
}

function extractTag(content: string, tagName: string): string {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = content.match(regex);
  if (!match) {
    return '';
  }
  return cleanText(match[1]);
}

function extractLinkByType(content: string, mimeType: string): string {
  const regex = new RegExp(
    `<link[^>]+rel=\"alternate\"[^>]+type=\"${mimeType.replace('/', '\\/')}\"[^>]+href=\"([^\"]+)\"`,
    'i',
  );
  const match = content.match(regex);
  if (!match) {
    return '';
  }
  return safeUrl(match[1]);
}

function parseFeedEntries(xml: string): FeedEntry[] {
  const entries: FeedEntry[] = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;

  for (const match of xml.matchAll(entryRegex)) {
    const entryXml = match[1];
    const id = extractTag(entryXml, 'id');
    const title = extractTag(entryXml, 'title');
    const summary = extractTag(entryXml, 'summary') || title;
    const updated = toIsoDate(extractTag(entryXml, 'updated')) ?? isoToday();

    let url = extractLinkByType(entryXml, 'text/html');
    if (!url) {
      url = extractLinkByType(entryXml, 'application/xhtml+xml');
    }
    if (!url && id) {
      url = safeUrl(id.replace('/id/', '/'));
    }

    if (!id || !title || !url) {
      continue;
    }

    entries.push({
      id,
      title,
      summary,
      updated,
      url,
    });
  }

  return entries;
}

async function fetchLegislationFeed(feedUrl: string, maxPages = LEGISLATION_MAX_PAGES): Promise<FeedEntry[]> {
  const firstPageXml = await requestText(feedUrl);
  const morePagesMatch = firstPageXml.match(/<leg:morePages>(\d+)<\/leg:morePages>/i);
  const totalPages = Math.min(
    maxPages,
    morePagesMatch ? Number.parseInt(morePagesMatch[1], 10) : 1,
  );

  const entries = [...parseFeedEntries(firstPageXml)];

  for (let page = 2; page <= totalPages; page += 1) {
    const separator = feedUrl.includes('?') ? '&' : '?';
    const url = `${feedUrl}${separator}page=${page}`;
    const xml = await requestText(url);
    entries.push(...parseFeedEntries(xml));
  }

  return entries;
}

function extractUnResolutionSymbol(doc: UnSearchDoc): string | null {
  const fromId = doc.id?.match(/S\/RES\/[0-9]+(?:\([0-9]{4}\))?/i)?.[0];
  if (fromId) {
    return fromId.toUpperCase();
  }

  if (doc.url) {
    try {
      const parsed = new URL(doc.url);
      const symbol = parsed.searchParams.get('s');
      if (symbol && /S\/RES\//i.test(symbol)) {
        return symbol.toUpperCase();
      }
    } catch {
      // ignore malformed URL
    }
  }

  const fromTitle = doc.title?.match(/S\/RES\/[0-9]+(?:\([0-9]{4}\))?/i)?.[0];
  return fromTitle ? fromTitle.toUpperCase() : null;
}

function deriveUnResolutionIssuedOn(symbol: string, context: string): string | null {
  const maxAllowedYear = new Date().getUTCFullYear() + 1;
  const symbolYear = symbol.match(/\((19|20)\d{2}\)/)?.[0];
  if (symbolYear) {
    const year = Number.parseInt(symbolYear.slice(1, 5), 10);
    if (Number.isFinite(year) && year <= maxAllowedYear) {
      return `${symbolYear.slice(1, 5)}-01-01`;
    }
    return null;
  }

  const fromContext = yearFromText(context);
  if (!fromContext) {
    return null;
  }

  const year = Number.parseInt(fromContext.slice(0, 4), 10);
  if (!Number.isFinite(year) || year > maxAllowedYear) {
    return null;
  }

  return fromContext;
}

async function searchUnDocuments(query: string, row = 100): Promise<UnSearchDoc[]> {
  const url =
    'https://search.un.org/api/search?' +
    new URLSearchParams({
      q: query,
      collection: 'all',
      row: String(row),
      currentPageNumber: '1',
    }).toString();

  const payload = await requestJson<UnSearchResponse>(url);
  return Array.isArray(payload.docs) ? payload.docs : [];
}

async function harvestUnResolutions(warnings: string[]): Promise<ProvisionRecord[]> {
  try {
    const documents: UnSearchDoc[] = [];

    for (const query of UN_RESOLUTION_QUERIES) {
      const docs = await searchUnDocuments(query, 100);
      documents.push(...docs);
    }

    const bySymbol = new Map<string, ProvisionRecord>();

    for (const doc of documents) {
      const symbol = extractUnResolutionSymbol(doc);
      if (!symbol) {
        continue;
      }

      const title = cleanText(doc.title) || symbol;
      const body = cleanText(doc.body);
      const combined = `${title} ${body}`.trim();
      const issuedOn = deriveUnResolutionIssuedOn(symbol, combined);
      const record: ProvisionRecord = {
        source_id: 'UN_SC_RESOLUTIONS',
        item_id: `UNSCR_${slug(symbol)}`,
        title,
        text: truncate(combined || title, 700),
        parent: symbol,
        kind: 'resolution_document',
        regime_id: inferRegimeId(combined),
        issued_on: issuedOn,
        url: `https://documents.un.org/symbol-explorer?s=${encodeURIComponent(symbol)}`,
        topics: extractTopics(combined),
        metadata: {
          symbol,
          origin_id: doc.id ?? null,
          data_source: doc['Data Source'] ?? null,
        },
      };

      const existing = bySymbol.get(symbol);
      if (!existing || record.text.length > existing.text.length) {
        bySymbol.set(symbol, record);
      }
    }

    return Array.from(bySymbol.values());
  } catch (error) {
    appendWarning(warnings, `UN_SC_RESOLUTIONS ingestion failed: ${String(error)}`);
    return [];
  }
}

function normalizeGuidanceItemId(doc: UnSearchDoc): string {
  const source = doc.id ?? doc.url ?? doc.title ?? 'UN_GUIDANCE';
  return `UN_GUIDE_${slug(source).slice(0, 80)}`;
}

function isUnCommitteeGuidanceDocument(doc: UnSearchDoc): boolean {
  const title = cleanText(doc.title);
  const body = cleanText(doc.body);
  const rawUrl = doc.url ?? '';
  const combined = `${title} ${body} ${rawUrl}`.toLowerCase();

  const fromSecurityCouncilSanctionsPath =
    combined.includes('un.org/securitycouncil/') && combined.includes('/sanctions/');
  const sanctionsCommittee = combined.includes('sanctions committee');
  const committeePursuant =
    combined.includes('committee pursuant to') && combined.includes('security council');
  const focalPointDelisting = combined.includes('focal point') && combined.includes('delisting');
  const delistingGuidance =
    combined.includes('delisting') &&
    (combined.includes('guideline') ||
      combined.includes('procedure') ||
      combined.includes('security council'));
  const exemptionsGuidance =
    combined.includes('exemption') &&
    (combined.includes('guideline') ||
      combined.includes('security council') ||
      combined.includes('travel'));
  const narrativeSummaries = combined.includes('narrative summar') && combined.includes('listing');

  return (
    fromSecurityCouncilSanctionsPath ||
    sanctionsCommittee ||
    committeePursuant ||
    focalPointDelisting ||
    delistingGuidance ||
    exemptionsGuidance ||
    narrativeSummaries
  );
}

async function harvestUnCommitteeGuidance(warnings: string[]): Promise<ProvisionRecord[]> {
  try {
    const documents: UnSearchDoc[] = [];

    for (const query of UN_GUIDANCE_QUERIES) {
      const docs = await searchUnDocuments(query, 100);
      documents.push(...docs);
    }

    const uniqueDocs = uniqueBy(documents, (doc) => doc.id ?? doc.url ?? doc.title ?? '');

    const provisions: ProvisionRecord[] = [];

    for (const doc of uniqueDocs) {
      const title = cleanText(doc.title);
      const body = cleanText(doc.body);
      const rawUrl = doc.url?.trim();
      if (!title) {
        continue;
      }

      if (!rawUrl) {
        continue;
      }

      if (!isUnCommitteeGuidanceDocument(doc)) {
        continue;
      }

      const url = safeUrl(rawUrl);
      const combined = `${title} ${body}`.trim();
      const lower = `${combined} ${url}`.toLowerCase();
      let kind = 'committee_guidance';
      if (lower.includes('delisting')) {
        kind = 'delisting_guidance';
      } else if (lower.includes('exemption')) {
        kind = 'exemption_guidance';
      }

      provisions.push({
        source_id: 'UN_COMMITTEE_GUIDANCE',
        item_id: normalizeGuidanceItemId(doc),
        title,
        text: truncate(combined || title, 700),
        parent: 'UN Security Council sanctions guidance',
        kind,
        regime_id: inferRegimeId(`${combined} ${url}`),
        issued_on: toIsoDate(yearFromText(combined)),
        url,
        topics: extractTopics(`${combined} ${url}`),
        metadata: {
          origin_id: doc.id ?? null,
          data_source: doc['Data Source'] ?? null,
        },
      });
    }

    return uniqueBy(provisions, (record) => `${record.source_id}:${record.item_id}`);
  } catch (error) {
    appendWarning(warnings, `UN_COMMITTEE_GUIDANCE ingestion failed: ${String(error)}`);
    return [];
  }
}

async function fetchFederalRegister(term: string, page: number): Promise<FederalRegisterResponse> {
  const params = new URLSearchParams();
  params.append('conditions[presidential_document_type][]', 'executive_order');
  params.append('conditions[term]', term);
  params.append('order', 'newest');
  params.append('per_page', '100');
  params.append('page', String(page));

  const fields = [
    'document_number',
    'executive_order_number',
    'title',
    'publication_date',
    'html_url',
    'abstract',
    'excerpts',
  ];
  for (const field of fields) {
    params.append('fields[]', field);
  }

  const url = `https://www.federalregister.gov/api/v1/documents.json?${params.toString()}`;
  return requestJson<FederalRegisterResponse>(url);
}

function deriveExecutiveOrderStatus(text: string): 'active' | 'amended' | 'revoked' {
  const lower = text.toLowerCase();
  if (lower.includes('revok') || lower.includes('termination')) {
    return 'revoked';
  }
  if (lower.includes('amend') || lower.includes('additional steps')) {
    return 'amended';
  }
  return 'active';
}

async function harvestUsExecutiveOrders(
  warnings: string[],
): Promise<{ executiveOrders: ExecutiveOrderRecord[]; provisions: ProvisionRecord[] }> {
  try {
    const rows: FederalRegisterResult[] = [];

    for (const term of OFAC_EXECUTIVE_ORDER_TERMS) {
      for (let page = 1; page <= 5; page += 1) {
        const payload = await fetchFederalRegister(term, page);
        const pageRows = Array.isArray(payload.results) ? payload.results : [];
        rows.push(...pageRows);

        const totalPages = payload.total_pages ?? page;
        if (page >= totalPages || pageRows.length === 0) {
          break;
        }
      }
    }

    const eoByNumber = new Map<string, ExecutiveOrderRecord>();
    const provisions: ProvisionRecord[] = [];

    for (const row of rows) {
      const orderNumber = cleanText(row.executive_order_number) || cleanText(row.document_number);
      const title = cleanText(row.title);
      if (!orderNumber || !title) {
        continue;
      }

      const summarySource = cleanText(row.abstract) || cleanText(row.excerpts) || title;
      const summary = truncate(summarySource, 700);
      const issuedOn = toIsoDate(row.publication_date) ?? isoToday();
      const officialUrl = safeUrl(row.html_url ?? '');
      const combined = `${title} ${summary}`;
      const cyberRelated = combined.toLowerCase().includes('cyber');

      const executiveOrder: ExecutiveOrderRecord = {
        id: `EO_${slug(orderNumber)}`,
        source_id: 'US_OFAC_EXECUTIVE_ORDERS',
        regime_id: cyberRelated ? 'US_CYBER_13694' : null,
        order_number: orderNumber,
        title,
        issued_on: issuedOn,
        status: deriveExecutiveOrderStatus(combined),
        summary,
        cyber_related: cyberRelated,
        legal_basis: [`Executive Order ${orderNumber}`],
        official_url: officialUrl,
      };

      eoByNumber.set(executiveOrder.order_number, executiveOrder);

      provisions.push({
        source_id: 'US_OFAC_EXECUTIVE_ORDERS',
        item_id: `EO_${slug(orderNumber)}_SUMMARY`,
        title: `Executive Order ${orderNumber} summary`,
        text: summary,
        parent: `Executive Order ${orderNumber}`,
        kind: 'executive_order_summary',
        regime_id: executiveOrder.regime_id,
        issued_on: issuedOn,
        url: officialUrl,
        topics: extractTopics(combined),
        metadata: {
          document_number: row.document_number ?? null,
        },
      });
    }

    return {
      executiveOrders: Array.from(eoByNumber.values()),
      provisions: uniqueBy(provisions, (record) => `${record.source_id}:${record.item_id}`),
    };
  } catch (error) {
    appendWarning(warnings, `US_OFAC_EXECUTIVE_ORDERS ingestion failed: ${String(error)}`);
    return {
      executiveOrders: [],
      provisions: [],
    };
  }
}

function toLegislationItemId(prefix: string, id: string): string {
  const cleaned = id
    .replace(/^https?:\/\/[A-Za-z0-9.-]+\//, '')
    .replace(/^id\//, '')
    .replace(/\//g, '_');
  return `${prefix}_${slug(cleaned).slice(0, 100)}`;
}

function deriveEuProvisionKind(id: string, title: string): string {
  const lower = `${id} ${title}`.toLowerCase();
  if (lower.includes('/eudn/') || lower.includes('decision')) {
    return 'decision_article';
  }
  return 'regulation_article';
}

function deriveUkProvisionKind(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes('act')) {
    return 'act_section';
  }
  if (lower.includes('order')) {
    return 'order_provision';
  }
  return 'regulation_section';
}

async function harvestEuRestrictiveMeasures(
  warnings: string[],
): Promise<{ provisions: ProvisionRecord[]; exportControls: ExportControlRecord[] }> {
  try {
    const entries: FeedEntry[] = [];
    for (const feed of EU_RESTRICTIVE_FEEDS) {
      entries.push(...(await fetchLegislationFeed(feed)));
    }

    const provisions: ProvisionRecord[] = entries.map((entry) => {
      const combined = `${entry.title} ${entry.summary}`;
      return {
        source_id: 'EU_RESTRICTIVE_MEASURES',
        item_id: toLegislationItemId('EU', entry.id),
        title: entry.title,
        text: truncate(cleanText(entry.summary) || entry.title, 700),
        parent: cleanText(entry.id.replace('http://www.legislation.gov.uk/id/', '')),
        kind: deriveEuProvisionKind(entry.id, entry.title),
        regime_id: inferRegimeId(combined),
        issued_on: toIsoDate(entry.updated) ?? yearFromText(entry.title),
        url: safeUrl(entry.url),
        topics: extractTopics(combined),
        metadata: {
          legislation_id: entry.id,
        },
      } satisfies ProvisionRecord;
    });

    const exportControls: ExportControlRecord[] = provisions
      .filter((record) => record.topics.includes('export_controls'))
      .map((record) => ({
        id: `EU_EXPORT_${slug(record.item_id)}`,
        source_id: 'EU_RESTRICTIVE_MEASURES',
        jurisdiction: 'EU',
        instrument: 'EU restrictive measures',
        section: record.item_id,
        title: record.title,
        summary: truncate(record.text, 400),
        focus: record.topics.join(', ') || 'sanctions restrictions',
        official_url: record.url,
      }));

    return {
      provisions: uniqueBy(provisions, (record) => `${record.source_id}:${record.item_id}`),
      exportControls: uniqueBy(exportControls, (record) => record.id),
    };
  } catch (error) {
    appendWarning(warnings, `EU_RESTRICTIVE_MEASURES ingestion failed: ${String(error)}`);
    return { provisions: [], exportControls: [] };
  }
}

async function harvestUkSanctionsRegulations(
  warnings: string[],
): Promise<{ provisions: ProvisionRecord[]; exportControls: ExportControlRecord[] }> {
  try {
    const entries: FeedEntry[] = [];
    for (const feed of UK_SANCTIONS_FEEDS) {
      entries.push(...(await fetchLegislationFeed(feed)));
    }

    const provisions: ProvisionRecord[] = entries.map((entry) => {
      const combined = `${entry.title} ${entry.summary}`;
      return {
        source_id: 'UK_OFSI_REGULATIONS',
        item_id: toLegislationItemId('UK', entry.id),
        title: entry.title,
        text: truncate(cleanText(entry.summary) || entry.title, 700),
        parent: cleanText(entry.id.replace('http://www.legislation.gov.uk/id/', '')),
        kind: deriveUkProvisionKind(entry.title),
        regime_id: inferRegimeId(combined),
        issued_on: toIsoDate(entry.updated) ?? yearFromText(entry.title),
        url: safeUrl(entry.url),
        topics: extractTopics(combined),
        metadata: {
          legislation_id: entry.id,
        },
      } satisfies ProvisionRecord;
    });

    const exportControls: ExportControlRecord[] = provisions
      .filter((record) => record.topics.includes('export_controls') || record.topics.includes('russia'))
      .map((record) => ({
        id: `UK_EXPORT_${slug(record.item_id)}`,
        source_id: 'UK_OFSI_REGULATIONS',
        jurisdiction: 'UK',
        instrument: 'UK sanctions regulations',
        section: record.item_id,
        title: record.title,
        summary: truncate(record.text, 400),
        focus: record.topics.join(', ') || 'trade restrictions',
        official_url: record.url,
      }));

    return {
      provisions: uniqueBy(provisions, (record) => `${record.source_id}:${record.item_id}`),
      exportControls: uniqueBy(exportControls, (record) => record.id),
    };
  } catch (error) {
    appendWarning(warnings, `UK_OFSI_REGULATIONS ingestion failed: ${String(error)}`);
    return { provisions: [], exportControls: [] };
  }
}

function pickLatestEcfrVersion(records: EcfrVersionItem[]): EcfrVersionItem[] {
  const byIdentifier = new Map<string, EcfrVersionItem>();

  for (const record of records) {
    if (!record.identifier) {
      continue;
    }

    const existing = byIdentifier.get(record.identifier);
    if (!existing) {
      byIdentifier.set(record.identifier, record);
      continue;
    }

    const existingDate = toIsoDate(existing.issue_date) ?? toIsoDate(existing.date) ?? '0000-00-00';
    const currentDate = toIsoDate(record.issue_date) ?? toIsoDate(record.date) ?? '0000-00-00';
    if (currentDate >= existingDate) {
      byIdentifier.set(record.identifier, record);
    }
  }

  return Array.from(byIdentifier.values());
}

async function harvestEarExportControls(
  warnings: string[],
): Promise<{ provisions: ProvisionRecord[]; exportControls: ExportControlRecord[] }> {
  try {
    const payload = await requestJson<EcfrVersionsResponse>(
      'https://www.ecfr.gov/api/versioner/v1/versions/title-15.json',
    );

    const versions = Array.isArray(payload.content_versions) ? payload.content_versions : [];
    const relevant = versions.filter(
      (record) =>
        (record.part === '744' || record.part === '746') &&
        record.removed === false &&
        Boolean(record.identifier) &&
        Boolean(record.name),
    );

    const latest = pickLatestEcfrVersion(relevant);

    const provisions: ProvisionRecord[] = latest.map((record) => {
      const identifier = record.identifier as string;
      const title = cleanText(record.name) || `15 CFR ${identifier}`;
      const part = record.part ?? '744';
      const summary = `${title} (15 CFR Part ${part}).`;
      const issuedOn = toIsoDate(record.issue_date) ?? toIsoDate(record.date);
      return {
        source_id: 'US_BIS_EAR',
        item_id: `EAR_${slug(identifier)}`,
        title,
        text: truncate(summary, 700),
        parent: `15 CFR Part ${part}`,
        kind: 'regulation_section',
        regime_id: inferRegimeId(summary),
        issued_on: issuedOn,
        url: `https://www.ecfr.gov/current/title-15/part-${part}`,
        topics: extractTopics(summary),
        metadata: {
          identifier,
          part,
          issue_date: record.issue_date ?? null,
          type: record.type ?? null,
        },
      } satisfies ProvisionRecord;
    });

    const exportControls: ExportControlRecord[] = latest.map((record) => {
      const identifier = record.identifier as string;
      const title = cleanText(record.name) || `15 CFR ${identifier}`;
      const part = record.part ?? '744';
      const topics = extractTopics(title);
      return {
        id: `EAR_${slug(identifier)}`,
        source_id: 'US_BIS_EAR',
        jurisdiction: 'US',
        instrument: 'Export Administration Regulations',
        section: `15 CFR ${identifier}`,
        title,
        summary: truncate(`${title} (Title 15, Part ${part}).`, 400),
        focus: topics.join(', ') || 'export controls',
        official_url: `https://www.ecfr.gov/current/title-15/part-${part}`,
      } satisfies ExportControlRecord;
    });

    return {
      provisions: uniqueBy(provisions, (record) => `${record.source_id}:${record.item_id}`),
      exportControls: uniqueBy(exportControls, (record) => record.id),
    };
  } catch (error) {
    appendWarning(warnings, `US_BIS_EAR ingestion failed: ${String(error)}`);
    return { provisions: [], exportControls: [] };
  }
}

function splitSearchResults(html: string): string[] {
  return html
    .split('<div xmlns="http://www.w3.org/1999/xhtml" class="SearchResult">')
    .slice(1)
    .map((segment) => segment.split('</div><div xmlns="http://www.w3.org/1999/xhtml" class="SearchResult">')[0]);
}

function parseCaseReferenceFromText(text: string): string | null {
  const explicit = text.match(/Case\s+([CTF]-\d+\/\d+(?:\s*P)?)/i);
  if (explicit) {
    return normalizeWhitespace(explicit[1].toUpperCase());
  }

  return null;
}

function parseCaseReferenceFromCelex(celex: string): string | null {
  const match = celex.match(/^6(\d{4})([A-Z]{1,2})(\d{4})$/i);
  if (!match) {
    return null;
  }

  const year = match[1];
  const form = match[2].toUpperCase();
  const serial = String(Number.parseInt(match[3], 10));

  if (form.startsWith('C')) {
    return `C-${serial}/${year.slice(2)}`;
  }
  if (form.startsWith('T')) {
    return `T-${serial}/${year.slice(2)}`;
  }
  if (form.startsWith('F')) {
    return `F-${serial}/${year.slice(2)}`;
  }

  return null;
}

function parseDateOfDocument(segment: string): string | null {
  const match = segment.match(/<dt>\s*Date of document:\s*<\/dt>\s*<dd>([^<]+)<\/dd>/i);
  if (!match) {
    return null;
  }
  return toIsoDate(cleanText(match[1]));
}

function parseAuthor(segment: string): string {
  const match = segment.match(/<dt>\s*Author:\s*<\/dt>\s*<dd>([^<]+)<\/dd>/i);
  return cleanText(match?.[1] ?? 'Court of Justice of the European Union');
}

function parseCelex(segment: string): string | null {
  const direct = segment.match(/<dt>\s*CELEX number:\s*<\/dt>\s*<dd>([^<]+)<\/dd>/i)?.[1];
  if (direct) {
    return cleanText(direct).toUpperCase();
  }

  const fromUri = segment.match(/uri=CELEX:([0-9A-Z]+)/i)?.[1];
  return fromUri ? fromUri.toUpperCase() : null;
}

function parseTitleFromResult(segment: string): string {
  const match = segment.match(/<h2>\s*<a[^>]*>([\s\S]*?)<\/a>\s*<\/h2>/i);
  return cleanText(match?.[1] ?? 'CJEU sanctions case');
}

async function harvestCjeuCaseLaw(warnings: string[]): Promise<SanctionsCaseLawRecord[]> {
  try {
    const records: SanctionsCaseLawRecord[] = [];

    for (let page = 1; page <= CJEU_CASELAW_MAX_PAGES; page += 1) {
      const pageUrl = `${CJEU_CASELAW_BASE_URL}&page=${page}`;
      const html = await requestText(pageUrl);
      const segments = splitSearchResults(html);

      if (segments.length === 0) {
        break;
      }

      for (const segment of segments) {
        const celex = parseCelex(segment);
        if (!celex) {
          continue;
        }

        const title = parseTitleFromResult(segment);
        const decisionDate = parseDateOfDocument(segment) ?? isoToday();
        const author = parseAuthor(segment);
        const caseReference = parseCaseReferenceFromText(title) ?? parseCaseReferenceFromCelex(celex) ?? celex;
        const combined = `${title} ${author} ${caseReference}`;

        records.push({
          id: `CJEU_${slug(celex)}`,
          source_id: 'CJEU_SANCTIONS_CASE_LAW',
          court: author,
          case_reference: caseReference,
          title,
          decision_date: decisionDate,
          regime_id: inferRegimeId(combined),
          delisting_related:
            combined.toLowerCase().includes('delisting') ||
            combined.toLowerCase().includes('freezing of funds') ||
            combined.toLowerCase().includes('annul'),
          outcome: 'See official case text for operative outcome.',
          summary: truncate(title, 500),
          keywords: extractTopics(combined),
          official_url: `https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:${celex}`,
        });
      }
    }

    return uniqueBy(records, (record) => record.id);
  } catch (error) {
    appendWarning(warnings, `CJEU_SANCTIONS_CASE_LAW ingestion failed: ${String(error)}`);
    return [];
  }
}

function mergeProvisions(...sets: ProvisionRecord[][]): ProvisionRecord[] {
  return mergeBy(sets.flat(), (record) => `${record.source_id}:${record.item_id}`);
}

function mergeExecutiveOrders(...sets: ExecutiveOrderRecord[][]): ExecutiveOrderRecord[] {
  return mergeBy(sets.flat(), (record) => record.id);
}

function mergeExportControls(...sets: ExportControlRecord[][]): ExportControlRecord[] {
  return mergeBy(sets.flat(), (record) => record.id);
}

function mergeCaseLaw(...sets: SanctionsCaseLawRecord[][]): SanctionsCaseLawRecord[] {
  return mergeBy(sets.flat(), (record) => record.id);
}

function maxDate(...values: Array<string | null | undefined>): string | null {
  const dates = values.filter((value): value is string => Boolean(value)).sort();
  if (dates.length === 0) {
    return null;
  }
  return dates[dates.length - 1] ?? null;
}

function sourceRecordCount(seed: SanctionsSeed, sourceId: string): number {
  let count = 0;
  count += seed.provisions.filter((record) => record.source_id === sourceId).length;
  count += seed.executive_orders.filter((record) => record.source_id === sourceId).length;
  count += seed.export_controls.filter((record) => record.source_id === sourceId).length;
  count += seed.sanctions_case_law.filter((record) => record.source_id === sourceId).length;
  return count;
}

function buildFreshness(seed: SanctionsSeed, warnings: string[]): SourceFreshnessRecord[] {
  const today = isoToday();

  const latestBySource = new Map<string, string>();

  for (const provision of seed.provisions) {
    const latest = maxDate(latestBySource.get(provision.source_id), toIsoDate(provision.issued_on));
    if (latest) {
      latestBySource.set(provision.source_id, latest);
    }
  }

  for (const order of seed.executive_orders) {
    const latest = maxDate(latestBySource.get(order.source_id), toIsoDate(order.issued_on));
    if (latest) {
      latestBySource.set(order.source_id, latest);
    }
  }

  for (const law of seed.sanctions_case_law) {
    const latest = maxDate(latestBySource.get(law.source_id), toIsoDate(law.decision_date));
    if (latest) {
      latestBySource.set(law.source_id, latest);
    }
  }

  return seed.sources.map((source) => {
    const count = sourceRecordCount(seed, source.id);
    const status: FreshnessStatus = count > 0 ? 'fresh' : 'warning';
    const frequency = source.update_frequency === 'on_change' ? 'daily' : source.update_frequency;

    return {
      source_id: source.id,
      last_checked: today,
      last_updated: latestBySource.get(source.id) ?? today,
      check_frequency: frequency,
      status,
      notes:
        count > 0
          ? `Full-corpus ingestion completed with ${count} source records.`
          : 'No live records retrieved; curated fallback retained.',
    };
  });
}

async function buildFullCorpusSeed(sourceId: string | undefined): Promise<{ seed: SanctionsSeed; warnings: string[] }> {
  const warnings: string[] = [];

  const [
    unResolutions,
    unGuidance,
    usOrders,
    euHarvest,
    ukHarvest,
    earHarvest,
    cjeuCaseLaw,
  ] = await Promise.all([
    harvestUnResolutions(warnings),
    harvestUnCommitteeGuidance(warnings),
    harvestUsExecutiveOrders(warnings),
    harvestEuRestrictiveMeasures(warnings),
    harvestUkSanctionsRegulations(warnings),
    harvestEarExportControls(warnings),
    harvestCjeuCaseLaw(warnings),
  ]);

  const base = cloneDefaultSeed();

  const mergedSeed: SanctionsSeed = {
    schema_version: base.schema_version,
    generated_on: isoToday(),
    sources: base.sources,
    sanctions_regimes: mergeBy(base.sanctions_regimes, (record) => record.id),
    provisions: mergeProvisions(
      base.provisions,
      unResolutions,
      unGuidance,
      usOrders.provisions,
      euHarvest.provisions,
      ukHarvest.provisions,
      earHarvest.provisions,
    ),
    executive_orders: mergeExecutiveOrders(base.executive_orders, usOrders.executiveOrders),
    delisting_procedures: mergeBy(base.delisting_procedures, (record) => record.id),
    export_controls: mergeExportControls(
      base.export_controls,
      euHarvest.exportControls,
      ukHarvest.exportControls,
      earHarvest.exportControls,
    ),
    sanctions_case_law: mergeCaseLaw(base.sanctions_case_law, cjeuCaseLaw),
    source_freshness: [],
  };

  mergedSeed.source_freshness = buildFreshness(mergedSeed, warnings);

  const seed = sourceId ? filterSeedBySource(mergedSeed, sourceId) : mergedSeed;
  return { seed, warnings };
}

function filterSeedBySource(seed: SanctionsSeed, sourceId: string): SanctionsSeed {
  const source = seed.sources.find((candidate) => candidate.id === sourceId);
  if (!source) {
    throw new Error(`Unknown source id: ${sourceId}`);
  }

  const provisions = seed.provisions.filter((record) => record.source_id === sourceId);
  const executiveOrders = seed.executive_orders.filter((record) => record.source_id === sourceId);
  const exportControls = seed.export_controls.filter((record) => record.source_id === sourceId);
  const caseLaw = seed.sanctions_case_law.filter((record) => record.source_id === sourceId);

  const regimeIds = new Set<string>();
  for (const record of provisions) {
    if (record.regime_id) {
      regimeIds.add(record.regime_id);
    }
  }
  for (const record of executiveOrders) {
    if (record.regime_id) {
      regimeIds.add(record.regime_id);
    }
  }
  for (const record of caseLaw) {
    if (record.regime_id) {
      regimeIds.add(record.regime_id);
    }
  }

  const regimes = seed.sanctions_regimes.filter((regime) => regimeIds.has(regime.id));

  const delistingIds = new Set<string>();
  for (const regime of regimes) {
    if (regime.delisting_procedure_id) {
      delistingIds.add(regime.delisting_procedure_id);
    }
  }

  const delistingProcedures = seed.delisting_procedures.filter(
    (procedure) => delistingIds.has(procedure.id) || regimeIds.has(procedure.regime_id),
  );

  const freshness = seed.source_freshness.filter((record) => record.source_id === sourceId);

  return {
    schema_version: seed.schema_version,
    generated_on: seed.generated_on,
    sources: [source],
    sanctions_regimes: regimes,
    provisions,
    executive_orders: executiveOrders,
    delisting_procedures: delistingProcedures,
    export_controls: exportControls,
    sanctions_case_law: caseLaw,
    source_freshness: freshness,
  };
}

function parseEstimate(recordsEstimate: string): number | null {
  const match = recordsEstimate.match(/(\d+)/);
  if (match) {
    return Number.parseInt(match[1], 10);
  }

  if (recordsEstimate.toLowerCase().includes('key sections')) {
    return 40;
  }

  return null;
}

function perSourceCounts(seed: SanctionsSeed): Map<string, number> {
  const counts = new Map<string, number>();

  for (const source of seed.sources) {
    counts.set(source.id, 0);
  }

  for (const record of seed.provisions) {
    counts.set(record.source_id, (counts.get(record.source_id) ?? 0) + 1);
  }

  for (const record of seed.executive_orders) {
    counts.set(record.source_id, (counts.get(record.source_id) ?? 0) + 1);
  }

  for (const record of seed.export_controls) {
    counts.set(record.source_id, (counts.get(record.source_id) ?? 0) + 1);
  }

  for (const record of seed.sanctions_case_law) {
    counts.set(record.source_id, (counts.get(record.source_id) ?? 0) + 1);
  }

  return counts;
}

async function writeCoverageArtifacts(seed: SanctionsSeed): Promise<void> {
  const counts = perSourceCounts(seed);

  const sourceCoverage = seed.sources.map((source) => {
    const expected = parseEstimate(source.records_estimate);
    const actual = counts.get(source.id) ?? 0;
    const completion = expected ? Math.min(1, actual / expected) : (actual > 0 ? 1 : 0);

    return {
      id: source.id,
      name: source.name,
      expected_records: expected,
      actual_records: actual,
      completion,
      completion_percent: Number((completion * 100).toFixed(2)),
    };
  });

  const totalCompletion =
    sourceCoverage.reduce((sum, source) => sum + source.completion, 0) /
    Math.max(1, sourceCoverage.length);

  const summary = summarizeSeed(seed);

  const coveragePayload = {
    schema_version: '1.1',
    mcp: 'sanctions-law-mcp',
    package: '@ansvar/sanctions-law-mcp',
    generated_on: seed.generated_on,
    mode: 'full-corpus',
    status: 'implemented',
    summary: {
      ...summary,
      estimated_coverage_percent: Number((totalCompletion * 100).toFixed(2)),
      source_completion_100_percent: sourceCoverage.every((source) => source.completion >= 1),
    },
    source_coverage: sourceCoverage,
  };

  const coveragePath = path.resolve(process.cwd(), COVERAGE_OUTPUT);
  await fs.mkdir(path.dirname(coveragePath), { recursive: true });
  await fs.writeFile(coveragePath, `${JSON.stringify(coveragePayload, null, 2)}\n`, 'utf8');

  const markdownLines: string[] = [
    '# Data Coverage',
    '',
    `Generated baseline: ${seed.generated_on} (full-corpus mode)`,
    '',
    '## Overview',
    '',
    '| Metric | Value |',
    '|--------|-------|',
    `| Total Sources | ${summary.sources} |`,
    `| Provisions | ${summary.provisions} |`,
    `| Sanctions Regimes | ${summary.sanctions_regimes} |`,
    `| Executive Orders | ${summary.executive_orders} |`,
    `| Delisting Procedures | ${summary.delisting_procedures} |`,
    `| Export Controls | ${summary.export_controls} |`,
    `| Case Law Items | ${summary.sanctions_case_law} |`,
    `| Estimated Coverage | ${(totalCompletion * 100).toFixed(2)}% |`,
    '',
    '## Source Completion',
    '',
    '| Source ID | Actual | Expected | Completion |',
    '|---|---:|---:|---:|',
  ];

  for (const row of sourceCoverage) {
    markdownLines.push(
      `| \`${row.id}\` | ${row.actual_records} | ${row.expected_records ?? '-'} | ${row.completion_percent.toFixed(2)}% |`,
    );
  }

  markdownLines.push('');
  markdownLines.push('## Freshness Monitoring');
  markdownLines.push('');
  markdownLines.push('Use:');
  markdownLines.push('');
  markdownLines.push('```bash');
  markdownLines.push('npm run check-updates');
  markdownLines.push('```');
  markdownLines.push('');
  markdownLines.push('This writes `data/source-updates-report.json` with stale/warning/fresh evaluation by source.');

  const markdownPath = path.resolve(process.cwd(), COVERAGE_MARKDOWN_OUTPUT);
  await fs.writeFile(markdownPath, `${markdownLines.join('\n')}\n`, 'utf8');
}

function determineOutputPath(sourceId: string | undefined, outputArg: string | undefined): string {
  if (outputArg) {
    return path.resolve(process.cwd(), outputArg);
  }

  if (sourceId) {
    return path.resolve(process.cwd(), `data/seed/${sourceId.toLowerCase()}.json`);
  }

  return path.resolve(process.cwd(), DEFAULT_SEED_OUTPUT);
}

function parseArguments(argv: string[]): ParsedArgs {
  if (argv.some((token) => HELP_FLAGS.has(token))) {
    printUsage();
    process.exit(0);
  }

  let mode: ParsedArgs['mode'] = 'curated';
  let sourceId: string | undefined;
  let outputPath: string | undefined;

  const positional: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === FULL_CORPUS_FLAG) {
      mode = 'full-corpus';
      continue;
    }

    if (token === SOURCE_FLAG) {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`Missing value for ${SOURCE_FLAG}`);
      }
      sourceId = value;
      index += 1;
      continue;
    }

    if (token === OUTPUT_FLAG) {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`Missing value for ${OUTPUT_FLAG}`);
      }
      outputPath = value;
      index += 1;
      continue;
    }

    if (token.startsWith('-')) {
      throw new Error(`Unknown argument: ${token}`);
    }

    positional.push(token);
  }

  if (!sourceId && positional.length > 0) {
    sourceId = positional[0];
  }

  if (!outputPath && positional.length > 1) {
    outputPath = positional[1];
  }

  if (positional.length > 2) {
    throw new Error('Too many positional arguments');
  }

  return {
    mode,
    sourceId,
    outputPath,
  };
}

function printUsage(): void {
  console.log('Usage: npm run ingest -- [options] [source_id] [output_path]');
  console.log('');
  console.log('Options:');
  console.log(`  ${FULL_CORPUS_FLAG}          Harvest full corpus from live official sources`);
  console.log(`  ${SOURCE_FLAG} <id>         Restrict output to one source id`);
  console.log(`  ${OUTPUT_FLAG} <path>       Write seed JSON to custom path`);
  console.log('  --help, -h                  Show this usage text');
  console.log('');
  console.log('Examples:');
  console.log('  npm run ingest');
  console.log(`  npm run ingest -- ${FULL_CORPUS_FLAG}`);
  console.log(`  npm run ingest -- ${FULL_CORPUS_FLAG} ${SOURCE_FLAG} EU_RESTRICTIVE_MEASURES`);
  console.log('  npm run ingest -- EU_RESTRICTIVE_MEASURES data/seed/eu_restrictive_measures.json');
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  const outputPath = determineOutputPath(args.sourceId, args.outputPath);

  let payload: SanctionsSeed;
  let warnings: string[] = [];

  if (args.mode === 'full-corpus') {
    const full = await buildFullCorpusSeed(args.sourceId);
    payload = full.seed;
    warnings = full.warnings;
    await writeCoverageArtifacts(payload);
  } else {
    payload = args.sourceId
      ? filterSeedBySource(DEFAULT_SANCTIONS_SEED, args.sourceId)
      : DEFAULT_SANCTIONS_SEED;
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  const summary = summarizeSeed(payload);
  console.log(`sanctions-law-mcp: wrote seed to ${outputPath}`);
  console.log(
    `mode=${args.mode} sources=${summary.sources} regimes=${summary.sanctions_regimes} provisions=${summary.provisions} executive_orders=${summary.executive_orders} export_controls=${summary.export_controls} case_law=${summary.sanctions_case_law}`,
  );

  if (warnings.length > 0) {
    for (const warning of warnings) {
      console.warn(`warning: ${warning}`);
    }
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`sanctions-law-mcp: ingest failed: ${message}`);
  process.exit(1);
});
