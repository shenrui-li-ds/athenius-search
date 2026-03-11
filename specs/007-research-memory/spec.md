# Feature Specification: Research Memory

**Feature Branch**: `007-research-memory`
**Created**: 2026-03-11
**Status**: Draft
**Input**: Brainstorm analysis of long-term memory for agentic research pipeline
**Depends on**: 005-adversarial-prompts (merged), 006-prompt-injection-defense (merged)

## Overview

Add cross-session research memory to the Research and Deep Research pipelines. When a user researches a topic, the system stores a compressed summary of findings, entities, filled gaps, and open questions. When they later research a related topic, the system retrieves relevant prior research and injects it as context — enabling the pipeline to build on previous work instead of starting from scratch.

**User benefit**: Returning users get deeper, less redundant research. The gap analyzer avoids re-investigating topics already covered. The planner generates complementary angles instead of repeating prior ones. The synthesizer can reference prior findings and highlight what's genuinely new. Deep research sessions that previously cost 7 credits for redundant ground can focus credits on truly unknown territory.

**Current state**: Every research session starts from zero. A user who deeply researched "intermittent fasting health effects" last week gets no benefit when searching "intermittent fasting for athletes" today — the pipeline re-covers fundamentals, re-identifies the same gaps, and re-extracts the same claims. Thread context (004) provides within-session memory for Web mode follow-ups, but nothing persists cross-session or cross-thread for Research mode.

**Target state**: The pipeline consults prior research before planning, gap analysis, and synthesis. Memories carry age metadata and explicit staleness caveats so the LLM treats them as potentially outdated context, not ground truth. Users can opt out and delete their research memory from Account settings.

## Scope

**In scope**:
- Research memory storage and retrieval for Research and Deep Research modes
- Gap analysis memory (avoid re-investigating filled gaps)
- Research continuity (inject prior findings into planning and synthesis)
- User expertise profiling (adjust synthesis depth based on domain familiarity)
- Staleness management (TTL, age caveats, active invalidation)
- User controls (opt-in preference, clear memory)

**Out of scope**:
- Web search mode memory — one-off queries, low return-visit rate, thread context already handles follow-ups
- Brainstorm mode memory — creative ideation benefits from novelty, not accumulated knowledge; memory would reduce surprise
- Embedding-based retrieval (pgvector) — pg_trgm trigram similarity is sufficient for matching a user's own prior queries; upgrade to embeddings if retrieval precision proves insufficient
- System-level source quality learning — requires significant query volume across users to produce meaningful signals; future feature
- Cross-language memory matching — a query in Chinese won't match prior English research on the same topic; acceptable limitation for now
- User opinion/preference storage — risks confirmation bias, contradicts adversarial evidence analysis principles (005)

## Memory Types

### Research Memory (per session)

Stored after each Research or Deep Research session completes. Contains:

| Field | Source | Purpose |
|-------|--------|---------|
| `research_summary` | LLM compression of synthesis (~150 words) | Injected into planner and synthesizer prompts |
| `entities` | Cross-cutting entities from entity-merge.ts | Entity resolution in future sessions |
| `filled_gaps` | Gaps addressed in Round 2 (Deep Research only) | Prevent gap analyzer from re-investigating |
| `open_gaps` | Gaps identified but not filled | Seed future gap analysis with known unknowns |
| `resolved_contradictions` | Contradictions resolved during synthesis | Inform future synthesis about settled debates |
| `key_claims` | Top claims with confidence levels | Detect when new research contradicts stored findings |

### User Expertise (aggregated)

Incremented after each research session. Tracks domain familiarity:

| Field | Purpose |
|-------|---------|
| `domain` | Query type from research router (finance, academic, technical, etc.) |
| `query_count` | Number of research sessions in this domain |
| `last_searched_at` | Recency of domain activity |

## Staleness Strategy

**Core principle**: Stale memory presented with false confidence is worse than no memory. Every design decision prioritizes freshness signals over memory utilization.

### Time-Based Expiration

| Memory Type | TTL | Rationale |
|-------------|-----|-----------|
| Deep Research memory | 30 days | Multi-round research with gap filling; high-quality, worth preserving longer |
| Standard Research memory | 14 days | Single-round; less comprehensive, stales faster |
| User expertise | 90 days with decay | Slow to change; decays if user stops searching a domain |

### Prompt-Level Age Caveats

Every memory injection includes explicit age and a staleness caveat:

```xml
<priorResearch age="12 days" mode="deep">
    <caveat>This summary is from a previous research session and may be outdated. Verify key claims against current sources before relying on them. Prefer current search results over stored findings when they conflict.</caveat>
    <summary>Prior research found that intermittent fasting shows mixed evidence for muscle retention...</summary>
</priorResearch>
```

The LLM receives the age in days and an instruction to prefer current results over stored findings. This prevents the system from confidently asserting stale facts.

### Active Invalidation

When a user researches the same or highly similar topic again:
1. The new session's memory **replaces** the old one (upsert by topic similarity)
2. This ensures the freshest research is always stored
3. No duplicate memories accumulate for the same topic

### Conflict Detection

When the current synthesis contradicts a stored key claim:
- The synthesizer prompt includes both the stored claim and the new conflicting evidence
- The LLM is instructed to explicitly note the update: "Previous research suggested X, but current sources indicate Y"
- The stored memory is replaced after synthesis completes

### Automatic Cleanup

A Supabase cron job runs daily to delete expired memories:
```sql
DELETE FROM research_memory WHERE expires_at < now();
```

## Retrieval Mechanism

### Topic Matching via pg_trgm

PostgreSQL's `pg_trgm` extension provides trigram-based fuzzy text matching. This handles the primary use case: a user's own prior queries on similar topics use similar vocabulary.

```sql
SELECT *,
    similarity(topic_query, $2) AS topic_sim,
    1 - (EXTRACT(EPOCH FROM (now() - created_at))
       / EXTRACT(EPOCH FROM (expires_at - created_at))) AS freshness
FROM research_memory
WHERE user_id = $1
    AND expires_at > now()
    AND similarity(topic_query, $2) > 0.2
ORDER BY (similarity(topic_query, $2) * 0.7 + freshness * 0.3) DESC
LIMIT 3;
```

Ranking uses a weighted combination: 70% topic similarity + 30% freshness. This ensures newer memories get a boost over older but slightly more similar ones.

**Limitations**: Character-level similarity may miss semantic matches ("AI regulation" vs. "machine learning policy"). Acceptable for Phase 1 — most users reuse similar vocabulary for related queries. Upgrade to pgvector embeddings if retrieval precision proves insufficient.

### Retrieval Timing in Pipeline

Memory retrieval runs in parallel with the first pipeline step to avoid adding latency:

```
Research Mode:
  Query → [Memory Retrieval + Plan + Limit Check] (parallel)
           → Search → Extract → [Gap Analysis with memory] → Synthesize → [Memory Store]

Deep Research Mode:
  Query → [Memory Retrieval + Plan + Limit Check] (parallel)
           → Search → Extract → [Gap Analysis with memory]
           → Round 2 Search → Extract → [Synthesis with memory] → [Memory Store]
```

Memory storage runs fire-and-forget after synthesis (same pattern as credit finalization).

## Privacy & User Control

**Constitution Principle VII alignment**: Research memory is personal data that must be user-controlled. The system stores what topics a user researched and what they found — this is sensitive.

### Controls

| Control | Location | Default |
|---------|----------|---------|
| Enable/disable research memory | Account > Preferences | **Off** (opt-in) |
| Clear all research memory | Account > Preferences | Button, requires confirmation |
| Delete individual memory | Account > Usage (future) | Not in Phase 1 |

### Data Protection

- Row Level Security (RLS) on both tables — users can only access their own memories
- Memory is deleted when user account is deleted (CASCADE)
- No memory data is shared across users or used for system-level learning
- Memory content is never exposed in API responses to the frontend (only used server-side in prompts)

## Changes

### Change 1: Database Schema — `research_memory` Table

```sql
CREATE TABLE research_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    topic_query TEXT NOT NULL,
    research_summary TEXT NOT NULL,
    entities JSONB DEFAULT '[]',
    filled_gaps JSONB DEFAULT '[]',
    open_gaps JSONB DEFAULT '[]',
    resolved_contradictions JSONB DEFAULT '[]',
    key_claims JSONB DEFAULT '[]',
    search_mode TEXT NOT NULL CHECK (search_mode IN ('research', 'deep')),
    source_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);

-- Enable pg_trgm for fuzzy topic matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_research_memory_user ON research_memory(user_id);
CREATE INDEX idx_research_memory_topic ON research_memory USING gin (topic_query gin_trgm_ops);
CREATE INDEX idx_research_memory_expires ON research_memory(expires_at);

-- RLS: users can only access their own memories
ALTER TABLE research_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY research_memory_user_policy ON research_memory
    FOR ALL USING (auth.uid() = user_id);
```

### Change 2: Database Schema — `user_expertise` Table

```sql
CREATE TABLE user_expertise (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    domain TEXT NOT NULL,
    query_count INTEGER DEFAULT 1,
    last_searched_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, domain)
);

ALTER TABLE user_expertise ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_expertise_user_policy ON user_expertise
    FOR ALL USING (auth.uid() = user_id);
```

### Change 3: Memory Retrieval API — `GET /api/research/memory`

Retrieves relevant prior research for a query. Called by search-client.tsx in parallel with plan + limit check.

**Request**: `GET /api/research/memory?query=intermittent+fasting+for+athletes`

**Response**:
```json
{
    "memories": [
        {
            "id": "uuid",
            "topicQuery": "intermittent fasting health effects",
            "researchSummary": "Prior research found mixed evidence...",
            "filledGaps": ["metabolic mechanisms", "cardiovascular effects"],
            "openGaps": ["long-term muscle retention"],
            "resolvedContradictions": [
                { "topic": "muscle loss", "resolution": "Minimal impact per 2025 meta-analysis" }
            ],
            "keyClaims": [
                { "statement": "16:8 IF shows no significant muscle loss", "confidence": "established" }
            ],
            "ageInDays": 12,
            "searchMode": "deep"
        }
    ],
    "hasMemory": true
}
```

Returns empty array with `hasMemory: false` if memory is disabled or no relevant memories found.

### Change 4: Memory Storage API — `POST /api/research/memory`

Stores compressed research memory after synthesis completes. Uses upsert logic — if a highly similar topic exists (similarity > 0.6), replaces it.

**Request**:
```json
{
    "query": "intermittent fasting for athletes",
    "synthesisContent": "The full synthesis text (truncated to 1000 words for compression)...",
    "entities": [{ "name": "IF", "normalizedName": "intermittent fasting", "type": "concept" }],
    "filledGaps": ["athletic performance impact"],
    "openGaps": ["elite athlete protocols"],
    "contradictions": [{ "topic": "protein timing", "resolution": "Window matters less than daily total" }],
    "keyClaims": [{ "statement": "...", "confidence": "established" }],
    "searchMode": "deep",
    "sourceCount": 28
}
```

The route:
1. Calls LLM to compress synthesis into ~150-word summary
2. Checks for existing memory with similarity > 0.6 → upsert
3. Sets `expires_at` based on search mode (14d standard, 30d deep)

### Change 5: Prompt Updates — Gap Analyzer

Add optional `<previouslyFilledGaps>` section to `gapAnalyzerPrompt`:

```xml
<previouslyFilledGaps age="12 days">
    <caveat>The user previously researched a related topic. These gaps were already investigated. Avoid re-suggesting them unless the current data specifically contradicts the prior findings.</caveat>
    <gap>metabolic mechanisms of intermittent fasting</gap>
    <gap>cardiovascular effects of time-restricted eating</gap>
</previouslyFilledGaps>
```

This section is only included when memory retrieval returns results. The prompt tells the LLM to avoid re-investigating these gaps unless new contradictions warrant it.

### Change 6: Prompt Updates — Research Planner + Synthesizers

**Planner** — Add optional `<priorResearch>` section:

```xml
<priorResearch age="12 days" mode="deep">
    <caveat>This summary is from a previous research session and may be outdated. Generate research angles that COMPLEMENT this prior work rather than repeating it. Focus on what's NEW or DIFFERENT about the current query.</caveat>
    <summary>Prior research found that intermittent fasting shows mixed evidence for muscle retention. Key finding: 16:8 protocol shows no significant muscle loss in sedentary adults. Open question: effects on athletes under training load.</summary>
</priorResearch>
```

**Synthesizers** (both `researchSynthesizerPrompt` and `deepResearchSynthesizerPrompt`) — Add optional `<priorContext>`:

```xml
<priorContext age="12 days">
    <caveat>The user has prior research on a related topic. Reference it naturally where relevant ("Building on previous findings...") but ALWAYS prefer current sources over stored claims. If current sources contradict stored findings, explicitly note the update.</caveat>
    <summary>...</summary>
    <resolvedContradictions>
        <contradiction topic="muscle loss" resolution="Minimal impact per 2025 meta-analysis" />
    </resolvedContradictions>
</priorContext>
```

### Change 7: User Expertise in Synthesis

Add optional `<userExpertise>` hint to synthesizer prompts:

```xml
<userExpertise>
    <domain>finance</domain>
    <level>advanced</level>
    <hint>The user frequently researches finance topics (35+ sessions). Skip basic definitions and focus on nuanced analysis. Assume familiarity with standard financial terminology.</hint>
</userExpertise>
```

Expertise levels derived from query count:
| Query Count | Level | Synthesis Behavior |
|-------------|-------|--------------------|
| 1-5 | beginner | Include definitions, explain terminology |
| 6-20 | intermediate | Brief definitions for complex terms only |
| 21+ | advanced | Skip definitions, focus on nuance |

## Risk Assessment

| Risk | Likelihood | Severity | Mitigation |
|------|-----------|----------|------------|
| Stale memory causes incorrect synthesis | Medium | High | TTL expiration, age caveats in prompts, active invalidation on re-research |
| Memory retrieval adds latency | Low | Medium | Runs in parallel with plan + limit check; pg_trgm index is fast (<50ms) |
| False matches (unrelated topics matched) | Low | Medium | Similarity threshold 0.2 is conservative; LLM can ignore irrelevant context |
| Confirmation bias from prior findings | Medium | Medium | Prompt explicitly says "prefer current sources"; no user opinions stored |
| Privacy concern over stored research topics | Medium | High | Opt-in default, RLS, CASCADE delete, no cross-user sharing |
| Memory storage LLM call fails | Low | Low | Fire-and-forget; failure doesn't affect the current session |
| pg_trgm misses semantic matches | Medium | Low | Acceptable for Phase 1; users reuse vocabulary; upgrade to embeddings later |
| Memory bloat for power users | Low | Low | TTL cleanup + upsert prevents accumulation; max ~50 memories per user at any time |

## Testing Strategy

### Unit Tests

- Verify `<previouslyFilledGaps>` section in gap analyzer prompt when memory provided
- Verify `<priorResearch>` section in planner prompt when memory provided
- Verify `<priorContext>` section in synthesizer prompts when memory provided
- Verify sections are ABSENT when no memory provided (no empty tags)
- Verify staleness caveat includes age in days
- Verify memory compression produces <200 word summaries

### Integration Tests

- Memory storage: verify upsert replaces similar topic (similarity > 0.6)
- Memory retrieval: verify pg_trgm matching returns related topics
- Memory retrieval: verify expired memories are not returned
- Memory retrieval: verify RLS prevents cross-user access
- Pipeline integration: verify memory flows through plan → gap analysis → synthesis

### Manual Tests

- Research "intermittent fasting health effects", then "intermittent fasting for athletes" — verify second session references prior findings
- Research same topic twice — verify memory is updated (not duplicated)
- Disable memory in preferences — verify no memory stored or retrieved
- Wait for TTL expiration — verify stale memories not used
