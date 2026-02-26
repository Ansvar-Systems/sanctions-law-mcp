# Data Coverage

Generated baseline: 2026-02-26 (full-corpus mode)

## Overview

| Metric | Value |
|--------|-------|
| Total Sources | 7 |
| Provisions | 1212 |
| Sanctions Regimes | 6 |
| Executive Orders | 174 |
| Delisting Procedures | 4 |
| Export Controls | 97 |
| Case Law Items | 124 |
| Estimated Coverage | 86.00% |

## Source Completion

| Source ID | Actual | Expected | Completion |
|---|---:|---:|---:|
| `UN_SC_RESOLUTIONS` | 254 | 200 | 100.00% |
| `UN_COMMITTEE_GUIDANCE` | 1 | 50 | 2.00% |
| `EU_RESTRICTIVE_MEASURES` | 484 | 100 | 100.00% |
| `US_OFAC_EXECUTIVE_ORDERS` | 350 | 130 | 100.00% |
| `US_BIS_EAR` | 100 | 40 | 100.00% |
| `UK_OFSI_REGULATIONS` | 293 | 30 | 100.00% |
| `CJEU_SANCTIONS_CASE_LAW` | 125 | 100 | 100.00% |

## Freshness Monitoring

Use:

```bash
npm run check-updates
```

This writes `data/source-updates-report.json` with stale/warning/fresh evaluation by source.
