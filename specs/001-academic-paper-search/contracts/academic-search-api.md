# API Contracts: Academic Paper Search

**Feature**: 001-academic-paper-search
**Date**: 2026-03-07

## Internal Module: `academic-search.ts`

This is not a new API route — it's a utility module used internally by the search pipeline. No new HTTP endpoints are exposed.

### Function: `searchOpenAlex`

**Purpose**: Search OpenAlex for academic papers matching a query.

**Input**:
```typescript
{
  query: string;          // Search query text
  maxResults?: number;    // Max papers to return (default: 5)
  sortBy?: string;        // Sort field (default: 'relevance_score:desc')
}
```

**Output**:
```typescript
{
  results: TavilySearchResult;  // Converted to standard format
  sources: Source[];             // With academic metadata populated
}
```

**Error Handling**: Returns empty results on any failure (timeout, parse error, API error). Logs warning but does not throw.

---

### Function: `searchArxiv`

**Purpose**: Search arXiv for preprints matching a query.

**Input**:
```typescript
{
  query: string;          // Search query text
  maxResults?: number;    // Max papers to return (default: 3)
}
```

**Output**:
```typescript
{
  results: TavilySearchResult;  // Converted to standard format
  sources: Source[];             // With academic metadata populated
}
```

**Error Handling**: Returns empty results on any failure (timeout, XML parse error, API error). Logs warning but does not throw.

---

### Function: `searchAcademicSources`

**Purpose**: Orchestrate both OpenAlex and arXiv searches for a single aspect query. This is the main entry point called from the search pipeline.

**Input**:
```typescript
{
  query: string;          // Aspect search query
  includeArxiv?: boolean; // Whether to include arXiv (default: true, but only for primary query)
}
```

**Output**:
```typescript
{
  results: TavilySearchResult;  // Combined academic results in standard format
  sources: Source[];             // Combined sources with academic metadata
}
```

**Error Handling**: Returns empty results if all academic APIs fail. Never blocks the pipeline.

---

### Function: `shouldSearchAcademic`

**Purpose**: Determine whether a query type should trigger academic searches.

**Input**:
```typescript
{
  queryType: QueryType;   // From research router classification
}
```

**Output**: `boolean`

**Logic**:
- Returns `true` for: `academic`, `technical`, `explanatory`
- Returns `false` for: `shopping`, `travel`, `finance`, `general`

---

### Function: `reconstructAbstract`

**Purpose**: Convert OpenAlex inverted index abstract to plain text.

**Input**: `Record<string, number[]> | null` (OpenAlex `abstract_inverted_index`)

**Output**: `string` (reconstructed abstract text, or empty string if null)

---

## Modified Endpoint: `/api/search`

The route's response shape is unchanged. Academic results are merged into the response server-side before caching, keeping API keys server-side and inheriting existing cache behavior.

**New Optional Request Body Fields** (passed from search-client):
```typescript
{
  // Existing fields...
  query: string;
  searchDepth: string;
  maxResults: number;
  // New optional fields
  queryType?: QueryType;      // If academic-eligible, triggers academic search
  primaryAspect?: boolean;    // If true, include arXiv search (only for first aspect)
}
```

**Behavior**: When `queryType` is present and `shouldSearchAcademic(queryType)` returns true, the route calls `searchAcademicSources(query, primaryAspect)` in parallel with the Tavily search. Academic results are merged into `rawResults.results` and `sources` before the response is cached and returned.

## External API Contracts (Third-Party)

### OpenAlex Works Search

**Endpoint**: `GET https://api.openalex.org/works`

**Query Parameters**:
| Parameter | Value | Description |
|-----------|-------|-------------|
| `search` | `{query}` | Full-text search across titles, abstracts, fulltext |
| `select` | `id,display_name,abstract_inverted_index,authorships,cited_by_count,publication_date,doi,primary_location,topics` | Limit response fields |
| `per_page` | `5` | Results per request |
| `sort` | `relevance_score:desc` | Sort by relevance |
| `mailto` | `{email}` | Polite pool access (higher rate limits) |

**Response Shape** (relevant fields):
```json
{
  "meta": { "count": 1234, "per_page": 5, "page": 1 },
  "results": [
    {
      "id": "https://openalex.org/W1234567890",
      "display_name": "Paper Title",
      "abstract_inverted_index": { "word1": [0, 5], "word2": [1] },
      "authorships": [{ "author": { "display_name": "Author Name" } }],
      "cited_by_count": 150,
      "publication_date": "2024-03-15",
      "doi": "https://doi.org/10.1234/example",
      "primary_location": {
        "landing_page_url": "https://journal.example.com/paper",
        "source": { "display_name": "Journal Name" }
      },
      "topics": [{ "display_name": "Machine Learning" }]
    }
  ]
}
```

### arXiv Search

**Endpoint**: `GET http://export.arxiv.org/api/query`

**Query Parameters**:
| Parameter | Value | Description |
|-----------|-------|-------------|
| `search_query` | `all:{query}` | Search all fields |
| `max_results` | `3` | Results per request |
| `sortBy` | `relevance` | Sort by relevance |
| `sortOrder` | `descending` | Most relevant first |

**Response Shape** (Atom XML):
```xml
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2401.12345v1</id>
    <title>Paper Title</title>
    <summary>Abstract text...</summary>
    <author><name>Author Name</name></author>
    <published>2024-01-15T00:00:00Z</published>
    <link href="http://arxiv.org/abs/2401.12345v1" rel="alternate"/>
    <link href="http://arxiv.org/pdf/2401.12345v1" rel="related" title="pdf"/>
    <arxiv:primary_category term="cs.AI"/>
  </entry>
</feed>
```
