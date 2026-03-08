# Data Model: Zero-Latency Deep Research Quality Enhancement

**Date**: 2026-03-07
**Feature**: [spec.md](./spec.md)

## Entities

All entities are in-memory only (per-session). No database changes.

### ExtractedEntity

Identified by the extraction LLM from search results for one aspect.

```typescript
interface ExtractedEntity {
  name: string;           // Original name as extracted: "Tesla, Inc."
  normalizedName: string; // Normalized: "tesla"
  type: EntityType;       // Classification
}

type EntityType = 'person' | 'organization' | 'technology' | 'concept' | 'location' | 'event';
```

**Source**: Output of extraction LLM call (added to existing JSON schema).
**Lifecycle**: Created during extraction, consumed during entity merge.

### CrossCuttingEntity

An entity that appears in 2+ aspect extractions.

```typescript
interface CrossCuttingEntity {
  name: string;           // Most common original name across aspects
  normalizedName: string; // Normalized name used for matching
  type: EntityType;       // Entity type
  aspects: string[];      // List of aspect names where this entity appears
  count: number;          // Number of aspects containing this entity
}
```

**Source**: Output of `mergeEntities()` programmatic function.
**Lifecycle**: Created after all extractions complete, passed to gap analyzer and synthesizer.

### SourceAuthorityTag

Classification applied to sources from known domains.

```typescript
type SourceAuthority = 'high-authority' | 'unclassified';
```

**Source**: Output of `tagSourceAuthority()` applied to source URLs.
**Lifecycle**: Computed during extraction result processing, included in compressed summary.

### CompressedAspectSummary

Structured representation of one aspect's extraction results for gap analysis.

```typescript
interface CompressedAspectSummary {
  aspect: string;
  claimsByConfidence: {
    established: number;
    emerging: number;
    contested: number;
  };
  statisticCount: number;
  statisticDateRange: string | null;  // e.g., "2022-2025"
  expertOpinionCount: number;
  contradictionCount: number;
  contradictionBriefs: string[];      // 1-sentence summaries, max 3
  sourceAuthority: {
    highAuthority: number;
    unclassified: number;
  };
  entities: string[];                 // Normalized entity names
  weakAreas: string[];                // Identified coverage gaps, max 3
  keyInsight: string;                 // Preserved from extraction
}
```

**Source**: Output of `compressAspectSummary()` function.
**Lifecycle**: Created from `AspectExtraction` data, passed to gap analyzer.

## Modified Existing Types

### AspectExtraction (extended)

```typescript
// Existing fields preserved:
interface AspectExtraction {
  aspect: string;
  claims: ExtractedClaim[];
  statistics: ExtractedStatistic[];
  definitions: ExtractedDefinition[];
  expertOpinions: ExtractedExpertOpinion[];
  contradictions: ExtractedContradiction[];
  keyInsight: string;
  // NEW:
  entities: ExtractedEntity[];  // Added, defaults to [] for backward compatibility
}
```

## Relationships

```
AspectExtraction 1──* ExtractedEntity (extracted together in same LLM call)
ExtractedEntity *──1 CrossCuttingEntity (merged by normalizedName)
CrossCuttingEntity *──* AspectExtraction (references aspects by name)
AspectExtraction 1──1 CompressedAspectSummary (computed from extraction)
Source URL ──→ SourceAuthority (looked up via domain whitelist)
```

## Validation Rules

- `ExtractedEntity.name`: Non-empty string
- `ExtractedEntity.type`: Must be one of the defined EntityType values
- `CrossCuttingEntity.count`: Must be >= 2 (by definition)
- `CrossCuttingEntity.aspects`: Must have >= 2 entries
- `CompressedAspectSummary.contradictionBriefs`: Max 3 entries
- `CompressedAspectSummary.weakAreas`: Max 3 entries
- `CompressedAspectSummary.entities`: Max 20 entries per aspect
