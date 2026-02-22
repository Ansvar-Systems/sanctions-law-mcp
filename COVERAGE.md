# Coverage — Sanctions Law MCP

> Last verified: 2026-02-22 | Database version: 0.1.0

## What's Included

| Source | Items | Type | Completeness | Refresh |
|--------|------:|------|-------------|---------|
| UN SC Resolutions | 254 | provisions | Full | on_change |
| UN Committee Guidance | 69 | provisions | Full | on_change |
| EU Restrictive Measures | 483 | provisions | Full | on_change |
| US OFAC Executive Orders | 176 | executive orders | Full | on_change |
| US BIS EAR | 51 | export controls | Full | on_change |
| UK OFSI Regulations | 246 | provisions | Full | on_change |
| CJEU Sanctions Case Law | 1 | case law | Full | monthly |

**Total:** 11 tools, 1,280 provisions + 174 EOs + 97 export controls + 124 case law + 4 delisting procedures = **1,679 items**, 6 regimes

## What's NOT Included

| Gap | Reason | Planned? |
|-----|--------|----------|
| Entity screening lists (SDN, EU consolidated) | Out of scope — this MCP covers legal basis, not entity lookups. Use the Sanctions MCP for entity screening. | No |
| National court sanctions decisions | Only CJEU/General Court covered. National courts require per-country ingestion. | Yes v2.0 |
| Swiss/Australian/Canadian sanctions law | Currently covers UN, EU, US, UK only. Additional jurisdictions planned. | Yes v2.0 |
| Wassenaar Arrangement & multilateral export regimes | Only US BIS EAR and UK export controls included. | Yes v2.0 |
| Historical/repealed sanctions regimes | Only current active regimes. No temporal queries. | Yes v2.0 |
| Real-time sanctions list updates | Database is a snapshot, not a live feed. | No |

## Limitations

- **Snapshot, not real-time** — data is refreshed daily via automated ingestion but is not a live feed
- **Legal basis only** — this MCP covers legal frameworks, authorities, and procedures, NOT entity screening
- **English language** — all provisions are in English; original-language texts not included for EU/UN sources
- **No fuzzy matching** — FTS5 exact keyword search only, no phonetic or fuzzy entity matching
- **6 regimes only** — major regimes (UN DPRK, EU Russia, US Cyber, EU Cyber, EU Iran, UK Iran) indexed

## Data Freshness

| Source | Refresh Schedule | Last Refresh | Next Expected |
|--------|-----------------|-------------|---------------|
| UN SC Resolutions | Daily | 2026-02-22 | 2026-02-23 |
| UN Committee Guidance | Daily | 2026-02-22 | 2026-02-23 |
| EU Restrictive Measures | Daily | 2026-02-22 | 2026-02-23 |
| US OFAC Executive Orders | Daily | 2026-02-22 | 2026-02-23 |
| US BIS EAR | Daily | 2026-02-22 | 2026-02-23 |
| UK OFSI Regulations | Daily | 2026-02-22 | 2026-02-23 |
| CJEU Sanctions Case Law | Monthly | 2026-02-22 | 2026-03-22 |

To check freshness programmatically, call the `check_data_freshness` tool.
