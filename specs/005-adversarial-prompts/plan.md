# Implementation Plan: Adversarial Evidence Analysis Prompts

**Feature Branch**: `005-adversarial-prompts`
**Created**: 2026-03-10
**Estimated Scope**: Small (primary file: `deep-search/src/lib/prompts.ts`, ~50 lines of prompt additions; one TypeScript interface update in `deep-search/src/app/api/research/extract/route.ts`)

## Architecture

No architectural changes. All changes are prompt text modifications in `deep-search/src/lib/prompts.ts`. The extraction→synthesis pipeline structure is unchanged. The only schema change is adding an `evidenceType` field to the claim extraction JSON format — this is backwards-compatible (existing cached extractions without the field still parse correctly). The `ExtractedClaim` TypeScript interface in `deep-search/src/app/api/research/extract/route.ts` must also be updated to include the optional `evidenceType` field.

## Implementation Order

Changes are ordered upstream-to-downstream so each builds on the previous:

### Phase 1: Extraction (Change 1)

**Files**: `deep-search/src/lib/prompts.ts` — `aspectExtractorPrompt`, `deep-search/src/app/api/research/extract/route.ts` — `ExtractedClaim` interface

1. Add `<confidenceCriteria>` section after `<extractionRules>` with countable heuristics for established/emerging/contested
2. Add `<evidenceTypes>` section defining data/study/expert_opinion/anecdotal
3. Update `<outputFormat>` claims schema to include `evidenceType` field
4. Update `ExtractedClaim` TypeScript interface to include optional `evidenceType` field
5. Verify: Run a research search, confirm extraction JSON includes evidenceType and varied confidence levels

**Risk**: Extraction JSON schema change. The synthesizer receives this data — it must handle the new field. Since the synthesizer prompt is updated in Phase 2, ordering matters. However, even without the synthesizer update, the extra field is harmless (model just ignores it in the prompt).

### Phase 2: Synthesis (Changes 2 + 3)

**File**: `deep-search/src/lib/prompts.ts` — `researchSynthesizerPrompt` + `deepResearchSynthesizerPrompt`

1. In `researchSynthesizerPrompt`: Replace `<confidenceHandling>` section with `<evidenceEvaluation>` section (6 principles covering evidence hierarchy, single-source attribution, perspective gaps)
2. In `deepResearchSynthesizerPrompt`: Replace `<confidenceHandling>` section with same `<evidenceEvaluation>` section, and add `<gapResolution>` section (3 principles for honest gap assessment)
3. **Keep `<evidenceEvaluation>` text in sync** between both synthesizer prompts — same 6 principles in both
4. Verify: Run research + deep research searches, confirm output includes evidence-weighted language and single-source attribution

### Phase 3: Gap Analysis (Change 4)

**File**: `deep-search/src/lib/prompts.ts` — `gapAnalyzerPrompt`

1. Add `contradicted_claim` to `<gapTypes>`
2. Add prioritization rule for contradiction-driven gaps
3. Verify: Find a query with known source conflicts, confirm gap analysis generates `contradicted_claim` gaps

### Phase 4: Web Summarization (Change 5)

**File**: `deep-search/src/lib/prompts.ts` — `summarizeSearchResultsPrompt`

1. Add `<evidenceAnalysis>` section after `<requirements>`, before `<formatting>` (4 principles)
2. Update `<specialInstructions>` conflict handling from vague "acknowledge" to specific "present both positions with citations"
3. Verify: Run web searches on topics with source disagreement, confirm output attributes single-source claims and presents conflicts

### Phase 5: Testing + Documentation

1. Cross-model testing: Run same queries through Gemini Flash, Gemini Pro, DeepSeek
2. Regression testing: Run simple factual queries to verify no over-hedging
3. Update `deep-search/src/lib/CLAUDE.md` prompt documentation tables
4. Update `CLAUDE.md` if any pipeline behavior changes are notable

## Files Modified

| File | Changes |
|------|---------|
| `deep-search/src/lib/prompts.ts` | All 5 prompt modifications |
| `deep-search/src/app/api/research/extract/route.ts` | Add optional `evidenceType` to `ExtractedClaim` interface |
| `deep-search/src/lib/CLAUDE.md` | Update prompt documentation |

## Backwards Compatibility

- **Cached extractions**: Existing cached extractions (24h TTL) won't have `evidenceType`. The synthesizer prompt references it but the field being absent just means the model synthesizes without evidence type signal — same as current behavior. No breakage.
- **Cached syntheses**: Existing cached research/web summaries (48h TTL) are unaffected — they serve the already-generated content. New queries get the improved prompts.
- **No API contract changes**: All API routes have the same request/response shapes. The evidenceType field is internal to the extraction→synthesis data flow.

## Success Criteria

1. Research output attributes single-source claims ("According to [source]...") instead of asserting them as consensus
2. Extraction confidence levels are distributed (not all "established") — measurable by inspecting extraction JSON
3. Source conflicts are analyzed with both sides presented, not just noted
4. Deep research honestly acknowledges unresolved gaps instead of smoothing over them
5. Simple factual queries (e.g., "what is photosynthesis") show no degradation or over-hedging
6. All changes work consistently across Gemini Flash, Gemini Pro, and DeepSeek
