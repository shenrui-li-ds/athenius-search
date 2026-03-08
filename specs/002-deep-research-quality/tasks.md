# Tasks: Zero-Latency Deep Research Quality Enhancement

**Input**: Design documents from `/specs/002-deep-research-quality/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included (plan.md specifies unit tests for all new pure functions).

**Organization**: Tasks are grouped by user story. US4 (Zero Latency Guarantee) is a cross-cutting constraint validated in the Polish phase.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Add new TypeScript types and interfaces needed by all user stories

- [x] T001 Add ExtractedEntity, CrossCuttingEntity, SourceAuthority, CompressedAspectSummary types and extend AspectExtraction interface in `deep-search/src/lib/types.ts`

---

## Phase 2: Foundational (Source Authority Utility)

**Purpose**: Source authority tagging is a standalone utility depended on by US2 (compressed summary includes authority distribution). Must complete before US2.

- [x] T002 [P] Create `tagSourceAuthority()` function and `AUTHORITY_DOMAINS` whitelist Set (~40-50 domains: arxiv.org, nature.com, .edu, .gov, etc.) in `deep-search/src/lib/source-authority.ts`
- [x] T003 [P] Create unit tests for `tagSourceAuthority()` covering: exact domain match, TLD-based rules (.edu, .gov), subdomain handling, unknown domains return 'unclassified', invalid URLs in `deep-search/src/__tests__/lib/source-authority.test.ts`

**Checkpoint**: Source authority utility ready. US1 and US2 can proceed.

---

## Phase 3: User Story 1 - Cross-Aspect Entity Recognition in Synthesis (Priority: P1)

**Goal**: Extract entities from each aspect, merge across aspects, and pass cross-cutting entities to the synthesizer so it connects perspectives rather than siloing them.

**Independent Test**: Search "Tesla's impact on the energy industry" in Deep Research mode. Verify synthesis connects Tesla across automotive, energy storage, and manufacturing sections rather than treating them as isolated topics.

### Tests for User Story 1

> **TDD**: Write tests first and verify they fail before starting implementation tasks.

- [x] T004 [P] [US1] Create unit tests for `mergeEntities()` and `normalizeEntityName()` covering: suffix stripping (Inc, Corp, Ltd), case normalization, entities in 2+ aspects become cross-cutting, single-aspect entities excluded, empty entities array, deduplication within same aspect in `deep-search/src/__tests__/lib/entity-merge.test.ts`

### Implementation for User Story 1

- [x] T005 [P] [US1] Create `normalizeEntityName()` (lowercase, strip suffixes, trim) and `mergeEntities()` (group by normalizedName, return entities in 2+ aspects with aspect list and count) in `deep-search/src/lib/entity-merge.ts`
- [x] T006 [US1] Modify `aspectExtractorPrompt` in `deep-search/src/lib/prompts.ts` to add entity extraction output format (entities array with name, normalizedName, type) to the existing JSON schema
- [x] T007 [US1] Modify extraction response parsing in `deep-search/src/app/api/research/extract/route.ts` to parse `entities` array from LLM output, defaulting to `[]` if missing or malformed (FR-012 fallback)
- [x] T008 [US1] Modify `deep-search/src/app/api/research/synthesize/route.ts` to accept `crossCuttingEntities` in request body and include `<crossCuttingEntities>` XML section in the deep research synthesizer prompt
- [x] T009 [US1] Modify `deep-search/src/app/search/search-client.tsx` to call `mergeEntities()` after all Round 1 extractions complete, and pass `crossCuttingEntities` to the synthesize API call (**Note**: T013 and T015 also modify this file — read existing changes before each edit)

**Checkpoint**: Entity extraction, merge, and synthesis integration complete. Deep research should now connect cross-aspect entities.

---

## Phase 4: User Story 2 - Smarter Gap Analysis with Structured Context (Priority: P1)

**Goal**: Replace lossy `summarizeExtractedData()` with compressed structured summaries that preserve coverage metadata, enabling the gap analyzer to identify specific weaknesses.

**Depends on**: Phase 2 (source authority tags used in compressed summary), Phase 3 T005 (entity data included in summary)

**Independent Test**: Run an academic deep research query. Verify gap analysis identifies specific gaps (e.g., "no expert opinions", "no academic sources") rather than generic suggestions.

### Tests for User Story 2

> **TDD**: Write tests first and verify they fail before starting implementation tasks.

- [x] T010 [P] [US2] Create unit tests for `compressAspectSummary()` and `formatCompressedSummaries()` covering: correct claim counts by confidence level, statistic count and date range, expert opinion count, contradiction briefs (max 3), source authority distribution, entity list, weak area identification, output token count ~120 per aspect in `deep-search/src/__tests__/lib/compressed-summary.test.ts`

### Implementation for User Story 2

- [x] T011 [US2] Create `compressAspectSummary()` (converts AspectExtraction + sources to CompressedAspectSummary; internally calls `tagSourceAuthority()` on each source URL to compute authority distribution) and `formatCompressedSummaries()` (formats as text for gap analyzer prompt) in `deep-search/src/lib/compressed-summary.ts`
- [x] T012 [US2] Modify `deep-search/src/app/api/research/analyze-gaps/route.ts` to: (a) replace `summarizeExtractedData()` with `compressAspectSummary()` + `formatCompressedSummaries()`, (b) accept `crossCuttingEntities` and `sourceAuthority` in request body, (c) include cross-cutting entities and source authority context in the gap analyzer prompt
- [x] T013 [US2] Modify `deep-search/src/app/search/search-client.tsx` to pass `crossCuttingEntities` and `sourceAuthority` summary to the analyze-gaps API call (**Note**: T009 already modified this file — read existing changes first)

**Checkpoint**: Gap analysis now receives structured context. Round 2 searches should be more targeted.

---

## Phase 5: User Story 3 - Source Authority Awareness (Priority: P2)

**Goal**: Tag sources from known academic/institutional domains as high-authority and flow this metadata through to gap analysis and synthesis.

**Depends on**: Phase 2 (source-authority.ts already created), Phase 4 (compressed summary already includes authority distribution)

**Independent Test**: Run a scientific deep research query. Verify sources from arxiv.org, .edu sites etc. are tagged high-authority. Verify gap analysis detects when a topic lacks authoritative sources.

### Implementation for User Story 3

- [x] T014 [US3] Integrate `tagSourceAuthority()` into extraction result processing in `deep-search/src/app/api/research/extract/route.ts` to tag each source URL and include authority metadata in the extraction response (enables downstream consumers to access authority tags without recomputing)
- [x] T015 [US3] Modify `deep-search/src/app/search/search-client.tsx` to aggregate source authority counts from extraction responses and pass to gap analysis and synthesis API calls (**Note**: T009 and T013 already modified this file — read existing changes first)
- [x] T016 [US3] Update `deep-search/src/app/api/research/synthesize/route.ts` to include source authority context in the synthesis prompt so the synthesizer can weight authoritative sources appropriately

**Checkpoint**: Source authority flows through the full pipeline. Gap analysis and synthesis are authority-aware.

---

## Phase 6: Integration Tests

**Purpose**: Automated integration tests for modified API routes (Constitution VI compliance)

- [x] T017 [P] Create integration test for `/api/research/extract` verifying: entities array present in response, entities default to `[]` on malformed LLM output, source authority tags included when US3 is active, in `deep-search/src/__tests__/api/research-extract.test.ts`
- [x] T018 [P] Create integration test for `/api/research/analyze-gaps` verifying: accepts compressed summary + crossCuttingEntities + sourceAuthority, produces targeted gaps based on structured input, in `deep-search/src/__tests__/api/research/analyze-gaps.test.ts`
- [x] T019 [P] Create integration test for `/api/research/synthesize` verifying: accepts crossCuttingEntities in request body, synthesis prompt includes `<crossCuttingEntities>` XML section, in `deep-search/src/__tests__/api/research/synthesize.test.ts`

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, validation, performance verification (US4)

- [x] T020 [P] Update `deep-search/src/lib/CLAUDE.md` with documentation for new utility modules (entity-merge.ts, source-authority.ts, compressed-summary.ts) and modified pipeline behavior
- [x] T021 [P] Update `deep-search/src/app/api/CLAUDE.md` with documentation for modified API contracts (extract, analyze-gaps, synthesize)
- [x] T022 Add performance benchmark assertions to unit tests: verify `mergeEntities()` completes in <20ms for 4 aspects with 15 entities each, `compressAspectSummary()` in <5ms per aspect, and `tagSourceAuthority()` in <1ms per call; all three combined <50ms (FR-010) in `deep-search/src/__tests__/lib/entity-merge.test.ts`, `deep-search/src/__tests__/lib/compressed-summary.test.ts`, `deep-search/src/__tests__/lib/source-authority.test.ts`
- [x] T023 Run all unit and integration tests (`cd deep-search && npx jest`) and fix any failures
- [x] T024 Run `npm run lint` and `npm run build` in `deep-search/` and fix any errors
- [x] T025 Run quickstart.md smoke test: search "Tesla's impact on the energy industry" in Deep Research mode and verify entity connections, structured gap analysis, and source authority tagging

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies - start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 (types)
- **Phase 3 (US1)**: Depends on Phase 1 (types)
- **Phase 4 (US2)**: Depends on Phase 2 (source authority for `compressAspectSummary()`) + Phase 3 T005 (entity merge)
- **Phase 5 (US3)**: Depends on Phase 2 (source-authority.ts) + Phase 4 (compressed summary)
- **Phase 6 (Integration Tests)**: Depends on Phases 3-5 (all API route modifications complete)
- **Phase 7 (Polish)**: Depends on all previous phases

### Critical Path

```
T001 (types) → T005 (entity-merge) → T006 (prompts) → T007 (extract) → T008 (synthesize) → T009 (search-client US1)
                                                                                                       ↓
T001 (types) → T002 (source-authority) → T011 (compressed-summary) → T012 (analyze-gaps) → T013 (search-client US2)
                                                                                                       ↓
                                                                     T014 (authority in extract) → T015 (authority in client) → T016 (authority in synthesize)
                                                                                                       ↓
                                                                     T017, T018, T019 (integration tests) → T020-T025 (polish)
```

### Parallel Opportunities

**After T001 completes** (Phase 1):
- T002, T003 (source authority) can run in parallel with T004, T005 (entity merge)

**Within Phase 3** (write tests first, then implement):
- T004 (tests) before T005 (implementation) — TDD ordering
- T006 (prompts) can run in parallel with T004/T005

**Within Phase 4** (write tests first, then implement):
- T010 (tests) before T011 (implementation) — TDD ordering

**Within Phase 6**:
- T017, T018, T019 (integration tests) can all run in parallel

**Within Phase 7**:
- T020 and T021 (docs) can run in parallel

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Types
2. Complete Phase 3: Entity Recognition (US1)
3. **STOP and VALIDATE**: Test entity merge with cross-aspect queries
4. Deep research should already show improved cross-aspect connections

### Incremental Delivery

1. Phase 1 (Types) + Phase 2 (Source Authority) → Foundation ready
2. Phase 3 (US1: Entity Recognition) → Test cross-aspect synthesis → Validate
3. Phase 4 (US2: Gap Analysis) → Test gap specificity → Validate
4. Phase 5 (US3: Source Authority Integration) → Test authority flow → Validate
5. Phase 6 (Integration Tests) → Automated route validation
6. Phase 7 (Polish) → Performance benchmarks, docs, full validation → Deploy

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US4 (Zero Latency Guarantee) is validated as a cross-cutting constraint, not a separate implementation phase — all implementations must maintain <50ms for programmatic operations and zero new sequential API calls
- All entity extraction failures fall back gracefully to current behavior (FR-012)
- Source authority uses binary classification only: 'high-authority' or 'unclassified' — never 'low-authority' (FR-007)
