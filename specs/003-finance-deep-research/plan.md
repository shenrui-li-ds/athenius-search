# Implementation Plan: Finance-Aware Deep Research Enhancement

**Branch**: `003-finance-deep-research` | **Date**: 2026-03-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-finance-deep-research/spec.md`
**Depends on**: `002-deep-research-quality` (entity merge, compressed summary, source authority)

## Summary

Enhance deep research quality for finance queries by applying 5 patterns borrowed from the investment-notes project: (1) finance sub-classification in the planner prompt, (2) structured finance extraction schema, (3) finance-aware weak area detection, (4) competitive cluster detection in entity merge, and (5) bear case / contrarian synthesis instruction. All changes are prompt modifications or programmatic code — zero new API calls, zero latency increase.

## Technical Context

**Language/Version**: TypeScript 5.x / Next.js 15.2 (App Router)
**Primary Dependencies**: React 19, next-intl, react-markdown, Tailwind CSS 4
**Storage**: N/A (all changes are in-memory, per-session only)
**Testing**: Jest (existing test suite in `deep-search/src/__tests__/`)
**Target Platform**: Vercel serverless (Node.js runtime)
**Performance Goals**: Zero perceptible latency increase; all new programmatic operations < 10ms combined
**Constraints**: No new API calls; builds on 002 infrastructure (entity-merge.ts, compressed-summary.ts, source-authority.ts)
**Scale/Scope**: Affects only `finance` query type in deep research mode; all other modes and types unaffected

## Constitution Check

*GATE: Must pass before implementation.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. User-Centric Design | PASS | Finance users get domain-specific research quality; non-finance unaffected |
| II. Fast Iteration | PASS | Five independent enhancements, each deployable separately |
| III. Cost-Effective Operations | PASS | Zero new API calls; prompt modifications only |
| IV. Responsive & Intuitive UI | PASS | Zero latency increase; prompt changes processed in existing calls |
| V. Code Quality | PASS | TypeScript strict mode; extends existing 002 patterns |
| VI. Test-Driven Development | PASS | Unit tests for all new programmatic logic |
| VII. Secure & Robust Data Model | PASS | No database changes; in-memory only |
| VIII. Clear Documentation | PASS | CLAUDE.md updates for finance-aware pipeline behavior |

**Quality Gates:**

| Gate | Plan |
|------|------|
| Lint | All new/modified code passes `npm run lint` |
| TypeScript | Strict mode, no `any` types |
| Tests | Unit tests for finance classification, enhanced extraction parsing, weak area detection, cluster detection |
| Security | No new external calls; no user input in classification logic |
| Documentation | Update `src/lib/CLAUDE.md`, `src/app/api/CLAUDE.md` |

## Architecture: Query Type Threading

A key architectural decision: how does `queryType` flow through the pipeline?

**Current state (after 002)**: The research router classifies `queryType` in `/api/research/plan`. The plan response returns aspects. The client calls `/api/research/extract`, `/api/research/analyze-gaps`, and `/api/research/synthesize` — but `queryType` is NOT currently passed to these downstream routes.

**Design decision**: Thread `queryType` through the pipeline by adding it as an optional field in the request bodies of extract, analyze-gaps, and synthesize routes. This is the minimal change — each route can then conditionally apply finance-specific behavior.

```
/api/research/plan (router classifies queryType)
    → returns { aspects, queryType }
        → client stores queryType
            → /api/research/extract     (receives queryType in body)
            → /api/research/analyze-gaps (receives queryType in body)
            → /api/research/synthesize   (receives queryType in body)
```

**Alternative considered**: Infer query type in each route independently. Rejected because it would require the router prompt to be duplicated or the classification to be re-run, adding latency and cost.

## Project Structure

### Documentation (this feature)

```text
specs/003-finance-deep-research/
├── spec.md              # Feature specification
├── plan.md              # This file
├── data-model.md        # Data model extensions
├── research.md          # Research notes (investment-notes analysis)
└── contracts/           # Modified API contracts
    └── internal-contracts.md
```

### Source Code (modified and new files)

```text
deep-search/src/
├── lib/
│   ├── prompts.ts                          # Modified: finance sub-type planner prompts,
│   │                                       #           finance extraction schema,
│   │                                       #           bear case synthesis instruction
│   ├── types.ts                            # Modified: add FinanceSubType, FinancialMetric,
│   │                                       #           ValuationDataPoint, RiskFactor types
│   ├── entity-merge.ts                     # Modified: competitive cluster detection
│   └── compressed-summary.ts              # Modified: finance-aware weak area detection
├── app/
│   ├── api/research/
│   │   ├── plan/route.ts                   # Modified: return queryType in response
│   │   ├── extract/route.ts                # Modified: parse finance-specific fields,
│   │   │                                   #           accept queryType
│   │   ├── analyze-gaps/route.ts           # Modified: accept queryType, use finance
│   │   │                                   #           weak areas in gap identification
│   │   └── synthesize/route.ts             # Modified: accept queryType, add bear case
│   │                                       #           instruction for finance
│   └── search/
│       └── search-client.tsx               # Modified: thread queryType through pipeline
└── __tests__/
    └── lib/
        ├── finance-classification.test.ts  # NEW: finance sub-type detection tests
        ├── entity-merge.test.ts            # Modified: add competitive cluster tests
        └── compressed-summary.test.ts      # Modified: add finance weak area tests
```

**Structure Decision**: No new utility modules. All changes extend existing files from 002. One new test file for finance classification logic. Total: ~6 modified files, ~1 new file.

## Implementation Details

### Pattern 1: Finance Sub-Classification in Planner Prompt

**Approach**: Replace the single `researchPlannerFinancePrompt` with a function that selects sub-type-specific aspect strategies based on query keywords.

**Sub-type detection logic** (programmatic, in the prompt function):

```typescript
type FinanceSubType = 'stock_analysis' | 'macro' | 'personal_finance' | 'crypto' | 'general_finance';

function detectFinanceSubType(query: string): FinanceSubType {
  const q = query.toLowerCase();
  // Stock analysis: requires both a ticker-like pattern AND investment context keywords
  // The ticker regex alone (/[A-Z]{1,5}/) would match common words like "NASA", "COVID" etc.
  // so we always require co-occurrence with investment keywords
  if (/\b[A-Z]{1,5}\b/.test(query) && /stock|invest|analy|valuat|buy|sell|hold|shares|earnings|dividend/i.test(query)) return 'stock_analysis';
  if (/stock|equity|shares|dividend|earnings|revenue|P\/E|EPS|market\s*cap/i.test(query)) return 'stock_analysis';
  // Macro
  if (/recession|inflation|gdp|interest rate|fed|monetary|fiscal|economy|market outlook/i.test(query)) return 'macro';
  // Personal finance
  if (/budget|savings?|retire|401k|ira|mortgage|debt|credit score|tax/i.test(query)) return 'personal_finance';
  // Crypto
  if (/bitcoin|btc|ethereum|eth|crypto|blockchain|defi|nft|staking|web3/i.test(query)) return 'crypto';
  return 'general_finance';
}
```

**Sub-type-specific aspect strategies**:

| Sub-Type | Aspects |
|----------|---------|
| `stock_analysis` | competitive_position, valuation_context, growth_catalysts, risk_assessment |
| `macro` | current_conditions, leading_indicators, sector_implications, historical_parallels |
| `personal_finance` | strategies, tax_implications, risk_management, common_mistakes |
| `crypto` | technology_fundamentals, adoption_metrics, regulatory_landscape, risk_factors |
| `general_finance` | (current generic aspects — fallback) |

**Files modified**: `prompts.ts` (replace `researchPlannerFinancePrompt` body), `types.ts` (add `FinanceSubType`).

### Pattern 2: Structured Finance Extraction Schema

**Approach**: Add a conditional section to `aspectExtractorPrompt` that activates when `queryType === 'finance'`. The additional extraction fields are appended to the existing JSON output schema.

**New extraction fields** (added to output JSON schema):

```json
{
  "financialMetrics": [
    {"metric": "Revenue", "value": "$26.97B", "period": "Q4 2024", "context": "YoY growth 22%"},
    {"metric": "Free Cash Flow", "value": "$11.2B", "period": "Q4 2024", "context": "FCF margin 41.5%"}
  ],
  "valuationData": [
    {"metric": "P/E (TTM)", "currentValue": "65x", "historicalMedian": "45x", "peerComparison": "AMD 120x, Intel 25x"},
    {"metric": "EV/Revenue", "currentValue": "25.3x", "historicalMedian": "18x"}
  ],
  "riskFactors": [
    {"factor": "China export restrictions", "type": "risk", "severity": "high", "description": "US export controls limit sales to China, ~20% of revenue"},
    {"factor": "Data center GPU demand", "type": "opportunity", "severity": "high", "description": "AI training demand growing 40%+ annually"}
  ]
}
```

**Format rules for LLM extraction**:
- `financialMetrics.value`: Include currency symbol and unit (e.g., "$26.97B", "22%", "$4.50")
- `financialMetrics.period`: Use standard format (e.g., "Q4 2024", "FY 2024", "TTM")
- `valuationData.currentValue`/`historicalMedian`: Number + unit suffix (e.g., "65x", "25.3x")
- `valuationData.peerComparison`: "CompanyA Xx, CompanyB Yx" format (comma-separated)
- `riskFactors.severity`: Strictly "high", "medium", or "low"

**Files modified**: `prompts.ts` (extend `aspectExtractorPrompt`), `types.ts` (add `FinancialMetric`, `ValuationDataPoint`, `RiskFactor` interfaces), `extract/route.ts` (parse new fields from LLM output with `[]` defaults).

### Pattern 3: Finance-Aware Weak Area Detection

**Approach**: Add a `queryType` parameter to `compressAspectSummary()`. When `queryType === 'finance'`, apply additional weak area checks after the existing generic checks.

**New finance-specific weak areas**:

| Condition | Weak Area Label |
|-----------|----------------|
| `financialMetrics.length === 0` | `'No valuation data'` |
| `expertOpinions.length === 0` AND finance | `'No analyst views'` (replaces generic "No expert opinions") |
| `riskFactors.length === 0` AND finance | `'No risk assessment'` |
| Only 1 organization entity AND stock_analysis | `'No competitive comparison'` |

**Files modified**: `compressed-summary.ts` (add `queryType` parameter, add finance-specific checks).

### Pattern 4: Competitive Cluster Detection

**Approach**: Add a post-processing step to `mergeEntities()` that detects competitive clusters. Returns an enhanced result with an optional `competitiveCluster` field.

**Logic**: After the existing merge, if `queryType === 'finance'` and 3+ entities with `type === 'organization'` appear in 2+ aspects, flag them as a competitive cluster.

**Output extension**:

```typescript
interface MergeEntitiesResult {
  crossCuttingEntities: CrossCuttingEntity[];
  competitiveCluster?: {
    entities: string[];  // Names of clustered organizations
    aspectOverlap: number;  // Number of aspects with overlap
  };
}
```

**Files modified**: `entity-merge.ts` (add cluster detection), `types.ts` (add `CompetitiveCluster` interface), `search-client.tsx` (pass cluster to synthesize), `synthesize/route.ts` (add comparison table instruction when cluster present).

### Pattern 5: Bear Case / Contrarian Synthesis Instruction

**Approach**: Add a conditional `<bearCaseInstruction>` XML section to `deepResearchSynthesizerPrompt` when `queryType === 'finance'`.

**Prompt addition** (~80 tokens):

```xml
<bearCaseInstruction>
    <principle>Include a dedicated "Risks & Contrarian View" section</principle>
    <principle>Present the strongest arguments AGAINST the thesis</principle>
    <principle>Include specific risk factors with severity if available</principle>
    <principle>Use a collapsible section for detailed bear arguments</principle>
    <principle>If no significant risks found, note this explicitly</principle>
    <principle>Never fabricate risks — only cite what sources support</principle>
</bearCaseInstruction>
```

**Files modified**: `prompts.ts` (add conditional section to `deepResearchSynthesizerPrompt`).

## Pipeline Threading Design

### How queryType flows through the pipeline

```
1. /api/research/plan
   - Router classifies queryType (existing)
   - NEW: Plan response includes queryType field
   - NEW: If queryType === 'finance', detectFinanceSubType() runs
   - Plan response includes financeSubType (optional)

2. search-client.tsx
   - Reads queryType + financeSubType from plan response
   - Passes to all downstream API calls

3. /api/research/extract (per aspect)
   - Receives queryType in request body (optional field)
   - If finance: uses enhanced extraction schema
   - Parses financialMetrics, valuationData, riskFactors (defaults to [])

4. search-client.tsx (after all extractions)
   - mergeEntities() receives queryType
   - If finance + 3+ orgs: detects competitive cluster
   - compressAspectSummary() receives queryType
   - If finance: applies finance-specific weak area detection

5. /api/research/analyze-gaps
   - Receives queryType in request body (already receives compressed summaries from 002)
   - Finance weak areas enable more targeted gap identification

6. /api/research/synthesize
   - Receives queryType + competitiveCluster in request body
   - If finance: adds bear case instruction to prompt
   - If competitiveCluster: adds comparison table instruction
```

### Backward Compatibility

- `queryType` is optional in all request bodies — existing callers unaffected
- All finance-specific extraction fields default to `[]`
- `mergeEntities()` signature extended with optional `queryType` parameter
- `compressAspectSummary()` signature extended with optional `queryType` parameter
- Non-finance queries take no new code paths

## Complexity Tracking

No constitution violations. No complexity justifications needed. All changes are:
- Prompt text modifications (processed in existing LLM calls)
- Simple programmatic logic (keyword matching, array filtering)
- Optional field additions (backward compatible)

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Finance sub-type misclassification | Medium | Low | Falls back to `general_finance` (current behavior) |
| LLM doesn't produce finance extraction fields | Medium | Low | All fields default to `[]`; pipeline proceeds |
| Bear case section makes output too long | Low | Low | Uses collapsible section; within 1200 word target |
| Competitive cluster false positives | Low | Low | Synthesizer instruction says "if relevant data available" |
| queryType threading breaks existing flows | Low | Medium | queryType is optional everywhere; ignored if absent |

## Testing Strategy

### Unit Tests (New)

| Test File | Coverage |
|-----------|----------|
| `finance-classification.test.ts` | `detectFinanceSubType()`: stock queries, macro queries, personal finance, crypto, edge cases, non-English |
| `entity-merge.test.ts` (extended) | Competitive cluster: 3+ orgs in finance, <3 orgs, non-finance, mixed types |
| `compressed-summary.test.ts` (extended) | Finance weak areas: no valuation, no analyst views, no risk assessment, no competitive comparison, non-finance fallback |

### Integration Tests (Extended)

| Test File | Coverage |
|-----------|----------|
| `quality-wiring.test.ts` (extended) | Full pipeline with finance queryType: verify finance fields flow through extract → merge → analyze-gaps → synthesize |

### Manual Smoke Tests

1. "NVIDIA stock analysis" — verify stock-specific aspects, financial metrics in extraction, bear case in synthesis
2. "2025 recession outlook" — verify macro-specific aspects
3. "best retirement savings strategy" — verify personal finance aspects
4. "Bitcoin ETF analysis" — verify crypto-specific aspects
5. "Tesla's impact on the energy industry" — verify non-finance query is unaffected (regression check)
