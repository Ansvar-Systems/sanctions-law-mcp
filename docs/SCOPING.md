# Sanctions Law MCP Scoping

Generated: 2026-02-22

## Scope baseline

- Tier: Tier 1 (revenue-blocking)
- Driver: Nordea AML and KYC compliance
- Deployment: Strategy A (Vercel)
- Package: `@ansvar/sanctions-law-mcp`
- Repository target: https://github.com/Ansvar-Systems/sanctions-law-mcp

## Source inventory

| Source | Authority | Records | Priority |
|---|---|---:|---|
| UN Security Council sanctions resolutions | United Nations Security Council | ~200 | CRITICAL |
| UN sanctions committee guidance | United Nations Security Council | ~50 | HIGH |
| EU restrictive measures legal texts | Council of the European Union | ~100 | CRITICAL |
| US OFAC executive orders and guidance | US Department of the Treasury | ~130 | CRITICAL |
| US BIS Export Administration Regulations | US Bureau of Industry and Security | Key sections | HIGH |
| UK OFSI sanctions regulations | UK Office of Financial Sanctions Implementation | ~30 | HIGH |
| CJEU sanctions case law | Court of Justice of the European Union | ~100 | HIGH |

## Tool surface (implemented)

- `search_sanctions_law`
- `get_provision`
- `get_sanctions_regime`
- `get_executive_order`
- `check_cyber_sanctions`
- `get_delisting_procedure`
- `get_export_control`
- `search_sanctions_case_law`
- `list_sources`
- `about`
- `check_data_freshness`

## Implementation notes

- Deterministic seed and build pipeline implemented via:
  - `npm run ingest`
  - `npm run build:db`
  - `npm run check-updates`
- Claims are mapped to official source portals and legal identifiers where available.
- Server is legal-basis oriented and does not replace sanctions-list screening systems.
