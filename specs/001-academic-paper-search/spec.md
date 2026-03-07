# Feature Specification: Academic Paper Search Integration

**Feature Branch**: `001-academic-paper-search`
**Created**: 2026-03-07
**Status**: Draft
**Input**: User description: "Add OpenAlex and arXiv APIs as academic paper search sources alongside Tavily web search in the research pipeline."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Academic Query Gets Paper Sources (Priority: P1)

A user searches for an academic or technical topic (e.g., "quantum error correction techniques") using Research mode. The system detects the query type as academic/technical/explanatory and automatically dispatches searches to OpenAlex and arXiv in parallel with the standard Tavily web search. The combined results include peer-reviewed papers alongside web articles, giving the user authoritative sources with citation counts, DOIs, and journal names displayed in the sources panel.

**Why this priority**: This is the core feature. Without academic source integration, the pipeline continues returning only web results for scholarly queries, which is the primary limitation being addressed.

**Independent Test**: Can be fully tested by submitting an academic query in Research mode and verifying that sources include papers from OpenAlex/arXiv with academic metadata (DOI, citation count, journal name) alongside web results.

**Acceptance Scenarios**:

1. **Given** a user submits "quantum error correction techniques" in Research mode, **When** the query router classifies it as `academic` or `technical`, **Then** the system dispatches searches to OpenAlex and arXiv in parallel with Tavily, and the final results include academic paper sources with citation counts and DOIs.
2. **Given** a user submits "best hiking camera bag" in Research mode, **When** the query router classifies it as `shopping`, **Then** the system does NOT dispatch academic searches and only uses Tavily web search.
3. **Given** OpenAlex returns papers for a technical query, **When** results are merged with Tavily results, **Then** papers are deduplicated by URL and assigned global citation indices alongside web sources.

---

### User Story 2 - Academic Papers Flow Through Extraction and Synthesis (Priority: P1)

Academic paper results (title, abstract, content) are converted to the standard search result format and flow through the existing extraction and synthesis pipeline unchanged. The synthesized research document includes citations to academic papers using the same `[1]`, `[2]` format, and paper-sourced claims carry appropriate confidence levels based on citation authority.

**Why this priority**: Equal to P1 because papers must be usable by the pipeline to deliver value. Retrieving papers without extracting and synthesizing them provides no user benefit.

**Independent Test**: Can be tested by verifying that a research synthesis for an academic query includes citations referencing paper sources, and that extracted claims from papers appear in the final output.

**Acceptance Scenarios**:

1. **Given** academic papers are included in search results, **When** the extraction step processes them, **Then** claims, statistics, definitions, and expert opinions are extracted from paper abstracts and content using the standard extraction schema.
2. **Given** extracted data includes both paper and web sources, **When** synthesis produces the final document, **Then** citations reference both paper and web sources using the same numbering system, and the output is a coherent research document.

---

### User Story 3 - Academic Source Metadata in UI (Priority: P2)

Users can distinguish academic papers from web sources in the sources panel. Papers display relevant metadata: publication year, journal/conference name, citation count, and DOI link. This helps users evaluate source authority at a glance.

**Why this priority**: Enhances user experience but is not required for the core pipeline to function. Papers can flow through the pipeline and be cited without special UI treatment.

**Independent Test**: Can be tested by checking that paper sources in the sources panel show academic metadata fields (journal name, citation count, DOI) that are not present on web sources.

**Acceptance Scenarios**:

1. **Given** search results include academic paper sources, **When** the sources panel renders, **Then** papers display publication year, journal name, citation count, and a DOI link when available.
2. **Given** a source is from the web (not a paper), **When** the sources panel renders, **Then** the source displays standard web metadata (domain, author, time ago) without academic-specific fields.

---

### User Story 4 - Graceful Degradation When Academic APIs Are Unavailable (Priority: P2)

If OpenAlex or arXiv APIs are unreachable or return errors, the research pipeline continues with Tavily web search results only. The user is not blocked, and there is no visible error -- the system simply proceeds without academic sources.

**Why this priority**: Important for reliability but the APIs being down should be rare. The system must not break when external academic APIs fail.

**Independent Test**: Can be tested by simulating API failures (timeout, 5xx) and verifying that the research pipeline completes successfully with web-only results.

**Acceptance Scenarios**:

1. **Given** OpenAlex API returns a 500 error, **When** the research pipeline processes results, **Then** it proceeds with Tavily results only and the user receives a complete research document without error messages.
2. **Given** arXiv API times out, **When** the research pipeline processes results, **Then** it proceeds with available results (OpenAlex + Tavily or Tavily only) without delay beyond the timeout threshold.
3. **Given** both academic APIs are down, **When** the user submits an academic query, **Then** the experience is identical to the current system (web-only research) with no degradation.

---

### Edge Cases

- What happens when OpenAlex and Tavily return the same paper URL? The system deduplicates by URL, keeping one source entry.
- What happens when arXiv returns XML that fails to parse? The system logs the error and proceeds without arXiv results.
- What happens when a query is classified as `academic` but no papers exist on the topic? The synthesis works with web-only results as it does today.
- What happens when OpenAlex returns papers with no abstract? The paper is still included with title and available metadata; the extraction step works with whatever content is available.
- How does caching work for academic results? Academic results are cached alongside web results in the existing two-tier cache. Cache keys include a hash of the query, so the same query returns cached academic + web results.
- What happens when an academic query returns hundreds of papers? The system limits results per source (e.g., top 5 papers per aspect from OpenAlex, top 3 from arXiv) to keep the pipeline manageable.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST detect query types eligible for academic search (`academic`, `technical`, `explanatory`) using the existing query router classification.
- **FR-002**: System MUST search OpenAlex API for relevant papers when the query type is eligible, using the query's research aspect as the search term.
- **FR-003**: System MUST search arXiv API for relevant preprints when the query type is eligible, using the query's research aspect as the search term.
- **FR-004**: System MUST dispatch academic searches in parallel with Tavily web searches to avoid adding latency to the pipeline.
- **FR-005**: System MUST convert OpenAlex and arXiv results into the standard search result format used by the extraction and synthesis pipeline.
- **FR-006**: System MUST deduplicate sources by URL across all search providers (Tavily, OpenAlex, arXiv).
- **FR-007**: System MUST assign global citation indices to academic sources alongside web sources for consistent `[1]`, `[2]` referencing.
- **FR-008**: System MUST NOT dispatch academic searches for non-eligible query types (`shopping`, `travel`, `finance`, `general`).
- **FR-009**: System MUST handle OpenAlex and arXiv API failures gracefully, proceeding with available results without user-facing errors.
- **FR-010**: System MUST extend source metadata to include academic-specific fields: source type (academic/web), DOI, citation count, journal/conference name, and publication year.
- **FR-011**: System MUST limit academic results to a reasonable number per aspect (e.g., 5 from OpenAlex, 3 from arXiv) to keep extraction manageable.
- **FR-012**: System MUST NOT consume user credits for academic API calls, as both OpenAlex and arXiv APIs are free.
- **FR-013**: System MUST cache academic search results alongside web results using the existing caching system.
- **FR-014**: System MUST sort OpenAlex results by relevance and citation count to surface the most authoritative papers.

### Key Entities

- **Academic Source**: A paper or preprint retrieved from OpenAlex or arXiv. Key attributes: title, authors, abstract, DOI, publication year, citation count, journal/conference name, open access URL, source provider (openalex/arxiv).
- **Source Type**: A classification distinguishing academic papers from web articles. Used for UI display and potential future filtering.
- **Query Type Classification**: The existing router output (`academic`, `technical`, `explanatory`, `shopping`, etc.) that determines whether academic searches are dispatched.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Research queries classified as academic/technical/explanatory return at least 3 academic paper sources in 90% of cases (when papers exist on the topic).
- **SC-002**: Adding academic search sources does not increase total research pipeline latency by more than 500ms (academic searches run in parallel with web searches).
- **SC-003**: Academic papers appear in synthesized research documents with proper citations in 95% of eligible queries.
- **SC-004**: The system completes research successfully 100% of the time regardless of academic API availability (graceful degradation).
- **SC-005**: Users can identify academic sources in the results panel by seeing metadata not present on web sources (DOI, citation count, journal name).

## Assumptions

- OpenAlex API remains free and available without institutional credentials. Current access: free API key from openalex.org/settings/api, 10 req/s rate limit.
- arXiv API remains free and publicly accessible. Current rate limit: 1 request per 3 seconds.
- The existing query router accurately classifies academic/technical/explanatory queries. No changes to the router's classification logic are needed.
- Academic paper abstracts provide sufficient content for the existing extraction prompt to extract meaningful claims, statistics, and definitions.
- The existing source deduplication by URL is sufficient for cross-provider deduplication (OpenAlex and Tavily are unlikely to return the same URL for the same content).

## Scope Boundaries

### In Scope
- OpenAlex API integration for searching published papers
- arXiv API integration for searching preprints
- Query-type-aware routing (academic searches only for eligible query types)
- Converting academic results to standard pipeline format
- Academic metadata display in the sources panel
- Graceful degradation on API failure
- Caching of academic results

### Out of Scope
- Full-text PDF extraction from papers (only abstracts and available content are used)
- Citation network traversal (finding papers that cite a given paper)
- Knowledge graph or Graph-RAG construction from academic sources
- User-configurable academic search preferences (toggle on/off, preferred sources)
- Semantic Scholar integration (requires institutional credentials)
- Changes to the query router classification logic
- Changes to the extraction or synthesis prompts
