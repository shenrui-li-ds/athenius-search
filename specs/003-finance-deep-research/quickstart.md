# Quickstart: Finance-Aware Deep Research Enhancement

## Smoke Test Scenarios

### Test 1: Stock Analysis (Primary)

**Query**: "NVIDIA stock analysis"
**Mode**: Deep Research (`deep=true`)

**Verify**:
1. **Plan response** contains stock-specific aspects:
   - `competitive_position` (not generic `fundamentals`)
   - `valuation_context` (not generic `metrics`)
   - `growth_catalysts` (not generic `analyst_views`)
   - `risk_assessment` (not generic `risks_opportunities`)
2. **Extract responses** contain finance-specific fields:
   - `financialMetrics` array with `{metric, value, period, context}` objects
   - `valuationData` array with `{metric, currentValue, ...}` objects
   - `riskFactors` array with `{factor, type, severity, description}` objects
3. **Synthesis output** includes:
   - A dedicated "Risks & Contrarian View" section (may be collapsible)
   - If competitive cluster detected: comparison table(s) for companies
   - Bear arguments citing specific risk factors from extraction

### Test 2: Macro Finance

**Query**: "2025 recession outlook United States"
**Mode**: Deep Research (`deep=true`)

**Verify**:
1. **Plan response** contains macro-specific aspects:
   - `current_conditions`
   - `leading_indicators`
   - `sector_implications`
   - `historical_parallels`
2. **Synthesis output** includes contrarian scenarios (reasons recession may/may not materialize)

### Test 3: Personal Finance

**Query**: "best retirement savings strategy for 30 year olds"
**Mode**: Deep Research (`deep=true`)

**Verify**:
1. **Plan response** contains personal-finance-specific aspects:
   - `strategies`
   - `tax_implications`
   - `risk_management`
   - `common_mistakes`

### Test 4: Crypto

**Query**: "Bitcoin ETF analysis 2025"
**Mode**: Deep Research (`deep=true`)

**Verify**:
1. **Plan response** contains crypto-specific aspects:
   - `technology_fundamentals`
   - `adoption_metrics`
   - `regulatory_landscape`
   - `risk_factors`

### Test 5: Non-Finance Regression

**Query**: "Tesla's impact on the energy industry"
**Mode**: Deep Research (`deep=true`)

**Verify**:
1. Query is NOT classified as finance (it's about industry impact, not investment)
2. No finance-specific extraction fields (financialMetrics, valuationData, riskFactors should be absent or `[]`)
3. No bear case section in synthesis
4. Cross-cutting entity behavior unchanged from 002

### Test 6: Competitive Landscape

**Query**: "semiconductor industry NVIDIA AMD Intel competitive analysis"
**Mode**: Deep Research (`deep=true`)

**Verify**:
1. Entity merge detects competitive cluster (NVIDIA, AMD, Intel across 2+ aspects)
2. Synthesis includes comparison table(s) for the competitive cluster
3. Console log: `[Deep Research] Competitive cluster detected: NVIDIA, AMD, Intel`

## DevTools Inspection Points

Open browser DevTools → Network tab → filter by `research`.

| Request | What to Check |
|---------|---------------|
| `/api/research/plan` | Response JSON: `queryType`, `financeSubType`, aspect names |
| `/api/research/extract` | Request body: `queryType` field present. Response: `financialMetrics`, `valuationData`, `riskFactors` arrays |
| `/api/research/analyze-gaps` | Request body: `queryType` field present |
| `/api/research/synthesize` | Request body: `queryType`, `competitiveCluster` fields present |

Console tab: Look for `[Deep Research]` log messages showing finance sub-type, competitive cluster detection.
