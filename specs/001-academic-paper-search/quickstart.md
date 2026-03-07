# Quickstart: Academic Paper Search Integration

**Feature**: 001-academic-paper-search
**Date**: 2026-03-07

## Overview

This feature adds OpenAlex and arXiv as academic paper search sources to the research pipeline. When a user's query is classified as academic, technical, or explanatory, the system searches for relevant papers in parallel with web search and includes them in the research synthesis.

## Prerequisites

- Existing Athenius Search development environment (see main README)
- `npm install` completed in `deep-search/`
- Dev server running: `npm run dev`

## Optional Configuration

Add to `deep-search/.env.local`:

```bash
# Optional: OpenAlex API key for higher rate limits (10 req/s vs shared pool)
# Get free key at: https://openalex.org/settings/api
OPENALEX_API_KEY=your_key_here

# Optional: Email for OpenAlex polite pool (if no API key)
OPENALEX_MAILTO=your_email@example.com
```

No configuration is needed for arXiv (fully public, no key required).

## How It Works

1. User submits a Research mode query
2. Query router classifies the query type (e.g., `academic`, `technical`, `shopping`)
3. If eligible (`academic`, `technical`, or `explanatory`):
   - OpenAlex searches run in parallel with Tavily (one per research aspect, 5 results each)
   - One arXiv search runs for the primary query (3 results)
4. Academic results are converted to standard format and merged with web results
5. Combined results flow through extraction and synthesis unchanged
6. Sources panel shows academic metadata (DOI, citations, journal) for paper sources

## Testing

```bash
# Run the dev server
cd deep-search && npm run dev

# Test academic query: Submit "quantum error correction" in Research mode
# Expected: Sources panel shows papers from OpenAlex/arXiv alongside web results

# Test non-academic query: Submit "best hiking camera bag" in Research mode
# Expected: No academic sources, web-only results (same as before)

# Test graceful degradation: Temporarily set invalid OPENALEX_API_KEY
# Expected: Research completes with web-only results, no errors shown
```

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/academic-search.ts` | New: OpenAlex + arXiv API clients, result conversion |
| `src/lib/types.ts` | Modified: Source type extended with academic fields |
| `src/app/search/search-client.tsx` | Modified: Dispatches academic searches for eligible queries |
| `src/components/SearchResult.tsx` | Modified: Renders academic metadata in sources panel |
| `src/lib/CLAUDE.md` | Modified: Documents academic search integration |

## Architecture

```
Research Pipeline (for eligible query types)
    |
    v
/api/research/plan → queryType + aspects
    |
    v
[Parallel]
├── Tavily search x 3-4 (existing)
├── OpenAlex search x 3-4 (new, parallel with Tavily)
└── arXiv search x 1 (new, primary query only)
    |
    v
Merge + Deduplicate by URL
    |
    v
Standard pipeline (extract → synthesize) [unchanged]
```
