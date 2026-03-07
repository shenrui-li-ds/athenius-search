# Data Model: Academic Paper Search Integration

**Feature**: 001-academic-paper-search
**Date**: 2026-03-07

## Entity Extensions

### Source (Extended)

The existing `Source` interface is extended with optional academic metadata fields.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique source identifier (existing) |
| `title` | string | Yes | Source title (existing) |
| `url` | string | Yes | Source URL (existing) |
| `iconUrl` | string | Yes | Favicon URL (existing) |
| `author` | string | No | Author name (existing) |
| `timeAgo` | string | No | Relative time since publication (existing) |
| `readTime` | string | No | Estimated read time (existing) |
| `snippet` | string | No | Content snippet (existing) |
| `sourceType` | `'web' \| 'academic'` | No | Source classification. Default: `'web'` |
| `doi` | string | No | Digital Object Identifier. Only for academic sources. |
| `citedByCount` | number | No | Citation count from OpenAlex. Only for academic sources. |
| `journalName` | string | No | Journal or conference name. Only for academic sources. |
| `publicationYear` | number | No | Year of publication. Only for academic sources. |

**Relationships**: Sources belong to search results. Sources are referenced by citation index in extractions and synthesis.

**Validation**: No new validation rules. All new fields are optional and informational.

### OpenAlex Work (API Response - External)

Represents a single work from the OpenAlex API response. Not stored locally — converted to Source format.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | OpenAlex work ID (e.g., `W1234567890`) |
| `display_name` | string | Paper title |
| `abstract_inverted_index` | `Record<string, number[]>` or null | Inverted index for abstract reconstruction |
| `authorships` | array | Author list with affiliations |
| `cited_by_count` | number | Total citation count |
| `publication_date` | string | ISO date string |
| `doi` | string or null | DOI URL |
| `primary_location` | object | Primary publication venue with landing page URL |
| `topics` | array | Topic classifications |

### arXiv Entry (API Response - External)

Represents a single entry from the arXiv Atom XML response. Not stored locally — converted to Source format.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | arXiv ID URL (e.g., `http://arxiv.org/abs/2401.12345v1`) |
| `title` | string | Paper title |
| `summary` | string | Abstract text |
| `author` | array | Author names |
| `published` | string | ISO date string |
| `category` | array | arXiv categories (e.g., `cs.AI`, `quant-ph`) |
| `link` | array | Links to abstract and PDF |

## Data Flow

```
OpenAlex API Response (JSON)
    → convertOpenAlexToResults()
    → TavilySearchResult format + Source[] with academic metadata
    → Merged with Tavily results
    → Standard pipeline (extract → synthesize)

arXiv API Response (XML)
    → parseArxivResponse()
    → convertArxivToResults()
    → TavilySearchResult format + Source[] with academic metadata
    → Merged with Tavily results
    → Standard pipeline (extract → synthesize)
```

## No Database Changes

This feature does not require any database schema changes. Academic results are:
- Transient (fetched per request, not persisted separately)
- Cached via the existing `search_cache` table alongside web results
- Referenced via the existing global source index (URL-based)

The `Source` type extension is a TypeScript-only change that adds optional fields to the client-side interface.
