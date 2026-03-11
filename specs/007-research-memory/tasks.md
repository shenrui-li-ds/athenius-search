# Tasks: Research Memory

**Input**: Design documents from `/specs/007-research-memory/`
**Prerequisites**: plan.md (required), spec.md (required)

**Tests**: Unit tests for prompt sections and memory utility; integration tests for memory API and pipeline flow.

**Organization**: Tasks follow the phase order from plan.md. Phase 1 builds the foundation (database + API). Phase 2 integrates with gap analysis (highest leverage). Phase 3 extends to planning and synthesis. Phase 4 adds user expertise and settings. Phase 5 covers testing and documentation.

## Format: `[ID] [P?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths and prompt function names in descriptions

---

## Phase 1: Database + Memory API (Foundation)

**Goal**: Create the storage layer and API routes for research memory.

**Independent Test**: Verify CRUD operations on memory API. Confirm RLS prevents cross-user access. Confirm pg_trgm fuzzy matching returns related topics with similarity > 0.2.

- [ ] T001 Create Supabase migration `deep-search/supabase/migrations/004_research_memory.sql` — `research_memory` table with RLS, `user_expertise` table with RLS, pg_trgm extension + GIN index on `topic_query`, expiry index, cron job for daily cleanup of expired rows
- [ ] T002 Create `deep-search/src/lib/research-memory.ts` — memory compression function (calls LLM to compress synthesis to ~150 words), retrieval result formatting (converts DB rows to prompt-ready XML), expertise level calculation (beginner/intermediate/advanced from query count), staleness age calculation
- [ ] T003 Create `deep-search/src/app/api/research/memory/route.ts` — GET handler: retrieve memories by topic similarity (pg_trgm, weighted by freshness, limit 3), check memory preference enabled; POST handler: compress synthesis, upsert by topic similarity > 0.6, set TTL by search mode; DELETE handler: clear all memories for authenticated user

**Checkpoint**: Memory API accepts GET/POST/DELETE. RLS enforced. Fuzzy matching works. Upsert replaces similar topics.

---

## Phase 2: Gap Analysis Memory (Highest Leverage)

**Goal**: Inject prior filled gaps into gap analysis to avoid redundant Round 2 searches.

**Independent Test**: Research "intermittent fasting health effects" in Deep mode. Then research "intermittent fasting for athletes" in Deep mode. Verify gap analyzer does NOT re-suggest gaps that were filled in the first session.

- [ ] T004 Add optional `filledGaps` parameter to `gapAnalyzerPrompt` in `deep-search/src/lib/prompts.ts` — add `<previouslyFilledGaps>` section with age caveat after `<description>` and `<inputSecurity>`, before `<context>`. Only include when `filledGaps` is non-empty. Include age in days and explicit caveat: "Avoid re-suggesting unless current data contradicts prior findings."
- [ ] T005 Update `deep-search/src/app/api/research/analyze-gaps/route.ts` — accept optional `filledGaps` and `memoryAge` in request body, pass to `gapAnalyzerPrompt`
- [ ] T006 Update `deep-search/src/app/search/search-client.tsx` — after gap analysis phase, before Round 2: call `GET /api/research/memory?query=X` to retrieve relevant prior memories; pass `filledGaps` from memory to analyze-gaps API call
- [ ] T007 Update `deep-search/src/app/search/search-client.tsx` — after synthesis completes (both standard and deep): call `POST /api/research/memory` fire-and-forget with synthesis content, entities, gaps, contradictions, claims, search mode, source count. Only call when memory preference is enabled.

**Checkpoint**: Gap analysis skips previously filled gaps. New memories stored after each research session. No latency regression (retrieval parallel, storage fire-and-forget).

---

## Phase 3: Research Continuity (Planning + Synthesis)

**Goal**: Inject prior research context into planning (complementary angles) and synthesis (reference prior findings, note updates).

**Independent Test**: Research "NVIDIA stock analysis", then research "NVIDIA vs AMD comparison". Verify planner generates angles complementary to prior NVIDIA research. Verify synthesizer references prior findings naturally.

- [ ] T008 [P] Add optional `priorResearch` parameter to `researchPlannerPrompt` in `deep-search/src/lib/prompts.ts` — add `<priorResearch>` section with age, mode, caveat, and summary after `<description>`, before `<context>`. Instruct planner to generate COMPLEMENTARY angles, not repeat prior coverage.
- [ ] T009 [P] Add optional `priorContext` parameter to `researchSynthesizerPrompt` in `deep-search/src/lib/prompts.ts` — add `<priorContext>` section with age, caveat, summary, and resolved contradictions. Instruct synthesizer to reference prior findings naturally and note updates when current sources contradict stored claims.
- [ ] T010 [P] Add same `priorContext` parameter to `deepResearchSynthesizerPrompt` in `deep-search/src/lib/prompts.ts` — keep `<priorContext>` text in sync with T009 (same pattern as `<evidenceEvaluation>` and `<inputSecurity>` sync between both synthesizers)
- [ ] T011 Update `deep-search/src/app/api/research/plan/route.ts` — accept optional `priorResearch` (summary + age) in request body, pass to planner prompt function
- [ ] T012 Update `deep-search/src/app/api/research/synthesize/route.ts` — accept optional `priorContext` (summary + contradictions + age) in request body, pass to synthesizer prompt function
- [ ] T013 Update `deep-search/src/app/search/search-client.tsx` — move memory retrieval to run in parallel with plan + limit check (instead of before gap analysis only). Pass `priorResearch` to plan API, `priorContext` to synthesize API. Keep `filledGaps` flow from Phase 2.
- [ ] T014 Implement active invalidation in `deep-search/src/app/api/research/memory/route.ts` POST handler — when storing new memory, check for existing memory with similarity > 0.6 and replace it (upsert). Verify no duplicate memories accumulate for the same topic.

**Checkpoint**: Planner generates complementary angles when prior research exists. Synthesizer references prior findings. Memory is replaced (not duplicated) on re-research. Memory retrieval runs in parallel with plan — zero added latency.

---

## Phase 4: User Expertise + Settings

**Goal**: Track user domain expertise to adjust synthesis depth. Add memory controls to Account settings.

**Independent Test**: Research finance topics 10+ times. Verify synthesizer skips basic definitions. Toggle memory off in preferences, verify no memory stored or retrieved.

- [ ] T015 [P] Add expertise tracking to `deep-search/src/app/api/research/memory/route.ts` POST handler — after storing research memory, upsert `user_expertise` row: increment `query_count` for the detected `queryType` domain, update `last_searched_at`
- [ ] T016 [P] Add `<userExpertise>` section to `researchSynthesizerPrompt` and `deepResearchSynthesizerPrompt` in `deep-search/src/lib/prompts.ts` — optional section with domain, level (beginner/intermediate/advanced), and behavior hint. Keep in sync between both synthesizers. Only include when expertise data available.
- [ ] T017 Update `deep-search/src/app/api/research/synthesize/route.ts` — accept optional `expertiseLevel` parameter, pass to synthesizer prompt function
- [ ] T018 Update `deep-search/src/app/search/search-client.tsx` — retrieve user expertise from memory API response (add expertise field to GET endpoint), pass to synthesize API
- [ ] T019 [P] Add `research_memory_enabled` column to `user_limits` table (or equivalent user preferences) — default `false` (opt-in). Add Supabase migration if needed.
- [ ] T020 [P] Add research memory toggle to Account > Preferences UI — checkbox/switch for "Enable Research Memory", reads/writes the preference. Add "Clear Research Memory" button with confirmation dialog that calls DELETE /api/research/memory.
- [ ] T021 Update `deep-search/src/app/search/search-client.tsx` — check memory preference before calling memory retrieval/storage. If disabled, skip all memory API calls.

**Checkpoint**: Expertise tracking increments per domain. Synthesis adjusts depth for experienced users. Memory toggle works: off = no storage/retrieval. Clear button deletes all memories.

---

## Phase 5: Testing + Documentation

**Goal**: Comprehensive test coverage and documentation updates.

- [ ] T022 Add unit tests for prompt memory sections in `deep-search/src/__tests__/lib/prompts.test.ts` — verify `<previouslyFilledGaps>` in gapAnalyzerPrompt (present with data, absent without), verify `<priorResearch>` in researchPlannerPrompt (present with data, absent without), verify `<priorContext>` in both synthesizer prompts (present with data, absent without, synced between both), verify `<userExpertise>` in both synthesizer prompts, verify age caveat text includes "may be outdated" and "prefer current sources"
- [ ] T023 Add unit tests for `research-memory.ts` in `deep-search/src/__tests__/lib/research-memory.test.ts` — test compression function (output < 200 words), test expertise level calculation (1-5=beginner, 6-20=intermediate, 21+=advanced), test staleness age calculation, test retrieval formatting (XML output structure)
- [ ] T024 Add integration tests for memory API in `deep-search/src/__tests__/api/research/memory.test.ts` — test GET returns empty when no memories, test POST stores and GET retrieves, test upsert replaces similar topic, test DELETE clears all memories, test RLS (mock different user IDs), test expired memories not returned
- [ ] T025 [P] Update `deep-search/src/lib/CLAUDE.md` — document research-memory.ts (compression, formatting, expertise utils), document memory sections in prompt tables, add Research Memory section to architecture
- [ ] T026 [P] Update `deep-search/src/app/api/CLAUDE.md` — document `/api/research/memory` route (GET/POST/DELETE), document new optional parameters in plan, analyze-gaps, and synthesize routes
- [ ] T027 [P] Update project `CLAUDE.md` — add Research Memory subsection under Architecture describing cross-session memory, staleness strategy, and pipeline integration points

**Checkpoint**: All new and existing tests pass. Documentation reflects memory architecture. Quality gates satisfied: `npm run lint` passes, `npm run build` compiles, all tests green.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1**: No dependencies — start immediately (foundation)
- **Phase 2**: Depends on Phase 1 (needs database + API + utility)
- **Phase 3**: Depends on Phase 1 (needs database + API). Can run partially in parallel with Phase 2 (different prompts/routes), but T013 depends on T006/T007 (extends search-client changes)
- **Phase 4**: Depends on Phase 1 + Phase 3 (needs memory API + pipeline integration)
- **Phase 5**: Depends on Phase 1-4 completing

### Parallel Opportunities

```
Phase 1 (T001-T003) — sequential (T002/T003 depend on T001)
    ↓
Phase 2 (T004-T007) — T004/T005 parallel, then T006/T007 sequential
    ↓ (can overlap with Phase 3 prompt tasks)
Phase 3 (T008-T014) — T008/T009/T010 parallel, then T011-T014 sequential
    ↓
Phase 4 (T015-T021) — T015/T016/T019/T020 parallel, then T017-T018/T021 sequential
    ↓
Phase 5 (T022-T027) — T025/T026/T027 parallel, T022-T024 sequential after implementation
```

---

## Implementation Strategy

### MVP First (Phase 1 + Phase 2 only)

1. Complete Phase 1: Database + API foundation
2. Complete Phase 2: Gap analysis memory only
3. **STOP and VALIDATE**: Test with returning research queries across 3+ providers
4. Measure: Does gap analysis produce fewer redundant gaps? Do credit costs decrease for follow-up research?
5. Deploy if gap analysis improvement confirmed and no quality regression

### Full Delivery

1. Phase 1: Foundation
2. Phase 2: Gap analysis memory
3. Phase 3: Research continuity (planning + synthesis)
4. Phase 4: User expertise + settings
5. Phase 5: Testing + documentation
6. Final validation: staleness behavior, cross-model testing, privacy controls

---

## Notes

- Memory compression reuses the pattern from `thread-context.ts` (`generateThreadSummary`) — same LLM call pattern (low temperature, truncated input, constrained output)
- `pg_trgm` is a built-in PostgreSQL extension available on Supabase — verify with `SELECT * FROM pg_extension WHERE extname = 'pg_trgm'` before migration
- Keep `<priorContext>` text in sync between `researchSynthesizerPrompt` and `deepResearchSynthesizerPrompt` — same sync pattern as `<evidenceEvaluation>` (005) and `<inputSecurity>` (006)
- Memory storage is fire-and-forget (same pattern as credit finalization) — failure doesn't affect current session
- All new API parameters are optional — existing clients work without changes
- Memory preference default is **off** (opt-in) — no behavioral change for existing users
- Test with at least Gemini Flash, Gemini Pro, and DeepSeek to verify cross-model handling of `<priorResearch>` and `<previouslyFilledGaps>` sections
