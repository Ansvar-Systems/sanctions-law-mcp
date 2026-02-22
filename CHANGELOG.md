# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-02-22

### Added
- Initial release with 11 tools covering sanctions legal frameworks
- 7 data sources: UN SC Resolutions, UN Committee Guidance, EU Restrictive Measures, US OFAC Executive Orders, US BIS EAR, UK OFSI Regulations, CJEU Sanctions Case Law
- 1,280 provisions, 174 executive orders, 124 case law items, 97 export controls, 6 regimes, 4 delisting procedures
- Full-text search via FTS5 with BM25 ranking
- Freshness monitoring and coverage tracking
- Dual transport: stdio (npm) and Streamable HTTP (Vercel)
- 6-layer security CI/CD (CodeQL, Semgrep, Trivy, Gitleaks, Scorecard, Dependabot)
- Golden contract tests and automated ingestion pipeline
