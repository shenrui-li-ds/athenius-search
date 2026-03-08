# Quickstart: Zero-Latency Deep Research Quality Enhancement

## What Changed

Four quality enhancements to deep research mode, all with zero additional latency:

1. **Entity Extraction**: The extraction LLM now also outputs key entities (names, types) alongside claims/statistics
2. **Cross-Aspect Entity Merge**: A programmatic step identifies entities appearing across multiple research aspects
3. **Compressed Gap Analysis**: The gap analyzer receives structured metadata instead of lossy text summaries
4. **Source Authority Tagging**: Sources from known academic/institutional domains are tagged as high-authority

## How to Test

### Quick Smoke Test

1. Start dev server: `cd deep-search && npm run dev`
2. Navigate to `http://localhost:3000`
3. Search for "Tesla's impact on the energy industry" in Research mode with Deep Research enabled
4. Verify the output:
   - Mentions Tesla across multiple sections (not siloed)
   - Connects automotive, energy storage, and manufacturing perspectives
   - Shows academic source badges where applicable

### Entity Merge Verification

1. Run a deep research query with a topic that spans multiple aspects (e.g., a company, technology, or person)
2. Check browser console for `[Entity Merge]` log showing cross-cutting entities
3. Verify the synthesis connects perspectives around shared entities

### Gap Analysis Quality Check

1. Run an academic deep research query (e.g., "quantum computing error correction")
2. Check server logs for gap analysis input — should show structured metadata, not just "X claims extracted"
3. Verify gaps are specific (e.g., "no expert opinions" rather than "needs more info")

### Source Authority Check

1. Run a query that returns academic sources (arxiv, nature.com, .edu sites)
2. Verify `high-authority` tags appear in the compressed summary log
3. Gap analysis should detect absence of authoritative sources when applicable

### Latency Validation

1. Run the same deep research query 5 times
2. Measure end-to-end time
3. Compare with baseline (should be within 500ms)

## New Files

| File | Purpose |
|------|---------|
| `src/lib/entity-merge.ts` | `mergeEntities()`, `normalizeEntityName()` |
| `src/lib/source-authority.ts` | `tagSourceAuthority()`, `AUTHORITY_DOMAINS` |
| `src/lib/compressed-summary.ts` | `compressAspectSummary()`, `formatCompressedSummaries()` |
| `src/__tests__/lib/entity-merge.test.ts` | Entity merge unit tests |
| `src/__tests__/lib/source-authority.test.ts` | Authority tagging unit tests |
| `src/__tests__/lib/compressed-summary.test.ts` | Compressed summary unit tests |

## Modified Files

| File | Change |
|------|--------|
| `src/lib/prompts.ts` | `aspectExtractorPrompt` adds entity output format |
| `src/lib/types.ts` | New entity/authority types |
| `src/app/api/research/extract/route.ts` | Parse entities from extraction output |
| `src/app/api/research/analyze-gaps/route.ts` | Use compressed summary + entity context |
| `src/app/api/research/synthesize/route.ts` | Accept cross-cutting entities |
| `src/app/search/search-client.tsx` | Call mergeEntities(), pass to APIs |
