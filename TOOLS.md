# Tools — Sanctions Law MCP

> 11 tools across 4 categories

## Search Tools

### `search_sanctions_law`

Full-text search across sanctions legal provisions and guidance using FTS5 with BM25 ranking. Use this to find provisions related to a specific topic, keyword, or legal concept across all sources.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | Yes | Search text or keywords |
| `source_ids` | string[] | No | Filter by source, e.g., `["EU_RESTRICTIVE_MEASURES"]` |
| `jurisdictions` | string[] | No | Filter by jurisdiction, e.g., `["EU", "US"]` |
| `regime_id` | string | No | Filter by sanctions regime ID |
| `topics` | string[] | No | Filter by topic, e.g., `["cyber", "asset_freeze"]` |
| `limit` | number | No | Max results (default 10, max 50) |

**Returns:** Array of matching provisions with source, title, snippet, and relevance score.

**Example:**
```
"What are the EU cyber sanctions legal provisions?"
-> search_sanctions_law({ query: "cyber sanctions", jurisdictions: ["EU"] })
```

**Data sources:** All 7 sources

**Limitations:**
- FTS5 search only — no fuzzy or phonetic matching
- Maximum 50 results per query
- Searches provision text and titles, not executive orders or case law directly

---

### `search_sanctions_case_law`

Search CJEU and General Court sanctions case law by keywords, regime, court, or delisting filter.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | No | Search keywords |
| `regime_id` | string | No | Filter by sanctions regime |
| `court` | string | No | Filter by court name |
| `delisting_related` | boolean | No | Filter to delisting cases only |
| `limit` | number | No | Max results (default 10, max 50) |

**Returns:** Array of case law items with court, reference, date, outcome, and summary.

**Example:**
```
"Find CJEU delisting cases"
-> search_sanctions_case_law({ delisting_related: true })
```

**Data sources:** CJEU_SANCTIONS_CASE_LAW

**Limitations:**
- Only CJEU/General Court cases — no national court decisions
- 124 cases currently indexed

---

## Lookup Tools

### `get_provision`

Retrieve a specific sanctions provision by source ID and item ID. Optionally include related provisions from the same regime.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `source_id` | string | Yes | Source identifier (e.g., `"EU_RESTRICTIVE_MEASURES"`) |
| `item_id` | string | Yes | Item identifier within the source |
| `include_related` | boolean | No | Include related provisions from same regime |

**Returns:** Provision details (title, text, source, regime, topics, URL) plus optional related items.

**Example:**
```
"Get EU restrictive measures provision on asset freeze"
-> get_provision({ source_id: "EU_RESTRICTIVE_MEASURES", item_id: "eu-rm-asset-freeze-001" })
```

**Data sources:** All provision sources

**Limitations:**
- Requires exact source_id and item_id — use `search_sanctions_law` to discover IDs first

---

### `get_sanctions_regime`

Retrieve sanctions regime metadata including name, jurisdiction, authority, legal basis, cyber flag, and optional representative provisions.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `regime_id` | string | No | Specific regime ID |
| `name` | string | No | Regime name (partial match) |
| `jurisdiction` | string | No | Filter by jurisdiction |
| `include_provisions` | boolean | No | Include sample provisions |
| `limit` | number | No | Max provisions to include |

**Returns:** Regime metadata with legal basis array, cyber flag, and optional provisions.

**Example:**
```
"What are the US cyber sanctions regimes?"
-> get_sanctions_regime({ jurisdiction: "US", include_provisions: true })
```

**Data sources:** sanctions_regimes + provisions tables

**Limitations:**
- 6 regimes currently indexed — major regimes only

---

### `get_executive_order`

Return executive order details by EO number, including optional related provisions.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `order_number` | string | Yes | Executive order number (e.g., `"13694"`) |
| `include_related_provisions` | boolean | No | Include related provisions |

**Returns:** EO details (title, issued date, status, summary, legal basis, cyber flag) plus optional provisions.

**Example:**
```
"Get Executive Order 13694 on cyber sanctions"
-> get_executive_order({ order_number: "13694", include_related_provisions: true })
```

**Data sources:** US_OFAC_EXECUTIVE_ORDERS + provisions

**Limitations:**
- US executive orders only
- 174 orders currently indexed

---

### `get_delisting_procedure`

Retrieve delisting or reconsideration procedures by regime ID or procedure ID.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `regime_id` | string | No | Filter by regime |
| `procedure_id` | string | No | Specific procedure ID |
| `limit` | number | No | Max results |

**Returns:** Procedure details (authority, summary, evidentiary standard, review body, timeline, application URL).

**Example:**
```
"How do I apply for delisting from EU sanctions?"
-> get_delisting_procedure({ regime_id: "eu-russia" })
```

**Data sources:** delisting_procedures table

**Limitations:**
- 4 procedures currently — UN, EU, US OFAC, UK OFSI only

---

### `get_export_control`

List export-control provisions relevant to sanctions by jurisdiction, section, or text query.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `jurisdiction` | string | No | Filter by jurisdiction |
| `section` | string | No | Filter by section |
| `query` | string | No | Text search in titles and summaries |
| `limit` | number | No | Max results |

**Returns:** Export control entries (instrument, section, title, summary, focus, URL).

**Example:**
```
"What are the US BIS export controls for encryption?"
-> get_export_control({ jurisdiction: "US", query: "encryption" })
```

**Data sources:** US_BIS_EAR + UK export controls

**Limitations:**
- 97 entries — US BIS EAR and UK export controls only
- Does not cover Wassenaar Arrangement or other multilateral regimes

---

## Analysis Tools

### `check_cyber_sanctions`

Aggregate all cyber-related sanctions regimes, executive orders, and provisions. Use this to get a comprehensive view of cyber sanctions across jurisdictions.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `jurisdiction` | string | No | Filter by jurisdiction |
| `query` | string | No | Additional keyword filter |
| `limit` | number | No | Max provisions per category |

**Returns:** Cyber-flagged regimes, executive orders, and provisions grouped by type.

**Example:**
```
"Overview of all cyber sanctions frameworks"
-> check_cyber_sanctions({})
```

**Data sources:** All tables (filtered by cyber_related flag)

**Limitations:**
- Only items explicitly flagged as cyber-related — may miss dual-use provisions

---

## Meta Tools

### `list_sources`

List all data sources with record counts, freshness status, and optional sample items.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `source_id` | string | No | Get details for a specific source |
| `include_samples` | boolean | No | Include sample items |

**Returns:** Source inventory with counts, authority, portal URL, and freshness.

**Data sources:** sources + source_freshness tables

---

### `about`

Return server metadata including version, scope, live database totals, network info, and disclaimer.

**Parameters:** None

**Returns:** Server metadata object with name, version, category, stats, data sources, freshness, disclaimer, and network info.

---

### `check_data_freshness`

Compute per-source freshness status and flag stale datasets. Reports age of each source relative to its expected update frequency.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `max_age_days` | number | No | Override max age threshold |
| `as_of` | string | No | ISO date override for deterministic checks |
| `status` | string | No | Filter by status (`fresh`/`warning`/`stale`/`planned`) |

**Returns:** Per-source freshness report with status, last checked/updated dates, and forced update instructions.

**Data sources:** source_freshness table + data/coverage.json

**Limitations:**
- Freshness is based on recorded check dates, not live upstream verification
