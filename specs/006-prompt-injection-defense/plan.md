# Implementation Plan: Prompt Injection Defense

**Feature Branch**: `006-prompt-injection-defense`
**Created**: 2026-03-10
**Estimated Scope**: Small (primary file: `deep-search/src/lib/prompts.ts` ~40 lines of prompt additions; 3 API route files ~3 lines each for sandwich defense)

## Architecture

No architectural changes. All changes are prompt text additions in `deep-search/src/lib/prompts.ts` and minor user message modifications in 3 API route files. The defense-in-depth approach uses three independent layers:

1. **Instruction hierarchy** — `<inputSecurity>` sections in system prompts
2. **Output format constraints** — reinforced in each `<inputSecurity>` section
3. **Sandwich defense** — reminders appended to user messages after untrusted content

## Implementation Order

Changes are ordered by risk level (highest-risk prompts first). Each change is independent and can be tested in isolation.

### Phase 1: High-Risk Prompts (Direct Web Content)

**Files**: `deep-search/src/lib/prompts.ts`, `deep-search/src/app/api/summarize/route.ts`, `deep-search/src/app/api/research/extract/route.ts`, `deep-search/src/app/api/brainstorm/synthesize/route.ts`

1. Add `<inputSecurity>` to `summarizeSearchResultsPrompt` + sandwich defense in summarize route
2. Add `<inputSecurity>` to `aspectExtractorPrompt` + sandwich defense in extract route
3. Add `<inputSecurity>` to `brainstormSynthesizerPrompt` + sandwich defense in brainstorm synthesize route
4. Verify: Test with injection payloads in Web mode

**Risk**: None — these are additive prompt text changes. The sandwich defense appends text to the user message, which doesn't affect the existing message structure.

### Phase 2: Medium-Risk Prompts (Processed Data + Query-Only)

**File**: `deep-search/src/lib/prompts.ts`

1. Add `<inputSecurity>` to `researchSynthesizerPrompt` and `deepResearchSynthesizerPrompt` (keep text in sync)
2. Add `<inputSecurity>` to `gapAnalyzerPrompt`
3. Add `<inputSecurity>` to `refineSearchQueryPrompt`
4. Add `<inputSecurity>` to `brainstormReframePrompt`
5. Verify: Test with injection payloads in Research and Brainstorm modes

### Phase 3: Testing + Documentation

1. Test injection payloads across all modes (Web, Research, Deep Research, Brainstorm)
2. Test benign query regression (simple factual, research, shopping)
3. Cross-model testing: Gemini Flash, Gemini Pro, DeepSeek
4. Update `deep-search/src/lib/CLAUDE.md` prompt documentation
5. Update `deep-search/src/app/api/CLAUDE.md` with security notes

## Files Modified

| File | Changes |
|------|---------|
| `deep-search/src/lib/prompts.ts` | Add `<inputSecurity>` sections to 8 prompts |
| `deep-search/src/app/api/summarize/route.ts` | Append sandwich defense to user message |
| `deep-search/src/app/api/research/extract/route.ts` | Append sandwich defense to user message |
| `deep-search/src/app/api/brainstorm/synthesize/route.ts` | Append sandwich defense to user message |
| `deep-search/src/lib/CLAUDE.md` | Update prompt documentation |
| `deep-search/src/app/api/CLAUDE.md` | Add security notes |

## Backwards Compatibility

- **No API contract changes**: All routes have the same request/response shapes
- **No caching impact**: Prompt text changes mean new queries get new prompts; cached responses are unaffected and expire naturally
- **No output format changes**: Defenses are constraints, not format modifications

## Success Criteria

1. Known injection payloads in user queries are ignored — model produces normal summary/extraction
2. Simulated malicious search results don't override prompt behavior
3. System prompt content is not revealed when directly asked
4. Output format is maintained even under injection attempts
5. Zero quality regression on benign queries across all modes
6. Consistent behavior across Gemini Flash, Gemini Pro, and DeepSeek
