# Internal Contracts: Finance-Aware Deep Research Enhancement

No new API routes are introduced. All changes modify existing internal interfaces by adding optional fields.

## Modified API Contracts

### POST `/api/research/plan` (Modified Response)

**Request**: Unchanged.

**Response** (extended):
```json
{
  "aspects": [
    {"aspect": "competitive_position", "query": "NVIDIA competitive moat market share vs AMD Intel"},
    {"aspect": "valuation_context", "query": "NVIDIA NVDA valuation PE ratio historical median 2025"},
    {"aspect": "growth_catalysts", "query": "NVIDIA growth drivers AI data center automotive"},
    {"aspect": "risk_assessment", "query": "NVIDIA stock risks China export controls competition"}
  ],
  "queryType": "finance",
  "financeSubType": "stock_analysis"
}
```

**Backward Compatibility**: `queryType` is already returned. `financeSubType` is new and optional — existing consumers ignore it.

---

### POST `/api/research/extract` (Modified Request + Response)

**Request** (extended):
```json
{
  "aspect": "competitive_position",
  "query": "NVIDIA stock analysis",
  "sources": [...],
  "provider": "deepseek",
  "language": "English",
  "queryType": "finance"
}
```

**Response** (extended for finance queries):
```json
{
  "extraction": {
    "aspect": "competitive_position",
    "claims": [...],
    "statistics": [...],
    "definitions": [...],
    "expertOpinions": [...],
    "contradictions": [...],
    "keyInsight": "...",
    "entities": [...],
    "financialMetrics": [
      {"metric": "Revenue", "value": "$26.97B", "period": "Q4 2024", "context": "YoY growth 22%"},
      {"metric": "Data Center Revenue", "value": "$18.4B", "period": "Q4 2024", "context": "Up 27% QoQ"}
    ],
    "valuationData": [
      {"metric": "P/E (TTM)", "currentValue": "65x", "historicalMedian": "45x", "peerComparison": "AMD 120x, Intel 25x"}
    ],
    "riskFactors": [
      {"factor": "China export restrictions", "type": "risk", "severity": "high", "description": "US export controls limit ~20% of revenue from China market"}
    ]
  },
  "updatedSourceIndex": {...}
}
```

**Backward Compatibility**: `queryType` in request is optional — defaults to no finance-specific extraction. `financialMetrics`, `valuationData`, `riskFactors` in response default to `[]`. Existing consumers unaffected.

---

### POST `/api/research/analyze-gaps` (Modified Request)

**Request** (extended):
```json
{
  "query": "NVIDIA stock analysis",
  "extractedData": [...],
  "language": "English",
  "provider": "deepseek",
  "crossCuttingEntities": [...],
  "sourceAuthority": {...},
  "queryType": "finance"
}
```

**Response**: Unchanged.

**Internal Change**: When `queryType === 'finance'`, `compressAspectSummary()` applies finance-specific weak area detection. Gap analyzer receives labels like "No valuation data" or "No analyst views" enabling more targeted Round 2 queries.

---

### POST `/api/research/synthesize` (Modified Request)

**Request** (extended):
```json
{
  "query": "NVIDIA stock analysis",
  "extractedData": [...],
  "stream": true,
  "provider": "deepseek",
  "deep": true,
  "gapDescriptions": [...],
  "crossCuttingEntities": [...],
  "queryType": "finance",
  "competitiveCluster": {
    "entities": ["NVIDIA", "AMD", "Intel"],
    "aspectOverlap": 3
  }
}
```

**Response**: Unchanged (SSE stream or JSON).

**Internal Change**: When `queryType === 'finance'`:
- Synthesis prompt includes `<bearCaseInstruction>` XML section
- If `competitiveCluster` is present, synthesis prompt includes `<competitiveComparison>` instruction to create comparison tables

## New Internal Functions

### `detectFinanceSubType(query: string): FinanceSubType`

**Module**: `src/lib/prompts.ts` (co-located with planner prompts)
**Performance**: < 1ms (regex matching)
**Behavior**: Classify finance query into sub-type via keyword/pattern matching. Returns `'general_finance'` as fallback.

## Modified Internal Functions

### `compressAspectSummary(extraction, sources, queryType?)` (Modified)

**Module**: `src/lib/compressed-summary.ts`
**Change**: Added optional `queryType` parameter. When `'finance'`, applies additional weak area checks:
- `'No valuation data'` if `valuationData` array is empty
- `'No analyst views'` if `expertOpinions` array is empty (replaces generic label)
- `'No risk assessment'` if `riskFactors` array is empty
- `'No competitive comparison'` if only 1 organization entity found
**Performance**: Still < 5ms per aspect.

### `mergeEntities(extractions, queryType?)` (Modified)

**Module**: `src/lib/entity-merge.ts`
**Change**: Added optional `queryType` parameter. Returns `MergeEntitiesResult` object (wraps existing `CrossCuttingEntity[]`). When `queryType === 'finance'` and 3+ organization-type entities span 2+ aspects, includes `competitiveCluster` in result.
**Performance**: Still < 20ms for 4 aspects with 15 entities each.

### `researchPlannerFinancePrompt(query, currentDate)` (Modified)

**Module**: `src/lib/prompts.ts`
**Change**: Internally calls `detectFinanceSubType()` and returns sub-type-specific aspect strategies. Falls back to current generic aspects for `general_finance`.

### `aspectExtractorPrompt(aspect, query, language, queryType?)` (Modified)

**Module**: `src/lib/prompts.ts`
**Change**: Added optional `queryType` parameter. When `'finance'`, adds `financialMetrics`, `valuationData`, and `riskFactors` to the JSON output schema in the prompt.

### `deepResearchSynthesizerPrompt(query, currentDate, language, gapDescriptions, queryType?, competitiveCluster?)` (Modified)

**Module**: `src/lib/prompts.ts`
**Change**: Added optional `queryType` and `competitiveCluster` parameters. When `queryType === 'finance'`, adds `<bearCaseInstruction>` XML section. When `competitiveCluster` is present, adds `<competitiveComparison>` instruction.
