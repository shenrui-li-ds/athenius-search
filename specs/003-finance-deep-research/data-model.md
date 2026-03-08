# Data Model: Finance-Aware Deep Research Enhancement

**Date**: 2026-03-07
**Feature**: [spec.md](./spec.md)
**Extends**: `002-deep-research-quality` data model

## New Entities

All entities are in-memory only (per-session). No database changes.

### FinanceSubType

Classification of finance queries into domain-specific sub-types for targeted aspect generation.

```typescript
type FinanceSubType = 'stock_analysis' | 'macro' | 'personal_finance' | 'crypto' | 'general_finance';
```

**Source**: Computed by `detectFinanceSubType()` in the planner prompt function.
**Lifecycle**: Determined during planning, threaded through pipeline via request bodies.

### FinancialMetric

Structured extraction of a financial data point from search results.

```typescript
interface FinancialMetric {
  metric: string;    // e.g., "Revenue", "Net Income", "Free Cash Flow"
  value: string;     // e.g., "$26.97B", "22%", "$4.50"
  period: string;    // e.g., "Q4 2024", "FY 2024", "TTM"
  context: string;   // e.g., "YoY growth 22%", "beat estimates by 5%"
}
```

**Source**: Output of extraction LLM call (added to JSON schema for finance queries).
**Lifecycle**: Created during extraction, consumed during compressed summary and synthesis.

### ValuationDataPoint

Structured extraction of valuation data with comparison context.

```typescript
interface ValuationDataPoint {
  metric: string;           // e.g., "P/E (TTM)", "EV/Revenue", "P/B"
  currentValue: string;     // e.g., "65x", "25.3x"
  historicalMedian?: string; // e.g., "45x" (5Y median, if available in sources)
  peerComparison?: string;  // e.g., "AMD 120x, Intel 25x" (if available)
}
```

**Source**: Output of extraction LLM call (added to JSON schema for finance queries).
**Lifecycle**: Created during extraction, consumed during weak area detection and synthesis.

### RiskFactor

Structured extraction of risk and opportunity factors.

```typescript
interface RiskFactor {
  factor: string;                      // Short label: "China export restrictions"
  type: 'risk' | 'opportunity';       // Classification
  severity: 'high' | 'medium' | 'low'; // Impact assessment
  description: string;                 // Full description with context
}
```

**Source**: Output of extraction LLM call (added to JSON schema for finance queries).
**Lifecycle**: Created during extraction, consumed during bear case synthesis.

### CompetitiveCluster

A group of organization entities that appear across multiple aspects in a finance query, signaling the synthesizer to create comparison tables.

```typescript
interface CompetitiveCluster {
  entities: string[];    // Names of clustered organizations, e.g., ["NVIDIA", "AMD", "Intel"]
  aspectOverlap: number; // Number of aspects where these entities co-appear
}
```

**Source**: Computed by `mergeEntities()` when `queryType === 'finance'` and 3+ organization entities span 2+ aspects.
**Lifecycle**: Created after entity merge, passed to synthesizer.

## Modified Existing Types

### AspectExtraction (extended for finance)

```typescript
interface AspectExtraction {
  // Existing fields from 002 (all preserved):
  aspect: string;
  claims: ExtractedClaim[];
  statistics: ExtractedStatistic[];
  definitions: ExtractedDefinition[];
  expertOpinions: ExtractedExpertOpinion[];
  contradictions: ExtractedContradiction[];
  keyInsight: string;
  entities: ExtractedEntity[];

  // NEW (003 - finance-specific, all optional, default []):
  financialMetrics?: FinancialMetric[];
  valuationData?: ValuationDataPoint[];
  riskFactors?: RiskFactor[];
}
```

### CompressedAspectSummary (extended for finance)

```typescript
interface CompressedAspectSummary {
  // Existing fields from 002 (all preserved):
  aspect: string;
  claimsByConfidence: { established: number; emerging: number; contested: number };
  statisticCount: number;
  statisticDateRange: string | null;
  expertOpinionCount: number;
  contradictionCount: number;
  contradictionBriefs: string[];
  sourceAuthority: { highAuthority: number; unclassified: number };
  entities: string[];
  weakAreas: string[];
  keyInsight: string;

  // NEW (003 - finance-specific counts for gap analysis):
  financialMetricCount?: number;
  valuationDataCount?: number;
  riskFactorCount?: number;
}
```

### MergeEntitiesResult (new return type)

```typescript
interface MergeEntitiesResult {
  crossCuttingEntities: CrossCuttingEntity[];
  competitiveCluster?: CompetitiveCluster;  // Present only for finance queries with 3+ org entities
}
```

**Note**: `mergeEntities()` currently returns `CrossCuttingEntity[]` directly. This change wraps the return in an object. The `search-client.tsx` call site must be updated to destructure the result.

## Relationships

```
Query Classification:
  researchRouter → queryType ('finance')
  detectFinanceSubType() → FinanceSubType

Extraction (per aspect):
  AspectExtraction 1──* FinancialMetric (finance queries only)
  AspectExtraction 1──* ValuationDataPoint (finance queries only)
  AspectExtraction 1──* RiskFactor (finance queries only)

Entity Merge (cross-aspect):
  CrossCuttingEntity *──> CompetitiveCluster (3+ orgs in finance)

Compressed Summary:
  CompressedAspectSummary includes financialMetricCount, valuationDataCount, riskFactorCount
  weakAreas may include finance-specific labels

Pipeline Threading:
  queryType → plan → extract → analyze-gaps → synthesize (optional field in all request bodies)
```

## Validation Rules

- `FinancialMetric.metric`: Non-empty string
- `FinancialMetric.value`: Non-empty string
- `FinancialMetric.period`: Non-empty string
- `ValuationDataPoint.metric`: Non-empty string
- `ValuationDataPoint.currentValue`: Non-empty string
- `RiskFactor.factor`: Non-empty string
- `RiskFactor.type`: Must be `'risk'` or `'opportunity'`
- `RiskFactor.severity`: Must be `'high'`, `'medium'`, or `'low'`
- `CompetitiveCluster.entities`: Must have >= 3 entries
- `CompetitiveCluster.aspectOverlap`: Must be >= 2
- All finance-specific extraction fields: Default to `[]` if missing or malformed
