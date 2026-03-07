# Research: Academic Paper Search Integration

**Feature**: 001-academic-paper-search
**Date**: 2026-03-07

## R1: OpenAlex API Integration Pattern

**Decision**: Use OpenAlex REST API with `search` parameter for full-text search across titles, abstracts, and fulltext. Use `select` parameter to limit response fields. Sort by `relevance_score` (default) with `cited_by_count` as tiebreaker.

**Rationale**:
- JSON response format integrates directly with existing TypeScript pipeline
- Free API key from openalex.org/settings/api (no institutional requirement)
- 10 req/s rate limit is generous for 3-4 parallel aspect searches
- `select` parameter reduces payload size (only fetch needed fields)
- Boolean search support (AND, OR, NOT) enables precise academic queries
- Pagination via `per_page` (max 100) — we only need 5 results per aspect

**Alternatives Considered**:
- Semantic Scholar: Requires institutional affiliation for API key. Rejected.
- CrossRef: Metadata-only, no abstracts. Insufficient for extraction pipeline.
- PubMed: Medical domain only. Too narrow for general academic queries.

**API Details**:
- Base URL: `https://api.openalex.org`
- Search endpoint: `GET /works?search={query}&select=id,title,abstract_inverted_index,authorships,cited_by_count,publication_date,doi,primary_location,topics&per_page=5&sort=relevance_score:desc`
- Authentication: API key as query param `&api_key={key}` or email as `&mailto={email}` for polite pool
- Response: JSON with `meta`, `results` array
- Abstract field: `abstract_inverted_index` (inverted index format, needs reconstruction to plain text)
- Rate limit: 10 req/s with API key, shared pool without

## R2: arXiv API Integration Pattern

**Decision**: Use arXiv Atom API for preprint search. Parse XML response with built-in DOMParser or a lightweight XML parser. Limit to 3 results per aspect due to rate constraints.

**Rationale**:
- Free, no authentication required
- Good for cutting-edge/preprint content not yet in OpenAlex
- XML parsing is straightforward (well-defined Atom schema)
- 1 req/3s rate limit means we should batch aspect queries or limit calls

**Alternatives Considered**:
- arXiv bulk data access: Overkill, requires S3 setup. Rejected.
- Papers with Code API: Narrower scope (ML/AI only). Could supplement later.

**API Details**:
- Base URL: `http://export.arxiv.org/api/query`
- Search: `GET ?search_query=all:{query}&max_results=3&sortBy=relevance&sortOrder=descending`
- Field prefixes: `ti:` (title), `au:` (author), `abs:` (abstract), `cat:` (category)
- Boolean operators: AND, OR, ANDNOT
- Response: Atom 1.0 XML with `entry` elements containing title, summary (abstract), authors, links, categories
- Rate limit: 1 request per 3 seconds (must stagger calls)
- No pagination needed at 3 results per aspect

## R3: Parallel Dispatch Strategy

**Decision**: Dispatch OpenAlex searches in parallel with Tavily searches (same timing). Dispatch arXiv searches with a 3-second stagger between aspects. Use `Promise.allSettled` to handle partial failures gracefully.

**Rationale**:
- OpenAlex at 10 req/s can handle 3-4 aspect searches simultaneously
- arXiv at 1 req/3s cannot be parallelized — but 3-4 sequential calls (9-12s) is within the 30s pipeline window
- `Promise.allSettled` ensures Tavily results are always available even if academic APIs fail
- Academic searches happen at the same time as Tavily, so total latency increase is minimal (arXiv sequential calls add ~9-12s but run in parallel with Tavily)

**Alternatives Considered**:
- Only dispatch 1 arXiv call (for primary aspect): Misses cross-aspect preprints. Rejected.
- Skip arXiv entirely: Loses cutting-edge preprint coverage. Rejected.
- Dispatch all arXiv in parallel (ignoring rate limit): Risks IP ban. Rejected.

**Revised Decision**: Given arXiv's rate limit, dispatch only 1 arXiv call using the primary research query (not per-aspect) to stay within rate limits while still getting preprint coverage. This keeps latency low and avoids sequential delays. OpenAlex handles per-aspect academic searches (3-4 parallel calls).

## R4: Result Conversion to TavilySearchResult Format

**Decision**: Create converter functions in `academic-search.ts` that transform OpenAlex JSON and arXiv XML into `TavilySearchResult` format. Map fields as follows:

| Standard Field | OpenAlex Source | arXiv Source |
|---------------|-----------------|--------------|
| `title` | `display_name` or `title` | `<title>` |
| `url` | `primary_location.landing_page_url` or DOI URL | `<id>` (arXiv abstract URL) |
| `content` | Reconstructed abstract from `abstract_inverted_index` | `<summary>` |
| `published_date` | `publication_date` | `<published>` |
| `author` | First author from `authorships[0].author.display_name` | `<author><name>` |

**Rationale**: Converting to TavilySearchResult format means zero changes to the extraction, synthesis, and caching pipeline. The only new code is in the search layer.

## R5: OpenAlex Abstract Reconstruction

**Decision**: OpenAlex stores abstracts as inverted indices (`{ "word": [position1, position2], ... }`). Reconstruct to plain text by sorting words by position.

**Rationale**: This is the only way to get abstract text from OpenAlex. The reconstruction is a simple algorithm: iterate the inverted index, collect `(word, position)` pairs, sort by position, join with spaces.

**Implementation Note**: If `abstract_inverted_index` is null (some papers lack abstracts), fall back to using only the title as content. The extraction prompt can still work with title-only content (will extract fewer claims).

## R6: Source Type Extension

**Decision**: Add optional fields to the Source interface: `sourceType`, `doi`, `citedByCount`, `journalName`, `publicationYear`. These are set during the conversion step and used by the UI for display.

**Rationale**: Minimal type extension. All new fields are optional so existing code is unaffected. The UI can conditionally render academic metadata when these fields are present.

## R7: Caching Strategy

**Decision**: Academic results are merged into the standard search response before caching. Cache key remains based on query hash — academic results are included in the cached data. No separate academic cache.

**Rationale**: Keeps the caching layer unchanged. A cached research result for an academic query already includes academic sources. The only consideration is that disabling academic search later would invalidate caches, but this is acceptable given the 48-hour TTL.

## R8: Credit Impact

**Decision**: No credit impact. Academic API calls are free. The credit system only counts Tavily queries. Academic searches run in parallel and don't affect the `tavilyQueryCount` used for billing.

**Rationale**: OpenAlex and arXiv are free APIs. The credit reserve/finalize flow counts actual Tavily queries only. Adding academic sources provides more value without additional cost to users.
