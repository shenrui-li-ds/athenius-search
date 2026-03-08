# Feature Specification: Finance-Aware Deep Research Enhancement

**Feature Branch**: `003-finance-deep-research`
**Created**: 2026-03-07
**Status**: Draft
**Input**: Analysis of investment-notes project patterns applied to athenius-search deep research pipeline. All enhancements are prompt or programmatic code changes — zero new API calls, zero latency increase.
**Depends on**: `002-deep-research-quality` (entity merge, compressed summary, source authority infrastructure)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Finance Sub-Classification in Research Planner (Priority: P1)

A user searches "NVIDIA stock analysis" in Deep Research mode. Today, the `researchPlannerFinancePrompt` generates the same 4 generic aspects (fundamentals, metrics, analyst_views, risks_opportunities) regardless of whether the query is about a specific stock, a macro trend, personal finance, or cryptocurrency. With this enhancement, the research router detects the finance sub-type and the planner generates sub-type-specific aspects. A stock analysis query gets aspects like "competitive moat and market position", "valuation vs historical median", and "growth catalysts and risk factors" — mirroring the investment-notes framework's archetype-aware analysis routing.

**Why this priority**: The planner prompt determines what gets searched. Better aspect generation cascades quality improvements through the entire pipeline — extraction, gap analysis, and synthesis all benefit from more targeted search queries.

**Independent Test**: Compare deep research output for "NVIDIA stock analysis" before and after. Before: generic aspects. After: stock-specific aspects that produce more targeted searches (competitive positioning, valuation context, growth/risk assessment). Verify by inspecting the `/api/research/plan` response.

**Acceptance Scenarios**:

1. **Given** a finance query containing a ticker symbol or company name with investment context (e.g., "NVDA analysis", "should I invest in Tesla"), **When** the research planner runs, **Then** it generates stock-analysis-specific aspects covering competitive position, valuation context, growth drivers, and risk assessment.
2. **Given** a finance query about macro trends (e.g., "2025 recession outlook", "inflation impact on markets"), **When** the research planner runs, **Then** it generates macro-specific aspects covering current conditions, leading indicators, sector implications, and historical parallels.
3. **Given** a finance query about personal finance (e.g., "best retirement savings strategy", "how to budget"), **When** the research planner runs, **Then** it generates personal-finance-specific aspects covering strategies, tax implications, risk management, and common mistakes.
4. **Given** a finance query about cryptocurrency (e.g., "Bitcoin ETF analysis", "Ethereum staking risks"), **When** the research planner runs, **Then** it generates crypto-specific aspects covering technology fundamentals, adoption metrics, regulatory landscape, and risk factors.
5. **Given** a finance query that doesn't clearly match any sub-type, **When** the research planner runs, **Then** it falls back to the current general finance aspects with no degradation.

---

### User Story 2 - Structured Finance Extraction Schema (Priority: P1)

A user researches "AMD vs NVIDIA competitive analysis" in Deep Research mode. Today, the aspect extractor treats finance content the same as any other topic — it extracts generic claims, statistics, and expert opinions. Financial data points like P/E ratios, revenue growth rates, and market share percentages are mixed in with general claims, losing their structured relationship. With this enhancement, the extraction prompt recognizes finance queries and additionally extracts finance-specific structured data: financial metrics (with period and context), valuation comparisons (current vs historical vs peers), and risk factors (with severity assessment). This richer extraction feeds directly into better gap analysis and synthesis.

**Why this priority**: Equal to P1 because extraction quality directly determines synthesis quality. Finance queries have domain-specific data patterns (metrics, valuations, comparisons) that the generic schema misses.

**Independent Test**: Run "NVIDIA stock analysis" in Deep Research mode. Inspect the `/api/research/extract` responses. Verify that financial metrics are extracted with structured fields (metric name, value, period) rather than buried in generic claims. Verify valuation data includes comparison context (current vs historical).

**Acceptance Scenarios**:

1. **Given** a finance-type query (as classified by the research router), **When** the aspect extractor processes search results, **Then** it additionally extracts `financialMetrics` as an array of `{metric, value, period, context}` objects alongside standard claims.
2. **Given** search results containing valuation data (P/E, EV/Revenue, etc.), **When** the extractor processes them, **Then** it extracts `valuationData` as an array of `{metric, currentValue, historicalMedian, peerComparison}` objects when this information is available in sources.
3. **Given** search results containing risk/opportunity discussion, **When** the extractor processes them, **Then** it extracts `riskFactors` as an array of `{factor, type: 'risk'|'opportunity', severity: 'high'|'medium'|'low', description}` objects.
4. **Given** a non-finance query, **When** the extractor processes search results, **Then** it behaves identically to current behavior with no finance-specific fields.
5. **Given** finance search results that lack structured financial data, **When** the extractor runs, **Then** all finance-specific fields default to empty arrays with no errors.

---

### User Story 3 - Finance-Aware Weak Area Detection in Compressed Summary (Priority: P2)

A user researches a stock in Deep Research mode. After Round 1, the gap analyzer receives compressed summaries. Today, `compressAspectSummary()` identifies generic weak areas like "No expert opinions" or "Few claims extracted." With this enhancement, the function detects finance-specific gaps: no valuation data, no analyst views, no risk assessment, and no competitive comparison. These targeted weak area labels enable the gap analyzer to generate more specific Round 2 search queries — for example, searching specifically for "NVIDIA analyst price targets 2025" instead of a generic "NVIDIA additional analysis."

**Why this priority**: P2 because it builds on US1 and US2 infrastructure. The value is incremental but meaningful — better weak area detection leads to better gap analysis leads to better Round 2 searches.

**Independent Test**: Run a finance deep research query. Inspect the compressed summary passed to `/api/research/analyze-gaps`. Verify that weak areas include finance-specific labels (e.g., `no_valuation_data`, `no_competitive_comparison`) when the corresponding data is absent from Round 1 extractions.

**Acceptance Scenarios**:

1. **Given** a finance-type extraction with no valuation metrics extracted, **When** `compressAspectSummary()` runs, **Then** it includes `'No valuation data'` in `weakAreas`.
2. **Given** a finance-type extraction with no analyst ratings or price targets, **When** `compressAspectSummary()` runs, **Then** it includes `'No analyst views'` in `weakAreas`.
3. **Given** a finance-type extraction with no risk/opportunity discussion, **When** `compressAspectSummary()` runs, **Then** it includes `'No risk assessment'` in `weakAreas`.
4. **Given** a finance-type extraction with only one company mentioned (no peer comparison data), **When** `compressAspectSummary()` runs, **Then** it includes `'No competitive comparison'` in `weakAreas`.
5. **Given** a non-finance-type extraction, **When** `compressAspectSummary()` runs, **Then** it uses only the existing generic weak area labels — no finance-specific labels are applied.

---

### User Story 4 - Cross-Cutting Entity Enhancement for Finance (Priority: P2)

A user researches "semiconductor industry competitive landscape" in Deep Research mode. The entity merge system identifies companies like NVIDIA, AMD, Intel, and TSMC appearing across multiple aspects. Today, all entities are treated uniformly regardless of type. With this enhancement, when 3+ organization-type entities appear across aspects in a finance query, the system flags them as a "competitive cluster" and signals the synthesizer to create comparison tables rather than separate mentions. This mirrors the investment-notes project's pattern of always including structured competitive comparison tables.

**Why this priority**: P2 because it enhances an existing capability (entity merge) rather than creating new infrastructure. The value is in guiding the synthesizer to produce better-structured output for finance queries.

**Independent Test**: Run "semiconductor industry competitive landscape" in Deep Research mode. Verify the synthesis output includes comparison tables for companies that appear across multiple aspects, rather than mentioning them in isolated sections.

**Acceptance Scenarios**:

1. **Given** a finance-type query where 3+ organization-type entities appear across 2+ aspects, **When** `mergeEntities()` completes, **Then** the returned data includes a `competitiveCluster` flag and the list of clustered entity names.
2. **Given** a competitive cluster is detected, **When** the cross-cutting entities are passed to the synthesizer, **Then** the synthesis prompt includes an instruction to create comparison tables for the clustered entities.
3. **Given** a finance query with only 1-2 cross-cutting organization entities, **When** `mergeEntities()` completes, **Then** no competitive cluster is flagged (threshold not met).
4. **Given** a non-finance query with 3+ organization entities, **When** `mergeEntities()` completes, **Then** no competitive cluster is flagged (only applies to finance queries).
5. **Given** a competitive cluster is detected but the synthesis sources lack quantitative comparison data (fewer than 2 companies have comparable metrics), **When** the synthesizer runs, **Then** it describes the competitive relationship in prose rather than forcing an incomplete comparison table.

**Note**: This user story changes the return type of `mergeEntities()` from `CrossCuttingEntity[]` to `MergeEntitiesResult` (an object wrapping `crossCuttingEntities` and optional `competitiveCluster`). This is a breaking change for the call site in `search-client.tsx` — handled by task T020.

---

### User Story 5 - Bear Case / Contrarian View in Synthesis (Priority: P1)

A user researches "Tesla stock analysis" in Deep Research mode. Today, the synthesizer produces a balanced overview but doesn't structurally separate bull and bear cases. Investment decisions require explicit consideration of both upside and downside scenarios. With this enhancement, the deep research synthesizer prompt for finance queries includes an instruction to dedicate a section to contrarian views, risks, and bear case arguments. This mirrors the investment-notes project's mandatory "Bear Case / Negative Research Review" section, ensuring users see both sides of any investment topic.

**Why this priority**: P1 because presenting both bull and bear cases is fundamental to quality financial research. This is a prompt-only change with outsized impact on output quality for finance queries.

**Independent Test**: Run "Tesla stock analysis" in Deep Research mode. Verify the synthesis includes a dedicated section (or collapsible subsection) presenting contrarian arguments, risk factors, and bear case scenarios, distinct from the general analysis sections.

**Acceptance Scenarios**:

1. **Given** a finance-type deep research query about a specific stock or investment, **When** the synthesizer generates output, **Then** it includes a dedicated risk/bear case section presenting the strongest arguments against the investment thesis.
2. **Given** a finance query about a macro topic (e.g., "recession outlook"), **When** the synthesizer generates output, **Then** it includes a section presenting contrarian scenarios (e.g., "reasons the recession may not materialize" or "reasons it may be worse than expected").
3. **Given** risk factors extracted during research (from US2's `riskFactors` field), **When** the synthesizer has these available, **Then** it incorporates extracted risks into the bear case section with source citations.
4. **Given** a non-finance query, **When** the synthesizer generates output, **Then** no bear case section is added — synthesis proceeds as current behavior.
5. **Given** a finance query where research found no significant risks or contrarian views, **When** the synthesizer generates output, **Then** it notes the absence of identified risks rather than fabricating bear arguments.

---

### User Story 6 - Zero Latency Guarantee (Priority: P1, Cross-Cutting)

All enhancements in this feature MUST add zero perceptible latency. All changes are prompt modifications (processed within existing LLM calls) or programmatic code changes (completing in microseconds to milliseconds). No new API calls, no new sequential pipeline steps, no new infrastructure.

**Acceptance Scenarios**:

1. **Given** a deep research query, **When** the enhanced pipeline executes, **Then** no new API calls are made compared to the 002-enhanced pipeline.
2. **Given** all new programmatic operations (finance sub-classification, enhanced weak area detection, competitive cluster detection), **When** they execute, **Then** they complete in under 10ms combined.
3. **Given** prompt modifications (planner, extractor, synthesizer), **When** compared to the 002-enhanced prompts, **Then** the additional prompt tokens do not exceed 200 tokens per prompt.

---

### Edge Cases

- What if the router classifies a query as `finance` but it's actually about personal budgeting? The finance sub-classifier defaults to `general_finance` which uses the current generic finance aspects — no degradation.
- What if the LLM doesn't produce the finance-specific extraction fields? All new fields default to empty arrays. The pipeline proceeds with existing generic extraction data.
- What if a finance query has no ticker symbol? Sub-classification uses keyword analysis, not just ticker detection. Queries like "best index funds for retirement" match `personal_finance` via keywords.
- What if competitive cluster detection flags non-competitor organizations? The threshold (3+ organizations across 2+ aspects, finance context) is conservative. False positives are harmless — the synthesizer instruction says "create comparison if relevant data is available."
- What if the bear case section can't find contrarian data? The prompt instructs the synthesizer to note the absence of identified risks rather than fabricating arguments.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The `researchPlannerFinancePrompt` MUST detect finance sub-types (stock_analysis, macro, personal_finance, crypto) and generate sub-type-specific aspects.
- **FR-002**: Finance sub-type detection MUST be performed programmatically (via keyword/regex matching) before the planner prompt is constructed — no new LLM call or API endpoint.
- **FR-003**: The `aspectExtractorPrompt` MUST extract `financialMetrics`, `valuationData`, and `riskFactors` arrays for finance-type queries.
- **FR-004**: All finance-specific extraction fields MUST default to `[]` when data is unavailable or query is non-finance.
- **FR-005**: `compressAspectSummary()` MUST detect finance-specific weak areas (`No valuation data`, `No analyst views`, `No risk assessment`, `No competitive comparison`) when the query type is finance.
- **FR-006**: `mergeEntities()` MUST detect competitive clusters (3+ organization entities across 2+ aspects) for finance queries and flag them in the output.
- **FR-007**: The `deepResearchSynthesizerPrompt` MUST include a bear case / contrarian view instruction for finance-type queries.
- **FR-008**: All new programmatic operations MUST complete in under 10ms combined.
- **FR-009**: No new API calls or sequential pipeline steps MUST be introduced.
- **FR-010**: Non-finance queries MUST be completely unaffected — all enhancements are gated on the `finance` query type.
- **FR-011**: The finance sub-type MUST be threaded through the pipeline (plan → extract → analyze-gaps → synthesize) by adding optional fields to existing request bodies — no new API endpoints or sequential calls.

### Key Entities

- **FinanceSubType**: Classification of finance queries — `'stock_analysis' | 'macro' | 'personal_finance' | 'crypto' | 'general_finance'`. Determined during planning, passed through pipeline.
- **FinancialMetric**: Structured extraction of a financial data point — has metric name, value, period, and context. Replaces unstructured claim-based extraction for financial data.
- **ValuationDataPoint**: Structured extraction of valuation data — has metric, current value, and optional historical/peer comparison. Enables the gap analyzer to detect missing valuation context.
- **RiskFactor**: Structured extraction of risks and opportunities — has factor description, type (risk/opportunity), severity, and description. Feeds into the bear case synthesis section.
- **CompetitiveCluster**: A group of 3+ organization-type cross-cutting entities in a finance query. Signals the synthesizer to create comparison tables.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Finance stock analysis queries produce sub-type-specific aspects (competitive position, valuation, growth/risk) rather than generic aspects, as verified by inspecting plan output for 10 sample stock queries.
- **SC-002**: Finance extraction responses include structured `financialMetrics` with metric/value/period fields for 80%+ of stock analysis queries, as measured across 10 sample queries.
- **SC-003**: Gap analysis for finance queries identifies finance-specific gaps (e.g., "no valuation data", "no analyst views") when the corresponding data is genuinely missing, as verified on 10 sample queries.
- **SC-004**: Finance deep research synthesis includes a dedicated risk/contrarian section for stock analysis queries in 90%+ of cases, as verified across 10 sample queries.
- **SC-005**: The enhanced pipeline adds zero new API calls and less than 10ms of programmatic computation compared to the 002-enhanced pipeline.
- **SC-006**: Non-finance queries produce identical output to the 002-enhanced pipeline — no regressions.

## Assumptions

- The research router already classifies queries as `finance` type. This feature extends the classification with sub-types within the planner prompt itself, requiring no changes to the router.
- The existing `aspectExtractorPrompt` has sufficient output token capacity to include 3 additional arrays (financialMetrics, valuationData, riskFactors) without truncation — estimated 100-200 additional tokens.
- The `queryType` (or at minimum the `finance` classification) can be threaded through the pipeline from the plan step to extraction, gap analysis, and synthesis. This may require passing it in the existing request body fields.
- The deep research synthesizer prompt can accommodate a conditional bear case instruction (~50 additional prompt tokens) without impacting output quality for other sections.
- The investment-notes project's patterns (archetype routing, structured scoring, bear case analysis) have been validated through extensive manual investment research and represent proven quality patterns.

## Scope Boundaries

### In Scope
- Finance sub-type detection within the existing planner prompt
- Finance-specific extraction schema additions (financialMetrics, valuationData, riskFactors)
- Finance-aware weak area detection in compressed summary
- Competitive cluster detection in entity merge
- Bear case / contrarian synthesis instruction for finance queries
- Threading `queryType` through the pipeline request chain
- Unit tests for all new programmatic logic

### Out of Scope
- Changes to the research router prompt (sub-classification happens in the planner)
- SEC filing fetching or financial API integrations (no new external data sources)
- Investment advice or buy/sell recommendations (athenius informs, not advises)
- Position sizing, scoring matrices, or investment decision frameworks
- UI changes to display finance-specific data differently
- Changes to non-deep research modes (Web, Brainstorm, standard Research)
- Persistent storage of financial data or query classification
- Real-time stock price lookups or portfolio tracking
