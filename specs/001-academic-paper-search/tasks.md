# Tasks: Academic Paper Search Integration

**Input**: Design documents from `/specs/001-academic-paper-search/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Not explicitly requested in spec. Test tasks included only for the new utility module where parsing logic is non-trivial.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup

**Purpose**: Extend types and create the academic search module skeleton

- [ ] T001 Extend Source interface with optional academic fields (`sourceType`, `doi`, `citedByCount`, `journalName`, `publicationYear`) in `deep-search/src/lib/types.ts`
- [ ] T002 [P] Add optional `OPENALEX_API_KEY` and `OPENALEX_MAILTO` to environment config documentation in `deep-search/.env.example` (if exists) and `CLAUDE.md`
- [ ] T003 [P] Create `deep-search/src/lib/academic-search.ts` with module skeleton: export placeholder functions `searchOpenAlex`, `searchArxiv`, `searchAcademicSources`, `shouldSearchAcademic`, `reconstructAbstract` that return empty results

---

## Phase 2: Foundational (Core Academic Search Module)

**Purpose**: Implement the academic search utility functions that all user stories depend on

**CRITICAL**: No user story integration can begin until this phase is complete

- [ ] T004 Implement `reconstructAbstract()` in `deep-search/src/lib/academic-search.ts` — convert OpenAlex inverted index abstract (`Record<string, number[]>`) to plain text by sorting words by position and joining with spaces. Return empty string for null input.
- [ ] T005 Implement `searchOpenAlex()` in `deep-search/src/lib/academic-search.ts` — call `GET https://api.openalex.org/works?search={query}&select=id,display_name,abstract_inverted_index,authorships,cited_by_count,publication_date,doi,primary_location,topics&per_page=5&sort=relevance_score:desc` with optional `mailto` or `api_key` param from env. Convert response to `TavilySearchResult` format and `Source[]` with academic metadata. Wrap in try/catch returning empty results on failure. Log warnings on errors.
- [ ] T006 Implement `searchArxiv()` in `deep-search/src/lib/academic-search.ts` — call `GET http://export.arxiv.org/api/query?search_query=all:{query}&max_results=3&sortBy=relevance&sortOrder=descending`. Parse Atom XML response (use DOMParser or regex-based extraction for serverless compatibility). Convert to `TavilySearchResult` format and `Source[]` with academic metadata. Wrap in try/catch returning empty results on failure. Log warnings on errors.
- [ ] T007 Implement `shouldSearchAcademic()` in `deep-search/src/lib/academic-search.ts` — return `true` for query types `academic`, `technical`, `explanatory`; return `false` for `shopping`, `travel`, `finance`, `general`.
- [ ] T008 Implement `searchAcademicSources()` in `deep-search/src/lib/academic-search.ts` — orchestrate OpenAlex + arXiv searches using `Promise.allSettled`. Merge results, deduplicate by URL. Accept `includeArxiv` boolean (default true). Return combined `TavilySearchResult` and `Source[]`.
- [ ] T009 Write unit tests for `reconstructAbstract`, `shouldSearchAcademic`, and result conversion functions in `deep-search/src/__tests__/lib/academic-search.test.ts`. Mock fetch for OpenAlex/arXiv API responses. Test graceful degradation on API failure (empty results, no throw).

**Checkpoint**: Academic search module is complete and tested. Integration can begin.

---

## Phase 3: User Story 1 + 2 — Academic Sources in Research Pipeline (Priority: P1)

**Goal**: Research queries classified as academic/technical/explanatory dispatch academic searches in parallel with Tavily, and academic papers flow through extraction and synthesis with proper citations.

**Independent Test**: Submit "quantum error correction techniques" in Research mode. Verify sources panel includes papers from OpenAlex/arXiv. Verify synthesized document cites academic papers with `[N]` references. Submit "best hiking camera bag" and verify NO academic sources appear.

### Implementation

- [ ] T010 [US1] Export `QueryType` type from `deep-search/src/lib/api-utils.ts` (or `types.ts`) so it can be imported by `search-client.tsx`. Ensure the query type is passed from `/api/research/plan` response through to the search dispatch step.
- [ ] T011 [US1] Modify research search dispatch in `deep-search/src/app/search/search-client.tsx` — after receiving the plan response (which includes `queryType`), call `shouldSearchAcademic(queryType)`. If true, dispatch `searchAcademicSources(planItem.query)` calls in parallel with existing Tavily `fetch('/api/search', ...)` calls using `Promise.allSettled`. For arXiv, only include it for the first aspect (`includeArxiv: index === 0`).
- [ ] T012 [US1] Merge academic results into the pipeline in `deep-search/src/app/search/search-client.tsx` — after all searches settle, merge academic `Source[]` into `allSources` (deduplicating by URL with `seenUrls`), and merge academic `TavilySearchResult.results` into `aspectResults[].results` for each aspect. Academic sources get global citation indices via the existing `globalSourceIndex` loop.
- [ ] T013 [US1] Verify end-to-end flow: academic results flow through existing `/api/research/extract` and `/api/research/synthesize` calls unchanged. No modifications needed to extract or synthesize routes — confirm by testing with a live academic query.

**Checkpoint**: Academic papers appear in research results for eligible queries. Papers are cited in synthesis output. Non-eligible queries are unaffected.

---

## Phase 4: User Story 3 — Academic Source Metadata in UI (Priority: P2)

**Goal**: Users can visually distinguish academic papers from web sources in the sources panel with DOI, citation count, journal name, and publication year.

**Independent Test**: After a research query returns academic sources, verify the sources panel shows academic-specific metadata that is not shown on web sources.

### Implementation

- [ ] T014 [P] [US3] Modify source pill/card rendering in `deep-search/src/components/SearchResult.tsx` — when `source.sourceType === 'academic'`, display academic metadata below the title: publication year, journal name (from `source.journalName`), citation count (from `source.citedByCount`, e.g., "Cited by 150"), and DOI as a clickable link. Use a subtle visual indicator (e.g., small icon or badge) to distinguish academic sources from web sources.
- [ ] T015 [P] [US3] Add i18n keys for academic metadata labels in `deep-search/src/i18n/messages/en.json` and `deep-search/src/i18n/messages/zh.json` — add keys under `results` namespace: `citedBy` ("Cited by {count}" / "{count} citations"), `doi` ("DOI"), `academicSource` ("Academic Paper").

**Checkpoint**: Academic sources display rich metadata. Web sources display as before.

---

## Phase 5: User Story 4 — Graceful Degradation (Priority: P2)

**Goal**: Pipeline completes successfully when academic APIs are down, returning web-only results with no user-facing errors.

**Independent Test**: Set an invalid `OPENALEX_API_KEY`, submit an academic query, verify the pipeline completes with web-only results and no error banners.

### Implementation

- [ ] T016 [US4] Verify graceful degradation is already handled by `Promise.allSettled` in T011 + try/catch in T005/T006. Add explicit timeout (8 seconds) to both `searchOpenAlex` and `searchArxiv` fetch calls in `deep-search/src/lib/academic-search.ts` using `AbortController` to prevent slow API responses from delaying the pipeline.
- [ ] T017 [US4] Add structured logging for academic search failures in `deep-search/src/lib/academic-search.ts` — use `createApiLogger` to log `warn` level messages when OpenAlex or arXiv calls fail, including error type and query. Do NOT log at `error` level (to avoid Sentry alerts for expected degradation).

**Checkpoint**: Pipeline is resilient to academic API failures. No user-visible errors.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation updates and final validation

- [ ] T018 [P] Update `deep-search/src/lib/CLAUDE.md` — add academic search section documenting: `academic-search.ts` module, eligible query types, OpenAlex/arXiv API details, result conversion flow, graceful degradation behavior.
- [ ] T019 [P] Update `deep-search/src/components/CLAUDE.md` — document new Source fields (`sourceType`, `doi`, `citedByCount`, `journalName`, `publicationYear`) and academic source rendering behavior.
- [ ] T020 [P] Update root `CLAUDE.md` — add `OPENALEX_API_KEY` and `OPENALEX_MAILTO` to environment variables section (optional). Add brief mention of academic paper search in the Architecture > Search Flow section.
- [ ] T021 Run `npm run build` and `npm run lint` in `deep-search/` to verify no type errors or lint failures.
- [ ] T022 Run quickstart.md validation — test the three scenarios: academic query, non-academic query, and degradation with invalid API key.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on T001 (Source type extension) — BLOCKS all user stories
- **US1+2 (Phase 3)**: Depends on Phase 2 completion (academic search module)
- **US3 (Phase 4)**: Depends on Phase 3 (needs academic sources flowing through pipeline to test UI)
- **US4 (Phase 5)**: Depends on Phase 3 (needs integration to verify degradation behavior)
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **US1+2 (P1)**: Can start after Phase 2. Core pipeline integration.
- **US3 (P2)**: Can start after US1+2. Needs academic sources in pipeline to test UI rendering.
- **US4 (P2)**: Can start after US1+2. Needs integration to verify degradation. Can run in parallel with US3.

### Within Each Phase

- Tasks marked [P] can run in parallel
- Sequential tasks must complete in order (T004 before T005 due to `reconstructAbstract` being used in `searchOpenAlex`)

### Parallel Opportunities

- T002 and T003 can run in parallel (different files)
- T005 and T006 can run in parallel (OpenAlex and arXiv are independent)
- T014 and T015 can run in parallel (different files)
- T018, T019, T020 can all run in parallel (different documentation files)
- US3 and US4 can run in parallel after US1+2 completes

---

## Parallel Example: Phase 2

```bash
# After T004 completes, launch OpenAlex and arXiv implementations together:
Task: "T005 Implement searchOpenAlex() in deep-search/src/lib/academic-search.ts"
Task: "T006 Implement searchArxiv() in deep-search/src/lib/academic-search.ts"
# Note: These are independent functions in the same file but can be written sequentially
# T007 can also run in parallel (simple boolean function)
```

## Parallel Example: Phase 4 + 5

```bash
# After Phase 3 completes, launch US3 and US4 in parallel:
# Team member A:
Task: "T014 [US3] Modify source rendering in SearchResult.tsx"
Task: "T015 [US3] Add i18n keys for academic metadata"

# Team member B:
Task: "T016 [US4] Verify graceful degradation and add timeouts"
Task: "T017 [US4] Add structured logging for failures"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 Only)

1. Complete Phase 1: Setup (T001-T003)
2. Complete Phase 2: Foundational (T004-T009)
3. Complete Phase 3: US1+2 Pipeline Integration (T010-T013)
4. **STOP and VALIDATE**: Test with academic query and non-academic query
5. Deploy/demo — academic papers now appear in research results

### Incremental Delivery

1. Setup + Foundational → Academic search module ready
2. US1+2 → Academic papers in research pipeline → Deploy (MVP!)
3. US3 → Rich metadata in sources panel → Deploy
4. US4 → Resilience hardening → Deploy
5. Polish → Documentation → Deploy

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US1 and US2 are combined into one phase because they are both P1 and tightly coupled (search + extraction/synthesis)
- No database changes needed for this feature
- No credit system changes needed (academic APIs are free)
- arXiv XML parsing should use a serverless-compatible approach (no native DOMParser in Node.js — use a lightweight parser or regex)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
