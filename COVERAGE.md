# Data Coverage

Generated baseline: 2026-04-14 (full-corpus mode)

## Overview

| Metric | Value |
|--------|-------|
| Total Sources | 7 |
| Provisions | 1282 |
| Sanctions Regimes | 6 |
| Executive Orders | 176 |
| Delisting Procedures | 4 |
| Export Controls | 97 |
| Case Law Items | 4 |
| Estimated Coverage | 86.43% |

## Source Completion

| Source ID | Actual | Expected | Completion |
|---|---:|---:|---:|
| `UN_SC_RESOLUTIONS` | 254 | 200 | 100.00% |
| `UN_COMMITTEE_GUIDANCE` | 69 | 50 | 100.00% |
| `EU_RESTRICTIVE_MEASURES` | 484 | 100 | 100.00% |
| `US_OFAC_EXECUTIVE_ORDERS` | 354 | 130 | 100.00% |
| `US_BIS_EAR` | 100 | 40 | 100.00% |
| `UK_OFSI_REGULATIONS` | 293 | 30 | 100.00% |
| `CJEU_SANCTIONS_CASE_LAW` | 5 | 100 | 5.00% |

## Freshness Monitoring

Use:

```bash
npm run check-updates
```

This writes `data/source-updates-report.json` with stale/warning/fresh evaluation by source.
