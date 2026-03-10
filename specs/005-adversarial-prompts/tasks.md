# Tasks: Adversarial Evidence Analysis Prompts

**Input**: Design documents from `/specs/005-adversarial-prompts/`
**Prerequisites**: plan.md (required), spec.md (required)

**Tests**: Not requested — no test tasks included. Verification is manual (run searches, inspect output).

**Organization**: Tasks follow the upstream-to-downstream pipeline order from plan.md. No user stories in the traditional sense — this feature has 5 discrete prompt changes that chain together.

## Format: `[ID] [P?] Description`

- **[P]**: Can run in parallel (different prompts, no dependencies)
- Include exact file paths and prompt function names in descriptions

---

## Phase 1: Upstream — Extraction (Change 1)

**Goal**: Add confidence criteria and evidence type tagging to `aspectExtractorPrompt` so extracted claims carry structured signal for downstream synthesis.

**Independent Test**: Run a Research mode search, inspect the extraction JSON. Confirm: (a) confidence levels are distributed (not all "established"), (b) claims include `evidenceType` field with varied values.

- [ ] T001 Add `<confidenceCriteria>` section after `<extractionRules>` in `aspectExtractorPrompt` in `deep-search/src/lib/prompts.ts` — define established (2+ sources agree), emerging (1 source or recent only), contested (sources disagree)
- [ ] T002 Add `<evidenceTypes>` section in `aspectExtractorPrompt` in `deep-search/src/lib/prompts.ts` — define data, study, expert_opinion, anecdotal with concrete descriptions
- [ ] T003 Update `<outputFormat>` claims schema in `aspectExtractorPrompt` in `deep-search/src/lib/prompts.ts` — add `evidenceType` field to claim objects: `"evidenceType": "data|study|expert_opinion|anecdotal"`
- [ ] T004 Update `ExtractedClaim` TypeScript interface in `deep-search/src/app/api/research/extract/route.ts` — add optional `evidenceType?: 'data' | 'study' | 'expert_opinion' | 'anecdotal'` field for type safety with new extraction schema

**Checkpoint**: Extraction produces claims with accurate confidence levels and evidence type metadata. TypeScript interface matches prompt schema.

---

## Phase 2: Midstream — Synthesis (Changes 2 + 3)

**Goal**: Replace passive confidence phrasing with active evidence evaluation in both research and deep research synthesizers.

**Independent Test**: Run a Research mode search on a topic with known disagreements. Confirm: (a) single-source claims are attributed ("According to..."), (b) contested claims present both sides, (c) evidence types are weighted (data > opinion).

- [ ] T005 [P] Replace `<confidenceHandling>` with `<evidenceEvaluation>` section in `researchSynthesizerPrompt` in `deep-search/src/lib/prompts.ts` — 6 principles: established as fact, emerging with attribution, contested with both sides, single-source flagging, evidence type weighting, perspective gap detection
- [ ] T006 [P] Add `<gapResolution>` section to `deepResearchSynthesizerPrompt` in `deep-search/src/lib/prompts.ts` — 3 principles: assess gap resolution, highlight R1 vs R2 contradictions, acknowledge unresolved gaps
- [ ] T007 [P] Replace `<confidenceHandling>` with `<evidenceEvaluation>` section in `deepResearchSynthesizerPrompt` in `deep-search/src/lib/prompts.ts` — same 6 principles as T005 (keep text in sync between both synthesizers)

**Checkpoint**: Research and deep research output applies evidence hierarchy and attributes single-source claims.

---

## Phase 3: Midstream — Gap Analysis (Change 4)

**Goal**: Turn contradiction detection into actionable search tasks for deep research Round 2.

**Independent Test**: Run a Deep Research search on a topic with known source conflicts. Inspect gap analysis JSON. Confirm: (a) `contradicted_claim` gap type appears when contradictions exist, (b) generated search query targets authoritative resolution.

- [ ] T008 Add `contradicted_claim` gap type to `<gapTypes>` in `gapAnalyzerPrompt` in `deep-search/src/lib/prompts.ts` — "An important claim where sources directly conflict — targeted search needed to find authoritative resolution"
- [ ] T009 Add prioritization rule for contradiction-driven gaps in `<rules>` section of `gapAnalyzerPrompt` in `deep-search/src/lib/prompts.ts` — "If extracted data contains contradictions on significant claims, prioritize generating a contradicted_claim gap with a search query designed to find authoritative or primary sources"

**Checkpoint**: Gap analysis actively turns contradictions into Round 2 search tasks.

---

## Phase 4: Downstream — Web Summarization (Change 5)

**Goal**: Add evidence-aware analysis to web mode summaries so single-source claims are attributed and conflicts are presented fairly.

**Independent Test**: Run a Web mode search on a controversial topic. Confirm: (a) multi-source claims stated as fact with combined citations, (b) single-source claims use "According to..." framing, (c) conflicting sources get "While [1] reports X, [2] argues Y" treatment.

- [ ] T010 Add `<evidenceAnalysis>` section after `<requirements>` and before `<formatting>` in `summarizeSearchResultsPrompt` in `deep-search/src/lib/prompts.ts` — 4 principles: multi-source as established, single-source attributed, conflicts presented both sides, data vs opinion distinction
- [ ] T011 Update `<specialInstructions>` conflict handling in `summarizeSearchResultsPrompt` in `deep-search/src/lib/prompts.ts` — replace "If information is uncertain or conflicting, acknowledge this clearly" with "When sources present conflicting information, present both positions with their respective citations rather than picking one side"

**Checkpoint**: Web search summaries distinguish evidence strength and present conflicts fairly.

---

## Phase 5: Documentation

**Goal**: Update prompt documentation to reflect the new adversarial evidence analysis capabilities.

- [ ] T012 [P] Update prompt documentation tables in `deep-search/src/lib/CLAUDE.md` — add evidenceType to extraction format, document evidenceEvaluation replacing confidenceHandling, document contradicted_claim gap type, document evidenceAnalysis in summarize prompt
- [ ] T013 [P] Update `CLAUDE.md` project-level documentation if any pipeline behavior description needs updating

**Checkpoint**: Documentation accurately reflects all prompt changes.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Extraction)**: No dependencies — start immediately
- **Phase 2 (Synthesis)**: Best after Phase 1 (synthesizer uses evidenceType from extraction), but can proceed independently (synthesizer handles missing evidenceType gracefully)
- **Phase 3 (Gap Analysis)**: Independent — can run in parallel with Phase 2
- **Phase 4 (Web Summarization)**: Independent — can run in parallel with all other phases
- **Phase 5 (Documentation)**: Depends on all implementation phases (1-4) completing

### Parallel Opportunities

Phases 2, 3, and 4 can all run in parallel after Phase 1 completes:

```
Phase 1 (Extraction)
    ↓
Phase 2 (Synthesis) ─┐
Phase 3 (Gap Analysis) ─┼── all parallel
Phase 4 (Web Summarize) ─┘
    ↓
Phase 5 (Documentation)
```

Within Phase 2, T005/T006/T007 are all [P] (different prompt functions, same file but different locations). T005 and T007 must use identical `<evidenceEvaluation>` text.

---

## Implementation Strategy

### MVP First (Phase 1 + Phase 4)

1. Complete Phase 1: Extraction confidence + evidenceType — improves all downstream quality
2. Complete Phase 4: Web summarization — most user-visible improvement (every web search)
3. **STOP and VALIDATE**: Test with 3+ providers on factual and controversial queries
4. Deploy if quality improvement confirmed

### Full Delivery

1. Phase 1: Extraction → builds structured signal
2. Phases 2 + 3 + 4 in parallel → all consume upstream signal
3. Phase 5: Documentation
4. Final validation across all modes and providers

---

## Notes

- All changes are in a single file (`deep-search/src/lib/prompts.ts`) — coordinate edits to avoid conflicts
- [P] tasks within a phase touch different functions but same file — true parallel if using separate edits
- Cached extractions (24h TTL) without evidenceType degrade gracefully — no cache invalidation needed
- Test with at least Gemini Flash, Gemini Pro, and DeepSeek to verify cross-model consistency
- Monitor output length — "present both sides" instructions may increase word count on controversial topics
