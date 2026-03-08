# Internal Contracts: Zero-Latency Deep Research Quality Enhancement

No new API routes are introduced. All changes modify existing internal interfaces.

## Modified API Contracts

### POST `/api/research/extract` (Modified)

**Request**: Unchanged.

**Response** (extended):
```json
{
  "extraction": {
    "aspect": "fundamentals",
    "claims": [...],
    "statistics": [...],
    "definitions": [...],
    "expertOpinions": [...],
    "contradictions": [...],
    "keyInsight": "...",
    "entities": [
      { "name": "Tesla, Inc.", "normalizedName": "tesla", "type": "organization" },
      { "name": "Elon Musk", "normalizedName": "elon musk", "type": "person" }
    ]
  },
  "updatedSourceIndex": { "https://example.com": 1 }
}
```

**Backward Compatibility**: `entities` field defaults to `[]` if LLM doesn't produce it. Existing consumers unaffected.

### POST `/api/research/analyze-gaps` (Modified)

**Request** (extended):
```json
{
  "query": "original research topic",
  "extractedData": [...],
  "language": "English",
  "provider": "deepseek",
  "crossCuttingEntities": [
    { "name": "Tesla", "normalizedName": "tesla", "type": "organization", "aspects": ["automotive", "energy storage"], "count": 2 }
  ],
  "sourceAuthority": {
    "highAuthorityCount": 5,
    "unclassifiedCount": 12
  }
}
```

**Response**: Unchanged.

**Internal Change**: `summarizeExtractedData()` replaced by `compressAspectSummary()`. Gap analyzer prompt receives compressed structured format instead of lossy text summary.

### POST `/api/research/synthesize` (Modified)

**Request** (extended):
```json
{
  "query": "original research topic",
  "extractedData": [...],
  "stream": true,
  "provider": "deepseek",
  "deep": true,
  "gapDescriptions": [...],
  "crossCuttingEntities": [
    { "name": "Tesla", "normalizedName": "tesla", "type": "organization", "aspects": ["automotive", "energy storage"], "count": 2 }
  ]
}
```

**Response**: Unchanged (SSE stream or JSON).

**Internal Change**: Synthesis prompt includes `<crossCuttingEntities>` XML section when entities are provided.

## New Internal Functions

### `mergeEntities(extractions: AspectExtraction[]): CrossCuttingEntity[]`

**Module**: `src/lib/entity-merge.ts`
**Performance**: < 20ms for 4 aspects with 10-15 entities each
**Behavior**: Groups entities by normalizedName, returns those appearing in 2+ aspects.

### `normalizeEntityName(name: string): string`

**Module**: `src/lib/entity-merge.ts`
**Behavior**: Lowercase, strip suffixes (Inc, Corp, Ltd, etc.), trim whitespace.

### `compressAspectSummary(extraction: AspectExtraction, sources: Source[]): CompressedAspectSummary`

**Module**: `src/lib/compressed-summary.ts`
**Performance**: < 5ms per aspect
**Behavior**: Converts full extraction to ~120 token structured summary.

### `formatCompressedSummaries(summaries: CompressedAspectSummary[]): string`

**Module**: `src/lib/compressed-summary.ts`
**Behavior**: Formats compressed summaries as text for gap analyzer prompt.

### `tagSourceAuthority(url: string): SourceAuthority`

**Module**: `src/lib/source-authority.ts`
**Performance**: < 1ms (Set lookup)
**Behavior**: Checks URL domain against whitelist. Returns 'high-authority' or 'unclassified'.

### `AUTHORITY_DOMAINS: Set<string>`

**Module**: `src/lib/source-authority.ts`
**Behavior**: Curated set of ~40-50 known academic/institutional domains.
