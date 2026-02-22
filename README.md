# Sanctions Law MCP

Sanctions legal frameworks via the Model Context Protocol — legal-basis research across UN, EU, US, UK, and CJEU case law. **Not an entity-screening sanctions list.**

[![npm version](https://img.shields.io/npm/v/@ansvar/sanctions-law-mcp)](https://www.npmjs.com/package/@ansvar/sanctions-law-mcp)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![CI](https://github.com/Ansvar-Systems/sanctions-law-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Ansvar-Systems/sanctions-law-mcp/actions/workflows/ci.yml)

**1,280 provisions** | **174 executive orders** | **124 case law items** | **97 export controls** | **7 sources**

---

## Quick Start

### Remote (Vercel — no install needed)

**Claude.ai / ChatGPT:** Add this MCP server URL:
```
https://sanctions-law-mcp.vercel.app/mcp
```

**Claude Desktop** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "sanctions-law": {
      "url": "https://sanctions-law-mcp.vercel.app/mcp"
    }
  }
}
```

**Claude Code:**
```bash
claude mcp add sanctions-law --transport http https://sanctions-law-mcp.vercel.app/mcp
```

**Cursor / VS Code:**
```json
{
  "mcpServers": {
    "sanctions-law": {
      "url": "https://sanctions-law-mcp.vercel.app/mcp"
    }
  }
}
```

### Local (stdio — runs on your machine)

```bash
npx @ansvar/sanctions-law-mcp
```

**Claude Desktop** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "sanctions-law": {
      "command": "npx",
      "args": ["@ansvar/sanctions-law-mcp"]
    }
  }
}
```

---

## What's Included

| Category | Count | Details |
|----------|------:|---------|
| **Provisions** | 1,280 | Legal provisions across all sources |
| **Executive Orders** | 174 | US OFAC executive orders and guidance |
| **Case Law** | 124 | CJEU/General Court sanctions jurisprudence |
| **Export Controls** | 97 | US BIS EAR and UK export control entries |
| **Sanctions Regimes** | 6 | UN DPRK, EU Russia, US Cyber, EU Cyber, EU Iran, UK Iran |
| **Delisting Procedures** | 4 | UN, EU, US OFAC, UK OFSI |
| **Sources** | 7 | Official government and court publications |

## What's NOT Included

- **Entity screening lists** — this MCP covers legal basis, not SDN/EU consolidated lists
- **National court decisions** — only CJEU/General Court
- **Non-English original texts** — all provisions in English
- **Real-time updates** — database is a daily snapshot

See [COVERAGE.md](COVERAGE.md) for the full coverage manifest and known gaps.

---

## Available Tools

> 11 tools across 4 categories. See [TOOLS.md](TOOLS.md) for full documentation.

| Tool | Description |
|------|-------------|
| `search_sanctions_law` | FTS5 full-text search across all provisions |
| `get_provision` | Retrieve provision by source + item ID |
| `get_sanctions_regime` | Regime metadata, legal basis, and provisions |
| `get_executive_order` | EO details by order number |
| `check_cyber_sanctions` | Aggregate cyber-related regimes and provisions |
| `get_delisting_procedure` | Delisting/reconsideration procedures |
| `get_export_control` | Export-control entries by jurisdiction |
| `search_sanctions_case_law` | CJEU/General Court case law search |
| `list_sources` | Source inventory with counts and freshness |
| `about` | Server metadata, stats, network info |
| `check_data_freshness` | Per-source freshness status and staleness flags |

---

## Data Sources & Freshness

| Source | Authority | Refresh |
|--------|-----------|---------|
| UN SC sanctions resolutions | United Nations Security Council | Daily |
| UN committee guidance | UN Sanctions Committees | Daily |
| EU restrictive measures | Council of the European Union | Daily |
| US OFAC executive orders | US Treasury / OFAC | Daily |
| US BIS Export Administration Regs | US Bureau of Industry and Security | Daily |
| UK OFSI sanctions regulations | UK HM Treasury / OFSI | Daily |
| CJEU sanctions case law | Court of Justice of the EU | Monthly |

Data freshness is monitored daily via automated CI/CD. Call `check_data_freshness` to verify current status.

---

## Security

This project implements 6-layer security CI/CD:

| Layer | Tool | Purpose |
|-------|------|---------|
| 1 | CodeQL | Static analysis for code vulnerabilities |
| 2 | Semgrep | Pattern-based SAST scanning |
| 3 | Trivy | Container and dependency vulnerability scanning |
| 4 | Gitleaks | Secret detection in code and history |
| 5 | OpenSSF Scorecard | Supply chain security best practices |
| 6 | Dependabot | Automated dependency updates |

See [SECURITY.md](SECURITY.md) for vulnerability disclosure policy.

---

## Important Disclaimers

### Not Professional Advice

> **THIS TOOL IS NOT PROFESSIONAL ADVICE**
>
> Data is sourced from official government and court publications. However:
> - This is a **research tool**, not a substitute for professional legal or compliance counsel
> - This tool provides **legal-basis research**, NOT entity screening
> - **Coverage may be incomplete** — verify critical data against primary sources
> - **Verify all data** against the official sources before relying on it professionally
> - Data changes — check the `check_data_freshness` tool for database currency

### Client Confidentiality

When using the remote endpoint, queries are processed by third-party infrastructure
(Vercel, Claude API). For privileged or confidential matters, use the local
npm package or on-premise deployment.

---

## Ansvar MCP Network

This server is part of the **Ansvar MCP Network** — 80+ servers covering
global legislation, compliance frameworks, and cybersecurity standards.

| Category | Coverage |
|----------|----------|
| **Legislation** | 70+ jurisdictions worldwide |
| **EU Compliance** | 49 regulations, 2,693 articles |
| **US Compliance** | 15 federal & state regulations |
| **Security Frameworks** | 261 frameworks, 1,451 controls |
| **Cybersecurity** | 200K+ CVEs, STRIDE patterns, sanctions |

**Explore the full network ->** [ansvar.ai/mcp](https://ansvar.ai/mcp)

---

## Development

### Branch Strategy

```
feature-branch -> PR to dev -> verify on dev -> PR to main -> deploy
```

### Setup

```bash
git clone https://github.com/Ansvar-Systems/sanctions-law-mcp.git
cd sanctions-law-mcp
npm install
npm run build:db
npm run build
npm test
```

### Data Pipeline

```bash
npm run ingest              # Write canonical seed file
npm run ingest -- --full-corpus  # Harvest full live corpus
npm run build:db            # Build SQLite from seed
npm run check-updates       # Evaluate freshness
npm run coverage:update     # Regenerate coverage.json
npm run coverage:verify     # Gate 6: verify coverage consistency
```

### Quality Gates

```bash
npm run build               # Gate 1: Build
npm run lint                # Gate 2: Lint (tsc --noEmit)
npm test                    # Gate 3: Unit tests
npm run test:contract       # Gate 4: Golden contract tests
npm run coverage:verify     # Gate 6: Coverage consistency
```

---

## License

Apache 2.0 — see [LICENSE](LICENSE).

### Data Licenses

All data is sourced from official government and court publications that are publicly available. See [sources.yml](sources.yml) for per-source license information.
