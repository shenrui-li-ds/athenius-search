# Implementation Plan: Research Memory

**Feature Branch**: `007-research-memory`
**Created**: 2026-03-11
**Estimated Scope**: Medium (new Supabase migration, 2 new API routes, 1 new utility file, prompt modifications in `prompts.ts`, pipeline orchestration changes in `search-client.tsx`, preferences UI addition)

## Architecture

### New Components

| Component | Type | Purpose |
|-----------|------|---------|
| `research-memory.ts` | Utility | Memory compression, retrieval formatting, expertise level calculation |
| `/api/research/memory/route.ts` | API route | GET (retrieve) + POST (store) + DELETE (clear all) |
| `004_research_memory.sql` | Migration | `research_memory` + `user_expertise` tables, RLS, pg_trgm, cron cleanup |

### Modified Components

| Component | Changes |
|-----------|---------|
| `prompts.ts` | Add optional `<previouslyFilledGaps>`, `<priorResearch>`, `<priorContext>`, `<userExpertise>` sections to 4 prompt functions |
| `search-client.tsx` | Add memory retrieval (parallel with plan), memory storage (fire-and-forget after synthesis), pass memory data through pipeline |
| `/api/research/plan/route.ts` | Accept optional `priorResearch` parameter, include in prompt |
| `/api/research/analyze-gaps/route.ts` | Accept optional `filledGaps` parameter, include in prompt |
| `/api/research/synthesize/route.ts` | Accept optional `priorContext` and `expertiseLevel` parameters, include in prompt |
| Account preferences UI | Add research memory toggle + clear button |

### Data Flow

```
User Query → search-client.tsx
    ↓
[Memory Retrieval + Plan + Limit Check] — all parallel
    ↓
Plan receives priorResearch → generates complementary angles
    ↓
Search × 3-4 → Extract × 3-4
    ↓
Gap Analysis receives filledGaps → avoids redundant gaps
    ↓
(Deep only) Round 2 Search → Extract
    ↓
Synthesis receives priorContext + expertiseLevel → references prior work
    ↓
[Memory Store] — fire-and-forget, no latency impact
    ↓
Display
```

### Staleness Architecture

Staleness is managed at three levels:

1. **Storage**: TTL set at write time (14d standard, 30d deep)
2. **Retrieval**: Age calculated at read time, included in prompt XML
3. **Prompt**: LLM receives explicit caveat to prefer current sources over stored findings
4. **Cleanup**: Daily cron job deletes expired rows
5. **Invalidation**: Upsert replaces old memory when same topic re-researched
6. **Expertise decay**: Effective `query_count` halved at read time if `last_searched_at` > 90 days ago (no cron needed — stateless calculation)

No in-memory staleness tracking — all staleness is derived from timestamps at query time. This is stateless and correct across server restarts.

## Implementation Order

### Phase 1: Database + Memory API (Foundation)

**Files**: `deep-search/supabase/migrations/004_research_memory.sql`, `deep-search/src/lib/research-memory.ts`, `deep-search/src/app/api/research/memory/route.ts`

1. Create migration with both tables, RLS policies, pg_trgm extension, indexes, cleanup cron job
2. Create `research-memory.ts` utility with compression, retrieval formatting, expertise calculation
3. Create memory API route (GET retrieve, POST store with upsert, DELETE clear)
4. Verify: Run migration, test CRUD operations, verify RLS

**Risk**: pg_trgm extension may not be enabled in Supabase by default. Verify availability; fallback to LIKE matching if needed.

**Cost**: Memory compression adds one LLM call per research session. Mitigated by: using cheapest provider (DeepSeek), capping input at 1000 words, skipping compression when synthesis is already <200 words. Fire-and-forget — no latency impact.

**Reversibility**: Migration includes DOWN migration comments (DROP TABLE, DROP EXTENSION IF EXISTS). pg_trgm uses `CREATE EXTENSION IF NOT EXISTS` to avoid conflicts.

### Phase 2: Gap Analysis Memory (Highest Leverage)

**Files**: `deep-search/src/lib/prompts.ts`, `deep-search/src/app/api/research/analyze-gaps/route.ts`, `deep-search/src/app/search/search-client.tsx`

1. Add optional `<previouslyFilledGaps>` section to `gapAnalyzerPrompt`
2. Update analyze-gaps route to accept and inject `filledGaps` parameter
3. Update search-client.tsx: add memory retrieval in parallel with plan + limit check at pipeline start; pass `filledGaps` from retrieved memory to analyze-gaps
4. Update search-client.tsx: store memory after synthesis completes (fire-and-forget)
5. Verify: Research same topic twice, confirm gap analyzer avoids prior gaps

**Risk**: None — all changes are additive. Memory retrieval failure doesn't block pipeline (graceful degradation).

### Phase 3: Research Continuity (Planning + Synthesis)

**Files**: `deep-search/src/lib/prompts.ts`, `deep-search/src/app/api/research/plan/route.ts`, `deep-search/src/app/api/research/synthesize/route.ts`, `deep-search/src/app/search/search-client.tsx`

1. Add optional `<priorResearch>` section to planner prompts (both general and specialized)
2. Add optional `<priorContext>` section to both synthesizer prompts (keep in sync)
3. Update plan route to accept and inject `priorResearch` parameter
4. Update synthesize route to accept and inject `priorContext` parameter
5. Update search-client.tsx: extend memory retrieval (already parallel from Phase 2) to pass `priorResearch` to plan API and `priorContext` to synthesize API
6. Verify: Research related topic, confirm planner generates complementary angles
Note: Active invalidation (upsert) is already implemented in Phase 1's POST handler.

### Phase 4: User Expertise + Settings

**Files**: `deep-search/src/lib/prompts.ts`, `deep-search/src/lib/research-memory.ts`, `deep-search/src/app/api/research/memory/route.ts`, `deep-search/src/app/account/page.tsx` (or preferences component)

1. Add expertise tracking: increment domain counter after each research session
2. Add `<userExpertise>` section to synthesizer prompts
3. Update synthesize route to accept and inject `expertiseLevel` parameter
4. Add memory preference toggle to Account > Preferences
5. Add "Clear Research Memory" button to Account > Preferences
6. Verify: Research finance topics 10+ times, confirm synthesis skips basic definitions

### Phase 5: Documentation + Final Validation

Tests are written alongside implementation in Phases 1-4 (per Constitution Principle VI). Phase 5 is documentation only.

1. Update `deep-search/src/lib/CLAUDE.md` with research-memory.ts documentation
2. Update `deep-search/src/app/api/CLAUDE.md` with memory route documentation
3. Update project `CLAUDE.md` with research memory architecture
4. Quality gates: `npm run lint`, `npm run build`, all tests pass

## Files Modified

| File | Changes |
|------|---------|
| `deep-search/supabase/migrations/004_research_memory.sql` | New: tables, RLS, pg_trgm, indexes, cron |
| `deep-search/src/lib/research-memory.ts` | New: compression, formatting, expertise utils |
| `deep-search/src/app/api/research/memory/route.ts` | New: GET/POST/DELETE memory API |
| `deep-search/src/lib/prompts.ts` | Add optional memory sections to 4 prompts |
| `deep-search/src/app/search/search-client.tsx` | Add memory retrieval + storage to pipeline |
| `deep-search/src/app/api/research/plan/route.ts` | Accept + inject priorResearch |
| `deep-search/src/app/api/research/analyze-gaps/route.ts` | Accept + inject filledGaps |
| `deep-search/src/app/api/research/synthesize/route.ts` | Accept + inject priorContext + expertiseLevel |
| `deep-search/src/app/account/page.tsx` | Add memory toggle + clear button |
| `deep-search/src/lib/CLAUDE.md` | Document research-memory.ts |
| `deep-search/src/app/api/CLAUDE.md` | Document memory route |
| `CLAUDE.md` | Add research memory to architecture section |

## Backwards Compatibility

- **Memory is opt-in (default off)**: No behavioral change for existing users until they enable it
- **All memory parameters are optional**: Pipeline functions work identically when no memory is provided
- **No existing API contract changes**: All routes maintain their current request/response shapes; new parameters are additive
- **No caching impact**: Memory is independent of the two-tier cache system. Cached results are still served from cache; memory adds context to prompts, not to cache keys
- **Graceful degradation**: If memory retrieval fails (database error, timeout), the pipeline proceeds normally without memory. If memory storage fails, the current session is unaffected.

## Success Criteria

1. Gap analyzer avoids re-suggesting gaps that were filled in prior research on the same topic
2. Research planner generates complementary angles when prior research exists (not duplicate angles)
3. Synthesizer naturally references prior findings ("Building on previous research...")
4. Stale memories carry age caveats; LLM prefers current sources over stored claims
5. Memory is replaced (not duplicated) when same topic is re-researched
6. Expired memories are automatically cleaned up and never retrieved
7. Memory preference toggle works: off = no storage, no retrieval
8. Zero latency regression: memory retrieval runs in parallel with existing calls
9. Zero quality regression on first-time queries (no memory = no change)
10. All existing tests continue to pass (memory params are optional everywhere)
