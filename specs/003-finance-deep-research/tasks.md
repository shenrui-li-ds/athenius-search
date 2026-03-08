# Tasks: Finance-Aware Deep Research Enhancement

**Input**: Design documents from `/specs/003-finance-deep-research/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/
**Depends on**: `002-deep-research-quality` (must be merged to main first)

**Tests**: Included (unit tests for all new programmatic functions, extended integration tests).

**Organization**: Tasks are grouped by user story. US6 (Zero Latency Guarantee) is a cross-cutting constraint validated in the Polish phase.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Add new TypeScript types and thread queryType through the pipeline

- [x] T001 Add `FinanceSubType`, `FinancialMetric`, `ValuationDataPoint`, `RiskFactor`, `CompetitiveCluster`, and `MergeEntitiesResult` types to `deep-search/src/lib/types.ts`
- [x] T002 Modify `/api/research/plan` response in `deep-search/src/app/api/research/plan/route.ts` to include `queryType` and `financeSubType` fields in the JSON response: `queryType` comes from the existing router classification; when `queryType === 'finance'`, call `detectFinanceSubType(query)` (imported from `prompts.ts`) in the route handler to compute `financeSubType` and include it in the response
- [x] T003 Modify `deep-search/src/app/search/search-client.tsx` to read `queryType` and `financeSubType` from plan response and store in local variables for threading to downstream API calls

**Checkpoint**: queryType flows from plan through to client. Downstream routes don't use it yet.

---

## Phase 2: User Story 1 - Finance Sub-Classification in Research Planner (Priority: P1)

**Goal**: Generate sub-type-specific aspects for different finance queries (stock analysis, macro, personal finance, crypto).

**Independent Test**: Search "NVIDIA stock analysis" in Deep Research mode. Verify the plan response contains stock-specific aspects (competitive_position, valuation_context, growth_catalysts, risk_assessment) instead of generic aspects.

### Tests for User Story 1

> **TDD**: Write tests first and verify they fail before starting implementation tasks.

- [x] T004 [P] [US1] Create unit tests for `detectFinanceSubType()` covering: stock queries (with ticker, with "stock" keyword, with "invest"), macro queries ("recession", "inflation", "interest rate"), personal finance ("budget", "retirement", "401k"), crypto ("bitcoin", "ethereum", "staking"), general finance fallback, non-English queries in `deep-search/src/__tests__/lib/finance-classification.test.ts`

### Implementation for User Story 1

- [x] T005 [US1] Create `detectFinanceSubType()` function in `deep-search/src/lib/prompts.ts` (co-located with planner prompts): keyword/regex-based classification returning `FinanceSubType`
- [x] T006 [US1] Modify `researchPlannerFinancePrompt()` in `deep-search/src/lib/prompts.ts` to call `detectFinanceSubType()` internally and return sub-type-specific aspect strategies (stock_analysis: competitive_position/valuation_context/growth_catalysts/risk_assessment; macro: current_conditions/leading_indicators/sector_implications/historical_parallels; personal_finance: strategies/tax_implications/risk_management/common_mistakes; crypto: technology_fundamentals/adoption_metrics/regulatory_landscape/risk_factors; general_finance: current generic aspects)

**Checkpoint**: Finance queries generate sub-type-specific aspects. Non-finance queries unaffected.

---

## Phase 3: User Story 2 - Structured Finance Extraction Schema (Priority: P1)

**Goal**: Extract finance-specific structured data (financial metrics, valuation data, risk factors) alongside generic claims.

**Depends on**: Phase 1 (queryType threading to extract route)

**Independent Test**: Run "NVIDIA stock analysis" in Deep Research mode. Inspect `/api/research/extract` responses. Verify `financialMetrics`, `valuationData`, and `riskFactors` arrays are populated with structured data.

### Tests for User Story 2

> **TDD**: Write tests first and verify they fail before starting implementation tasks.

- [x] T007 [P] [US2] Create unit tests for finance extraction field parsing covering: valid financialMetrics parsing, valid valuationData parsing, valid riskFactors parsing, malformed/missing finance fields default to `[]`, non-finance queryType produces no finance fields in `deep-search/src/__tests__/lib/finance-extraction.test.ts`

### Implementation for User Story 2

- [x] T008 [US2] Modify `aspectExtractorPrompt()` in `deep-search/src/lib/prompts.ts` to accept optional `queryType` parameter; when `'finance'`, add `financialMetrics`, `valuationData`, and `riskFactors` to the JSON output schema with examples
- [x] T009 [US2] Modify `deep-search/src/app/api/research/extract/route.ts` to: (a) accept `queryType` in request body, (b) pass `queryType` to `aspectExtractorPrompt()`, (c) parse `financialMetrics`, `valuationData`, and `riskFactors` from LLM output with `[]` defaults for missing/malformed fields
- [x] T010 [US2] Modify `deep-search/src/app/search/search-client.tsx` to pass `queryType` to the extract API call (**Note**: T003 already stores queryType — read existing changes first)

**Checkpoint**: Finance extractions include structured financial data. Non-finance extractions unchanged.

---

## Phase 4: User Story 5 - Bear Case / Contrarian View in Synthesis (Priority: P1)

**Goal**: Finance deep research synthesis includes a dedicated risk/contrarian section.

**Depends on**: Phase 1 (queryType threading to synthesize route)

**Independent Test**: Run "Tesla stock analysis" in Deep Research mode. Verify synthesis includes a risk/bear case section with contrarian arguments.

### Implementation for User Story 5

- [x] T011 [P] [US5] Modify `deepResearchSynthesizerPrompt()` in `deep-search/src/lib/prompts.ts` to accept optional `queryType` parameter; when `'finance'`, add `<bearCaseInstruction>` XML section instructing the synthesizer to include a dedicated "Risks & Contrarian View" collapsible section presenting strongest arguments against the thesis, using extracted riskFactors when available
- [x] T012 [US5] Modify `deep-search/src/app/api/research/synthesize/route.ts` to accept `queryType` in request body and pass it to the synthesizer prompt function
- [x] T013 [US5] Modify `deep-search/src/app/search/search-client.tsx` to pass `queryType` to the synthesize API call (**Note**: T003 and T010 already modified this file — read existing changes first)

**Checkpoint**: Finance synthesis includes bear case section. Non-finance synthesis unchanged.

---

## Phase 5: User Story 3 - Finance-Aware Weak Area Detection (Priority: P2)

**Goal**: Compressed summaries for finance queries detect domain-specific gaps (no valuation data, no analyst views, no risk assessment, no competitive comparison).

**Depends on**: Phase 3 (finance extraction fields available for weak area detection)

**Independent Test**: Run a finance deep research query. Inspect compressed summaries passed to gap analysis. Verify finance-specific weak area labels appear when corresponding data is missing.

### Tests for User Story 3

> **TDD**: Write tests first and verify they fail before starting implementation tasks.

- [x] T014 [P] [US3] Add unit tests to `deep-search/src/__tests__/lib/compressed-summary.test.ts` for finance-aware weak area detection covering: no valuation data detected when `valuationData` empty, no analyst views detected when `expertOpinions` empty in finance context, no risk assessment detected when `riskFactors` empty, no competitive comparison detected when single org entity, non-finance queries use generic weak areas only, finance-specific counts (financialMetricCount, valuationDataCount, riskFactorCount) included in output

### Implementation for User Story 3

- [x] T015 [US3] Modify `compressAspectSummary()` in `deep-search/src/lib/compressed-summary.ts` to accept optional `queryType` parameter; when `'finance'`: (a) add finance-specific weak area checks, (b) include `financialMetricCount`, `valuationDataCount`, `riskFactorCount` in output
- [x] T016 [US3] Modify `deep-search/src/app/api/research/analyze-gaps/route.ts` to accept `queryType` in request body and pass it to `compressAspectSummary()`
- [x] T017 [US3] Modify `deep-search/src/app/search/search-client.tsx` to pass `queryType` to the analyze-gaps API call (**Note**: T003, T010, T013 already modified this file — read existing changes first)

**Checkpoint**: Finance gap analysis receives domain-specific weak area labels. Round 2 searches more targeted for finance queries.

---

## Phase 6: User Story 4 - Cross-Cutting Entity Enhancement for Finance (Priority: P2)

**Goal**: Detect competitive clusters (3+ organizations across 2+ aspects) in finance queries and signal the synthesizer to create comparison tables.

**Depends on**: Phase 1 (queryType available), Phase 4 (synthesize route accepts queryType)

**Independent Test**: Run "semiconductor industry competitive landscape" in Deep Research mode. Verify synthesis includes comparison tables for companies appearing across multiple aspects.

### Tests for User Story 4

> **TDD**: Write tests first and verify they fail before starting implementation tasks.

- [x] T018 [P] [US4] Add unit tests to `deep-search/src/__tests__/lib/entity-merge.test.ts` for competitive cluster detection covering: 3+ org entities across 2+ aspects in finance → cluster detected, 2 org entities → no cluster (below threshold), 3+ non-org entities → no cluster, 3+ org entities in non-finance query → no cluster, cluster includes correct entity names and aspect overlap count, return type is `MergeEntitiesResult` with `crossCuttingEntities` and optional `competitiveCluster`

### Implementation for User Story 4

- [x] T019 [US4] Modify `mergeEntities()` in `deep-search/src/lib/entity-merge.ts` to: (a) accept optional `queryType` parameter, (b) return `MergeEntitiesResult` instead of `CrossCuttingEntity[]`, (c) when `queryType === 'finance'` and 3+ organization-type entities span 2+ aspects, include `competitiveCluster` in result
- [x] T020 [US4] Modify `deep-search/src/app/search/search-client.tsx` to: (a) update `mergeEntities()` call to pass `queryType` and destructure `MergeEntitiesResult`, (b) pass `competitiveCluster` to synthesize API call (**Note**: T003, T010, T013, T017 already modified this file — read existing changes first)
- [x] T021 [US4] Modify `deepResearchSynthesizerPrompt()` in `deep-search/src/lib/prompts.ts` to accept optional `competitiveCluster` parameter; when present, add `<competitiveComparison>` XML section instructing the synthesizer to create comparison tables for the clustered entities (**Note**: T011 already modified this function — read existing changes first)
- [x] T022 [US4] Modify `deep-search/src/app/api/research/synthesize/route.ts` to accept `competitiveCluster` in request body and pass it to the synthesizer prompt function (**Note**: T012 already modified this file — read existing changes first)

**Checkpoint**: Finance queries with competitive landscapes produce comparison tables in synthesis.

---

## Phase 7: Integration Tests

**Purpose**: Automated integration tests for the finance-enhanced pipeline

- [x] T023 [P] Extend integration tests in `deep-search/src/__tests__/api/research/quality-wiring.test.ts` to verify: (a) finance queryType flows from plan to extract to analyze-gaps to synthesize, (b) finance extraction includes financialMetrics/valuationData/riskFactors fields, (c) finance compressed summary includes finance-specific weak areas, (d) competitive cluster detection triggers comparison instruction in synthesis, (e) non-finance queries are unaffected

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, validation, performance verification (US6)

- [x] T024 [P] Update `deep-search/src/lib/CLAUDE.md` with documentation for finance sub-classification, enhanced extraction schema, finance-aware weak areas, and competitive cluster detection
- [x] T025 [P] Update `deep-search/src/app/api/CLAUDE.md` with documentation for modified API contracts (plan, extract, analyze-gaps, synthesize with queryType and competitiveCluster)
- [x] T026 Add performance assertions to unit tests: verify `detectFinanceSubType()` in <1ms, competitive cluster detection in <2ms, finance weak area detection in <1ms, all combined <10ms (FR-008)
- [x] T027 Run all unit and integration tests (`cd deep-search && npx jest`) and fix any failures
- [x] T028 Run `npm run lint` and `npm run build` in `deep-search/` and fix any errors
- [x] T029 Run smoke tests: (a) "NVIDIA stock analysis" — verify stock-specific aspects, financial metrics, bear case section; (b) "2025 recession outlook" — verify macro aspects; (c) "Tesla's impact on the energy industry" — verify non-finance regression check

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (US1 - Planner)**: Depends on Phase 1 (types)
- **Phase 3 (US2 - Extraction)**: Depends on Phase 1 (queryType threading)
- **Phase 4 (US5 - Bear Case)**: Depends on Phase 1 (queryType threading)
- **Phase 5 (US3 - Weak Areas)**: Depends on Phase 3 (finance extraction fields)
- **Phase 6 (US4 - Clusters)**: Depends on Phase 1 (queryType) + Phase 4 (synthesize accepts queryType)
- **Phase 7 (Integration Tests)**: Depends on Phases 2-6 (all modifications complete)
- **Phase 8 (Polish)**: Depends on all previous phases

### Critical Path

```
T001 (types) → T002 (plan route) → T003 (client stores queryType)
                                          ↓
                    T005-T006 (planner sub-classification)
                                          ↓
            T008-T010 (finance extraction) → T014-T017 (weak area detection)
                                          ↓
            T011-T013 (bear case synthesis) → T018-T022 (cluster detection)
                                          ↓
                              T023 (integration tests)
                                          ↓
                          T024-T029 (polish & validation)
```

### Parallel Opportunities

**After T001 completes** (Phase 1):
- T002 and T003 must be sequential (plan route before client)

**After T003 completes**:
- T004-T006 (US1 planner) can run in parallel with T007-T010 (US2 extraction)
- T011-T013 (US5 bear case) can run in parallel with US1 and US2

**After Phase 3 (US2) completes**:
- T014-T017 (US3 weak areas) can start

**After Phase 4 (US5) completes**:
- T018-T022 (US4 clusters) can start

**Within Phase 7**:
- Integration tests (T023) can run after all implementation complete

**Within Phase 8**:
- T024 and T025 (docs) can run in parallel
- T026 (perf assertions) can run in parallel with docs

---

## Implementation Strategy

### MVP First (User Story 1 + 5 Only)

1. Complete Phase 1: Setup (types + queryType threading)
2. Complete Phase 2: Finance sub-classification in planner
3. Complete Phase 4: Bear case synthesis instruction
4. **STOP and VALIDATE**: Test with finance queries — should see targeted aspects and risk section
5. These two changes alone deliver the highest-impact quality improvement

### Incremental Delivery

1. Phase 1 (Setup) → queryType flows through pipeline
2. Phase 2 (US1: Planner) + Phase 4 (US5: Bear Case) → Visible quality improvement for finance queries
3. Phase 3 (US2: Extraction) → Structured finance data flows through pipeline
4. Phase 5 (US3: Weak Areas) → Better Round 2 targeting for finance
5. Phase 6 (US4: Clusters) → Comparison tables in synthesis
6. Phase 7 (Integration Tests) → Automated validation
7. Phase 8 (Polish) → Docs, perf, full validation → Deploy

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US6 (Zero Latency Guarantee) is validated as a cross-cutting constraint, not a separate phase
- All finance-specific behavior is gated on `queryType === 'finance'` — non-finance queries are completely unaffected
- All new extraction fields default to `[]` for backward compatibility
- `mergeEntities()` return type changes from `CrossCuttingEntity[]` to `MergeEntitiesResult` — this is a breaking change for the call site in search-client.tsx but is handled in T020
