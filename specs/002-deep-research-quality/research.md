# Research: Zero-Latency Deep Research Quality Enhancement

**Date**: 2026-03-07
**Feature**: [spec.md](./spec.md)

## R1: Entity Extraction Output Format

**Decision**: Add an `entities` array to the existing JSON output schema in `aspectExtractorPrompt`. Each entity has `name`, `normalizedName`, and `type`.

**Rationale**: The extraction LLM call already outputs structured JSON (claims, statistics, definitions, expertOpinions, contradictions, keyInsight). Adding an `entities` array is a minimal schema extension (~50-100 additional output tokens). The LLM already identifies entities implicitly in claims and expert opinions — making it explicit costs near-zero additional inference time.

**Alternatives Considered**:
- Separate NER API call (rejected: adds latency and cost)
- Client-side regex entity extraction (rejected: low quality, can't identify entity types)
- Extract entities from claims programmatically post-LLM (rejected: would miss entities mentioned in context but not in claims)

## R2: Entity Normalization Strategy

**Decision**: Simple programmatic normalization — lowercase, strip common suffixes ("Inc", "Corp", "Ltd", "LLC", "Co", "Company", "Foundation", "Institute", "University"), trim whitespace. No fuzzy matching.

**Rationale**: Analysis of typical deep research queries shows most cross-aspect entity matches are exact or near-exact after basic normalization. "Tesla" vs "Tesla, Inc." and "MIT" vs "Massachusetts Institute of Technology" are the common patterns. The suffix-stripping approach handles the corporate/institutional naming conventions that appear most frequently. Full fuzzy matching (Levenshtein, Jaro-Winkler) would add complexity and potential false positives for minimal gain.

**Alternatives Considered**:
- Fuzzy string matching (rejected: adds complexity, false positive risk, out of scope per spec)
- LLM-based entity resolution (rejected: adds latency, defeats zero-latency constraint)
- No normalization (rejected: would miss obvious matches like "Tesla" vs "Tesla Inc")

## R3: Compressed Summary Format Design

**Decision**: Replace `summarizeExtractedData()` with a structured format at ~120 tokens per aspect containing: claim count by confidence level, statistic count with date range, expert opinion count, contradiction count with brief descriptions, source authority distribution, entity list, and identified weak areas.

**Rationale**: The current `summarizeExtractedData()` (analyze-gaps/route.ts:34-43) produces ~30 tokens per aspect with only claim count and key insight — losing ~90% of extraction data. Passing full claims (~1500 tokens/aspect) causes LLM attention drift in the gap analyzer. The compressed format preserves all metadata needed for gap identification while staying information-dense at ~120 tokens/aspect.

**Format**:
```
Aspect: [name]
Claims: 5 established, 2 emerging, 1 contested
Statistics: 4 (range: 2022-2025)
Expert opinions: 2
Contradictions: 1 — "[brief description]"
Sources: 3 high-authority, 5 unclassified
Entities: Tesla, lithium-ion batteries, energy grid
Weak areas: No academic sources, no expert opinions on cost analysis
```

**Alternatives Considered**:
- Keep current lossy summary (rejected: this IS the problem we're solving)
- Pass full extraction data (rejected: user explicitly flagged attention drift concern)
- JSON format for compressed summary (rejected: natural language is more token-efficient and easier for the gap analyzer LLM to process)

## R4: Source Authority Domain Whitelist

**Decision**: Curate a whitelist of ~40-50 known high-authority domains. Tag matching sources as `high-authority`; leave all others `unclassified`. Never tag as "low-authority".

**Rationale**: Domain-based classification achieves ~95% accuracy for the intended purpose (distinguishing academic/institutional from informal sources). The binary classification (high vs unclassified) avoids false negatives that could unfairly penalize legitimate but unknown sources.

**Whitelist Categories**:
- **Academic publishers**: arxiv.org, nature.com, sciencedirect.com, springer.com, wiley.com, ieee.org, acm.org, pubmed.ncbi.nlm.nih.gov, scholar.google.com, jstor.org, plos.org, frontiersin.org, mdpi.com, cell.com, thelancet.com, bmj.com, nejm.org
- **Government/institutional**: .gov domains, .edu domains, who.int, un.org, worldbank.org, imf.org, oecd.org, europa.eu
- **Major research orgs**: nist.gov, nih.gov, cdc.gov, nasa.gov, nsf.gov
- **High-quality journalism**: reuters.com, apnews.com, bbc.com (as supplementary, not academic)

**Implementation**: A simple `Set<string>` lookup with domain extraction from URL. Check both exact domain match and TLD-based rules (.edu, .gov).

**Alternatives Considered**:
- ML-based source quality scoring (rejected: adds latency, requires training data, out of scope)
- Source metadata analysis (rejected: unreliable for programmatic detection)
- No source authority tagging (rejected: spec requires it as P2)

## R5: Cross-Cutting Entity Context in Synthesizer

**Decision**: Pass cross-cutting entities as an additional XML section in the synthesizer prompt, listing each entity with the aspects it appears in.

**Rationale**: The synthesizer already receives XML-formatted extraction data. Adding a `<crossCuttingEntities>` section is natural and fits the existing prompt structure. This provides explicit signals for the LLM to connect perspectives rather than treating aspects as independent silos.

**Format**:
```xml
<crossCuttingEntities>
  <entity name="Tesla" aspects="automotive innovation, energy storage, manufacturing" />
  <entity name="lithium-ion batteries" aspects="energy storage, manufacturing" />
</crossCuttingEntities>
```

**Alternatives Considered**:
- System prompt instruction only (rejected: too vague, LLM needs explicit entity-aspect mappings)
- Restructure extraction data by entity instead of by aspect (rejected: too disruptive to existing pipeline)

## R6: Integration Points in Deep Research Pipeline

**Decision**: Four integration points, all non-blocking:

1. **Extraction** (`extract/route.ts`): Parse `entities` array from LLM JSON output alongside existing fields. Add to `AspectExtraction` interface. Fallback: empty array if missing.

2. **Post-extraction** (`search-client.tsx`): After all extractions complete, call `mergeEntities()` (pure TypeScript, <20ms). This is a programmatic step, not an API call.

3. **Gap analysis** (`analyze-gaps/route.ts`): Replace `summarizeExtractedData()` with `compressAspectSummary()`. Pass compressed summaries + cross-cutting entities to gap analyzer prompt.

4. **Synthesis** (`synthesize/route.ts`): Add `crossCuttingEntities` parameter. Include in synthesis prompt as XML context.

**Rationale**: All four integration points piggyback on existing pipeline steps. No new sequential operations. The entity merge runs in the client after extractions complete (which already wait for all parallel extractions). The compressed summary and entity context are computed before the existing API calls to gap analysis and synthesis.

**Alternatives Considered**:
- New API route for entity merge (rejected: unnecessary server round-trip for a <20ms operation)
- Merge entities on the server in a new endpoint (rejected: adds latency, complexity)

## R7: Fallback Strategy

**Decision**: All enhancements are independently fallback-safe:
- Entity extraction: If LLM doesn't return entities, `entities` defaults to `[]`. No impact on existing behavior.
- Entity merge: If no entities found, cross-cutting list is empty. Synthesis proceeds without entity context.
- Compressed summary: If generation fails, fall back to current `summarizeExtractedData()`.
- Source authority: If URL parsing fails, source remains `unclassified`.

**Rationale**: The spec explicitly requires graceful degradation (FR-012). Each enhancement is additive — failure returns to current behavior, never worse.
