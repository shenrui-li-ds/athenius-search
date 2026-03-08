# Feature Specification: Zero-Latency Deep Research Quality Enhancement

**Feature Branch**: `002-deep-research-quality`
**Created**: 2026-03-07
**Status**: Draft
**Input**: User description: "Improve deep research mode quality by ~25-35% with zero additional latency through four enhancements that piggyback on existing pipeline steps."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Cross-Aspect Entity Recognition in Synthesis (Priority: P1)

A user researches a broad topic like "Tesla's impact on the energy industry" in Deep Research mode. The system generates 3-4 research aspects (e.g., automotive innovation, energy storage, manufacturing). Today, the synthesizer treats each aspect as an independent silo — even though "Tesla" appears in multiple aspects, the system doesn't recognize this overlap and misses opportunities to connect perspectives. With this enhancement, the extraction step identifies key entities mentioned in each aspect, and a lightweight merge step detects entities that span multiple aspects. The synthesizer receives explicit signals like "Tesla appears across automotive, energy storage, and manufacturing aspects" and produces a more coherent document that connects these threads rather than presenting isolated sections.

**Why this priority**: Cross-aspect connection is the single largest quality gap in deep research. Without it, multi-angle research produces fragmented output that reads like separate summaries stapled together rather than an integrated analysis.

**Independent Test**: Submit "Tesla's impact on the energy industry" in Deep Research mode. Verify the synthesized document explicitly connects Tesla's automotive work with its energy storage efforts rather than treating them as separate topics. Compare output quality before and after the enhancement.

**Acceptance Scenarios**:

1. **Given** a deep research query spans multiple aspects that share common entities, **When** the system extracts and synthesizes results, **Then** the synthesis output connects perspectives across aspects for shared entities rather than presenting each aspect in isolation.
2. **Given** the extraction step processes search results for one aspect, **When** extraction completes, **Then** the output includes a list of key entities mentioned (names and types) alongside existing claims, statistics, and definitions.
3. **Given** all aspect extractions have completed, **When** the system prepares data for synthesis, **Then** it identifies entities appearing in 2 or more aspects and passes these cross-cutting entities to the synthesizer as context.
4. **Given** a research query where aspects share no common entities, **When** the merge step runs, **Then** it produces an empty cross-cutting entity list and synthesis proceeds as before with no degradation.

---

### User Story 2 - Smarter Gap Analysis with Structured Context (Priority: P1)

A user runs a deep research query. After Round 1 extractions, the system analyzes gaps in coverage to determine what Round 2 should search for. Today, the gap analyzer receives only a text summary of each aspect (e.g., "12 claims extracted. Key insight: Quantum computing uses qubits"), losing ~90% of the structured information. With this enhancement, the gap analyzer receives a compressed but structured summary that preserves coverage metadata: claim counts by confidence level, source authority distribution, contradiction presence, entity coverage, and identified weak areas. This enables the gap analyzer to make more targeted decisions — for example, detecting that an aspect has zero expert opinions, or that all sources are informal with no academic backing, or that a key contradiction remains unresolved.

**Why this priority**: Equal to P1 because gap analysis quality directly determines whether Round 2 searches are useful or wasted. Better gap targeting means Round 2 fills real holes instead of redundantly searching already-covered ground.

**Independent Test**: Submit an academic query in Deep Research mode. Examine the gap analysis output. Verify that identified gaps reflect actual weaknesses in the Round 1 data (e.g., missing expert opinions, no academic sources, unresolved contradictions) rather than generic suggestions.

**Acceptance Scenarios**:

1. **Given** Round 1 extractions are complete for a deep research query, **When** the system prepares data for gap analysis, **Then** it sends a compressed structured summary (~100-150 tokens per aspect) that includes: claim count by confidence level, statistic count and date range, expert opinion count, contradiction count with brief descriptions, source authority distribution, entity list, and identified weak areas.
2. **Given** an aspect extraction contains zero expert opinions and all sources are non-academic, **When** the gap analyzer processes the structured summary, **Then** it identifies the lack of authoritative sources as a gap and generates a targeted search query to find expert or academic perspectives.
3. **Given** an aspect extraction contains an unresolved contradiction, **When** the gap analyzer processes the structured summary, **Then** it identifies the contradiction as a "needs verification" gap with a search query targeting resolution.
4. **Given** the compressed summary format, **When** compared to passing full extraction data, **Then** the total token count for gap analysis input is reduced by at least 80% while preserving all coverage metadata needed for gap identification.

---

### User Story 3 - Source Authority Awareness (Priority: P2)

A user researches a scientific topic. The system retrieves results from a mix of academic papers, government reports, news articles, and blog posts. Today, all sources are treated equally — a peer-reviewed paper and an informal blog post carry the same weight in establishing "established" confidence for a claim. With this enhancement, sources from known high-authority domains (academic publishers, government sites, institutional organizations) are tagged as high-authority. This metadata flows through to the compressed gap summary and synthesis, enabling the gap analyzer to detect when a topic lacks authoritative sources and the synthesizer to give appropriate weight to source quality.

**Why this priority**: P2 because source authority adds incremental quality improvement on top of the structural improvements in US1 and US2. The system already has the `sourceType` field from academic search integration, making this a natural extension.

**Independent Test**: Submit a scientific query in Deep Research mode. Verify that sources from known academic/institutional domains are tagged as high-authority. Verify the gap analysis can detect when a topic has no high-authority sources. Verify the compressed summary includes source authority distribution.

**Acceptance Scenarios**:

1. **Given** search results include sources from known academic domains (e.g., arxiv.org, nature.com, .edu sites), **When** sources are processed, **Then** they are tagged as high-authority sources.
2. **Given** search results include a mix of high-authority and unclassified sources, **When** the compressed summary is generated, **Then** it includes a count of high-authority vs. unclassified sources per aspect.
3. **Given** an aspect has zero high-authority sources on a topic that would benefit from academic backing, **When** the gap analyzer processes the summary, **Then** it can identify the lack of authoritative sources as a potential gap.
4. **Given** a source from an unknown domain, **When** the system processes it, **Then** it remains unclassified (not tagged as low-authority) to avoid false judgments.

---

### User Story 4 - Zero Latency Guarantee (Priority: P1)

All enhancements in this feature MUST add zero perceptible latency to the deep research pipeline. The extraction step already runs in parallel — entity extraction piggybacks on the same calls. The entity merge and compressed summary generation are programmatic operations that complete in milliseconds. No new sequential steps, no new API calls, and no new infrastructure are introduced. The user experience is identical in timing but improved in output quality.

**Why this priority**: P1 because the deep research pipeline already takes 22-35 seconds. Any additional latency would degrade user experience and negate the quality gains.

**Independent Test**: Run the same deep research query 5 times before and after the enhancement. Measure end-to-end completion time. Verify the median time does not increase by more than 500ms (accounting for network variance).

**Acceptance Scenarios**:

1. **Given** a deep research query, **When** the enhanced pipeline executes, **Then** no new sequential API calls are made compared to the current pipeline.
2. **Given** the entity merge and compressed summary operations, **When** they execute, **Then** they complete in under 50ms combined.
3. **Given** the extraction step with entity output, **When** compared to the current extraction step, **Then** the additional output tokens (entity list) do not increase extraction latency by more than 200ms per aspect.
4. **Given** the full enhanced pipeline, **When** compared to the current pipeline on the same query, **Then** total end-to-end time does not increase by more than 500ms (within measurement noise).

---

### Edge Cases

- What happens when an extraction returns no entities? The merge step produces an empty cross-cutting list and synthesis proceeds unchanged.
- What happens when all aspects share the same entity? The merge step reports it as a cross-cutting entity. The synthesizer uses this to create a unified narrative around that central concept.
- What happens when the extraction LLM fails to output entities in the expected format? The system falls back to the current behavior — synthesis proceeds without entity context. Entity extraction failure is non-blocking.
- What happens when a domain is not in the authority whitelist? The source remains unclassified. The system never labels sources as "low authority" — only "high" or unclassified.
- What happens when the compressed summary is still too large for the gap analyzer? The format is fixed at ~120 tokens per aspect. With 4 aspects, total is ~500 tokens — well within any model's attention range.
- What happens when entity names are slightly different across aspects (e.g., "Tesla" vs "Tesla Inc")? The merge step uses normalized names (lowercased, common suffixes stripped). Exact fuzzy matching is out of scope — simple normalization covers the majority of cases.
- What happens with non-English entity names? Entity normalization uses case-folding only. Non-Latin scripts are preserved as-is. Cross-aspect matching still works if the same name appears identically.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST modify the extraction step to output a list of key entities (name, normalized name, type) alongside existing claims, statistics, definitions, expert opinions, and contradictions, without adding a new API call.
- **FR-002**: System MUST programmatically identify entities that appear in 2 or more aspect extractions after all Round 1 extractions complete, using normalized name matching.
- **FR-003**: System MUST pass cross-cutting entity information to the synthesizer as additional context, enabling it to connect perspectives across aspects.
- **FR-004**: System MUST replace the current gap analysis input (text summary) with a compressed structured format that preserves: claim count by confidence level, statistic count with date range, expert opinion count, contradiction count with brief descriptions, source authority distribution, entity list, and identified weak areas.
- **FR-005**: System MUST keep the compressed gap analysis input under 150 tokens per aspect to avoid context bloat and attention drift.
- **FR-006**: System MUST tag sources from a curated whitelist of known academic and institutional domains as high-authority, using the existing source metadata fields.
- **FR-007**: System MUST NOT tag sources from unknown domains as low-authority — only "high-authority" or unclassified.
- **FR-008**: System MUST include source authority distribution in the compressed gap analysis summary.
- **FR-009**: System MUST pass cross-cutting entity context and source authority signals to the gap analyzer alongside the compressed summary.
- **FR-010**: System MUST complete all new programmatic operations (entity merge, summary compression, authority tagging) in under 50ms combined.
- **FR-011**: System MUST NOT introduce any new sequential API calls or pipeline steps.
- **FR-012**: System MUST gracefully fall back to current behavior if entity extraction produces invalid output or fails.
- **FR-013**: System MUST pass cross-cutting entities and source authority context to the deep research synthesizer prompt.

### Key Entities

- **Extracted Entity**: A named thing identified by the extraction step — has a name, normalized name, and type (person, organization, technology, concept, location, event). Exists only in-memory during the research session; not persisted.
- **Cross-Cutting Entity**: An entity that appears in 2 or more aspect extractions. Carries metadata about which aspects reference it, enabling the synthesizer to connect perspectives.
- **Compressed Aspect Summary**: A structured representation of one aspect's extraction results. Contains coverage metadata (counts, distributions, weak areas) rather than individual claims. Designed to be information-dense at ~120 tokens.
- **Source Authority Tag**: A classification applied to sources from known high-authority domains. Binary: either "high-authority" (whitelisted domain) or unclassified. Never "low."

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Deep research synthesis for queries with cross-cutting concepts (e.g., a company appearing across multiple aspects) produces output that explicitly connects these concepts across sections, as judged by side-by-side comparison of 10 sample queries before and after enhancement.
- **SC-002**: Gap analysis identifies more specific, actionable gaps (e.g., "no expert opinions on this aspect" or "unresolved contradiction about X") rather than generic suggestions, as measured by evaluating gap specificity on 10 sample queries.
- **SC-003**: The enhanced pipeline adds no more than 500ms to end-to-end deep research completion time compared to the current pipeline, as measured across 10 identical query pairs.
- **SC-004**: Sources from known academic and institutional domains are correctly tagged as high-authority in 95% or more of cases, as verified against a test set of 50 source URLs.
- **SC-005**: The compressed gap analysis summary uses 80% fewer tokens than passing full extraction data while preserving all coverage metadata needed for gap identification.

## Assumptions

- The existing extraction LLM call has sufficient output token capacity to include an entity list (estimated 50-100 additional tokens) without truncation.
- Simple name normalization (lowercase, strip common suffixes like "Inc", "Corp", "Ltd") provides sufficient entity matching for the majority of cross-aspect connections. Full fuzzy matching or NLP-based entity resolution is not needed for the initial implementation.
- The gap analyzer LLM can effectively use the compressed structured format to identify gaps. If the format proves insufficient, it can be iteratively refined without architectural changes.
- A curated whitelist of 30-50 high-authority domains covers the majority of academic and institutional sources encountered in research queries.
- The deep research synthesizer prompt can be modified to accept and use cross-cutting entity context without significantly increasing its input token count.

## Scope Boundaries

### In Scope
- Entity extraction piggybacking on existing extraction LLM calls
- Programmatic cross-aspect entity merge (in-memory, per-session)
- Compressed structured gap analysis input format
- Source authority whitelist (curated list of known academic/institutional domains)
- Synthesis prompt enhancement with entity and authority context
- Gap analysis prompt enhancement with structured input

### Out of Scope
- Persistent knowledge graph storage (entities are ephemeral, per-session only)
- Multi-hop relationship traversal (only entity name matching across aspects)
- Relationship extraction between entities (only entity identification)
- Full NLP-based entity resolution or fuzzy matching
- Source authority classification for unknown domains
- Changes to the non-deep (standard) research pipeline
- Changes to web search or brainstorm modes
- UI changes to display entity information to users
