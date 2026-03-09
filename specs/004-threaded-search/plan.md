# Implementation Plan: Threaded Conversational Search

**Feature Branch**: `004-threaded-search`
**Created**: 2026-03-08
**Status**: Draft

## Tech Stack

- TypeScript 5.x / Next.js 15.2 (App Router) + React 19
- Supabase (PostgreSQL) for thread persistence
- Existing `api-utils.ts`, `cache.ts`, `prompts.ts` utilities
- Existing web search pipeline (refine → search → summarize)
- next-intl for i18n, Tailwind CSS 4 for styling

## Architecture

### Core Concept

A thread is a persisted web search conversation. Each message triggers the same search pipeline as a standalone web search, but with an additional `threadContext` parameter (a compressed rolling summary of prior messages). The thread context modifies refine and summarize prompt behavior to avoid redundancy and build on established knowledge.

```
Thread Model:

  search_threads (1) ←→ (N) thread_messages
       │                         │
       ├── mode = 'web' (fixed)  ├── query
       ├── title                 ├── content (summary response)
       ├── thread_summary        ├── sources (JSONB)
       └── bookmarked            └── search_intent
```

### Data Flow

```
First Message (no context):
  Query → [Create Thread] → Refine → Search → Summarize
        → [Save Message] → [Generate Summary (fire-and-forget)]

Follow-up Message (with context):
  Query → [Load Thread Summary] → Refine(+threadContext) → Search
        → Summarize(+threadContext) → [Save Message] → [Update Summary (fire-and-forget)]
```

The thread summary is the **only** data that flows between rounds. Individual messages don't read prior message content — the summary compresses everything needed into < 150 words.

### Context Compression Strategy

After each message completes, a lightweight LLM call generates/updates the rolling summary:

```
Input:  Previous summary (or "None") + latest Q&A (truncated to ~500 words)
Output: Updated summary (< 150 words)
Temp:   0.3 (factual, concise)
Cost:   ~400 tokens total (~$0.0004)
Timing: Fire-and-forget after main stream completes
```

**Growth bound**: Summary stays under 150 words regardless of thread length. At 20 messages, the summary is still ~150 words. This bounds the prompt overhead to ~200 tokens per follow-up.

**Enforcement**: The 150-word limit is enforced via prompt instruction ("Keep under 150 words") and validated by a unit test. No runtime truncation is applied — the LLM reliably respects word-count instructions at low temperature (0.3).

### Per-Message Citation Numbering

Each message is self-contained. Citations restart at [1] per message. Source pills below each message correspond to that message's [1]-[N] citations. No `sourceOffset` in the data model or prompts.

This eliminates the complexity of cross-message source indexing and keeps each message readable independently.

### Thread-Aware Prompt Modifications

Only two prompts need modification. Changes are additive — an optional `threadContext` section is prepended when present. When absent (first message, or standalone search), prompts behave identically to current behavior.

**Refine prompt** (`refineSearchQueryPrompt`):
```xml
<!-- Prepended only when threadContext is provided -->
<thread_context>
The user is continuing a conversation about a topic. Previously covered:
{threadSummary}
</thread_context>
<instruction>
Optimize the follow-up query for search. Focus on information NOT yet covered
in the thread context. Avoid generating queries that would return results
redundant with what the user already knows.
</instruction>
```

**Summarize prompt** (`summarizeSearchResultsPrompt`):
```xml
<!-- Prepended only when threadContext is provided -->
<thread_context>
Previous conversation context: {threadSummary}
</thread_context>
<instruction>
Summarize these NEW search results. Build on the established context naturally
(e.g., "As noted earlier..." or "Expanding on the previous discussion...").
Do not repeat information already covered. Focus on what's genuinely new.
Use your own citation numbering starting at [1].
</instruction>
```

### Thread Summary Generation Prompt

```xml
<system>
You compress conversation threads into concise rolling summaries for use as
context in future searches. Output plain text, under 150 words.
</system>
<user>
Update this thread summary with the latest exchange.

Current summary: {previousSummary || "None (first message)"}

Latest exchange:
Q: {latestQuery}
A: {latestContent (truncated to 500 words)}

Write an updated summary covering:
- Key topics and findings discussed so far
- Notable entities, names, or concepts mentioned
- What the user seems most interested in exploring
- What has been thoroughly covered (so future searches can skip it)

Keep under 150 words.
</user>
```

## Database Schema

### New Tables

```sql
-- Thread metadata
CREATE TABLE search_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'web' CHECK (mode = 'web'),
  provider TEXT NOT NULL,
  message_count INTEGER NOT NULL DEFAULT 0,
  thread_summary TEXT,
  bookmarked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Individual messages within a thread
CREATE TABLE thread_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES search_threads(id) ON DELETE CASCADE,
  sequence_num INTEGER NOT NULL,
  query TEXT NOT NULL,
  refined_query TEXT,
  provider TEXT NOT NULL,
  content TEXT,
  sources JSONB DEFAULT '[]'::jsonb,
  images JSONB DEFAULT '[]'::jsonb,
  search_intent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(thread_id, sequence_num)
);

-- Indexes
CREATE INDEX idx_search_threads_user
  ON search_threads(user_id, deleted_at, updated_at DESC);
CREATE INDEX idx_search_threads_bookmarked
  ON search_threads(user_id, bookmarked, deleted_at)
  WHERE bookmarked = TRUE;
CREATE INDEX idx_thread_messages_thread
  ON thread_messages(thread_id, sequence_num);

-- RLS
ALTER TABLE search_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE thread_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own threads"
  ON search_threads FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users access own thread messages"
  ON thread_messages FOR ALL
  USING (thread_id IN (
    SELECT id FROM search_threads WHERE user_id = auth.uid()
  ));

-- Auto-update thread metadata when message inserted
CREATE OR REPLACE FUNCTION update_thread_on_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE search_threads
  SET updated_at = NOW(),
      message_count = (
        SELECT COUNT(*) FROM thread_messages WHERE thread_id = NEW.thread_id
      )
  WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER thread_message_inserted
  AFTER INSERT ON thread_messages
  FOR EACH ROW EXECUTE FUNCTION update_thread_on_message();

-- Cleanup empty threads (no messages after 1 hour)
CREATE OR REPLACE FUNCTION cleanup_empty_threads()
RETURNS void AS $$
BEGIN
  DELETE FROM search_threads
  WHERE message_count = 0
    AND created_at < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
```

### Coexistence with search_history

The `search_history` table continues unchanged. Web threads and standalone research/brainstorm searches coexist:

- **Web mode**: Creates a thread (new behavior)
- **Research mode**: Saves to search_history (current behavior, unchanged)
- **Brainstorm mode**: Saves to search_history (current behavior, unchanged)

Library shows both threads and search_history entries. A future unification could merge standalone searches into single-message threads.

## File Structure

### New Files

```
src/lib/supabase/threads.ts              -- Thread + message CRUD operations
src/lib/thread-context.ts               -- Thread summary generation
src/components/ThreadMessage.tsx         -- Single message in thread UI
src/components/ThreadView.tsx            -- Thread conversation layout
supabase/migrations/add-search-threads.sql  -- Database schema
```

### Modified Files

```
src/app/search/search-client.tsx     -- Thread-aware web search orchestration
src/app/search/page.tsx              -- Thread URL routing (?thread=<id>)
src/lib/prompts.ts                   -- Thread-aware refine + summarize prompts
src/app/api/refine/route.ts          -- Accept optional threadContext
src/app/api/summarize/route.ts       -- Accept optional threadContext
src/app/library/page.tsx             -- Show threads alongside search history
src/components/SearchResult.tsx      -- Compact mode for thread messages
src/components/SearchBox.tsx         -- Thread-aware follow-up behavior
src/lib/supabase/database.ts        -- Thread-related types
src/i18n/messages/en.json           -- Thread UI translations
src/i18n/messages/zh.json           -- Thread UI translations
CLAUDE.md                           -- Active Technologies + Recent Changes
src/lib/CLAUDE.md                   -- Thread context utilities documentation
src/components/CLAUDE.md            -- ThreadView/ThreadMessage component docs
src/lib/supabase/CLAUDE.md          -- Thread CRUD operations documentation
```

## Component Architecture

### Thread View Layout

```
ThreadView (replaces SearchResult when viewing a thread)
├── Thread Header (title, message count)
├── Message List (scrollable)
│   ├── ThreadMessage (Q1 + A1)
│   │   ├── User Query (styled as chat bubble or heading)
│   │   └── Response Card
│   │       ├── Thinking Panel (search intent, collapsed)
│   │       ├── Answer Content (markdown, citations [1]-[N])
│   │       └── Source Pills ([1]-[N] for this message)
│   ├── ThreadMessage (Q2 + A2)
│   │   └── ... (same structure, own [1]-[N] citations)
│   └── ThreadMessage (Qn + An) [latest, possibly streaming]
│       └── ... (with active loading states)
├── Thread Limit Banner (shown near 20 messages)
└── Follow-up Input (fixed bottom)
    └── Textarea + Send button (no mode selector — mode is fixed)
```

### Thread UI Style

The thread UI follows the familiar LLM chat interface pattern (similar to Perplexity, ChatGPT):

- **User query**: Displayed in a left-aligned, full-width rounded bubble (e.g., `rounded-2xl bg-[var(--card)] px-4 py-3`). Left-aligned to match the natural reading flow and keep the layout consistent with the full-width AI response below it. Compact, no extra chrome.
- **AI response**: Full-width response card below the query bubble. Contains the thinking panel (collapsed), markdown answer with citations, and source pills. No bubble wrapping — the content needs room to breathe (tables, lists, collapsible sections).
- **Visual rhythm**: Query bubble → response card → query bubble → response card. Clear alternation with spacing between pairs.
- **Streaming state**: Latest message shows loading skeleton / streaming cursor in the response area while the query bubble is already visible above it.

### ThreadMessage vs SearchResult

ThreadMessage is a compact rendering of a single search result. It reuses SearchResult's markdown rendering and source display but omits:
- Related searches section (thread follow-up replaces this)
- Floating follow-up input (thread-level input at bottom)
- Tabs (Answer/Links) — just shows answer with inline source pills
- Share/copy per message — thread-level actions instead
- Action bar (like/dislike/rewrite) — not needed per message

**Implementation approach**: Add a `compact` prop to SearchResult that conditionally hides these sections. This avoids creating a parallel component and reuses all existing markdown rendering, citation formatting, and streaming logic.

## URL Routing

### Thread Creation Flow (Web mode)

```
1. User on homepage, types query, mode=web, selects provider
2. Navigate to: /search?q=quantum+computing&mode=web&provider=gemini
3. search-client.tsx detects: mode=web, has `q`, no `thread` → new thread
4. Create thread in Supabase (parallel with refine + limit check)
5. Execute web search pipeline (first message, no threadContext)
6. On stream complete: save message to Supabase
7. Generate thread summary (fire-and-forget)
8. Replace URL to: /search?thread=<thread_id> (via router.replace)
```

### Thread Follow-up Flow

```
1. User types follow-up in thread input, presses Enter/Send
2. Load thread summary from component state (already in memory)
3. Execute web search pipeline with threadContext
4. On stream complete: save message to Supabase
5. Update thread summary (fire-and-forget)
6. Append new ThreadMessage to UI
7. URL stays: /search?thread=<thread_id>
```

### Thread Resumption Flow (from Library)

```
1. User clicks thread in Library
2. Navigate to: /search?thread=<thread_id>
3. search-client.tsx detects: has `thread`, no `q` → resume mode
4. Fetch thread + all messages from Supabase
5. Render ThreadView with all messages
6. Load thread_summary into component state
7. User types follow-up → same as follow-up flow above
```

### Non-Web Modes (unchanged)

```
Research/Brainstorm searches:
1. Navigate to: /search?q=...&mode=pro&provider=...
2. search-client.tsx detects: mode != web → standalone mode
3. Execute current pipeline (no thread created)
4. Save to search_history (current behavior)
```

## Credit Model

No changes. Each web thread message costs 1 credit (same as standalone web search). Thread summary generation uses LLM tokens (~400 per summary) but no Tavily credits. Negligible cost (~$0.0004 per summary).

## Caching Interaction

Thread-contextualized searches are less likely to hit cache (refined queries are unique to thread context). This is expected and acceptable.

The existing cache still provides value:
- First-message queries cache normally (identical to standalone)
- Synthesis caching works per-message (same sources = cache hit on retry)
- Academic source searches cache across threads

## Library Integration

Add a "Threads" section to Library alongside existing search history:

```
Library Page
├── Section: Threads (new)
│   ├── Thread Card: "Quantum Computing" · 5 messages · 2h ago [★]
│   ├── Thread Card: "Best hiking gear" · 3 messages · yesterday
│   └── Thread Card: "CRISPR basics" · 2 messages · 3d ago
├── Section: Search History (existing, for research/brainstorm)
│   └── ... (current behavior unchanged)
```

Thread cards show: title, message count, last updated relative time, bookmark icon. Clicking navigates to `/search?thread=<id>`.

Threads are sorted by `updated_at DESC` (most recently active first). Bookmarked threads appear in a separate section above non-bookmarked threads.

## Implementation Phases

### Phase 1: Core Thread Experience
- Database schema (search_threads + thread_messages)
- Thread CRUD operations (threads.ts)
- Thread context generation (thread-context.ts)
- Thread-aware prompts (refine + summarize with optional threadContext)
- API route changes (refine + summarize accept threadContext)
- Thread creation in search-client.tsx (web mode only)
- Thread follow-up flow in search-client.tsx
- ThreadView component (conversation layout)
- ThreadMessage / compact SearchResult
- URL routing (create, follow-up, resume)
- Thread resumption from URL

### Phase 2: Library + Management
- Library "Threads" section
- Thread bookmark/delete
- Thread title auto-generation
- Thread limit enforcement (20 messages)
- Empty thread cleanup
- i18n translations
- Thread resumption from Library

## Key Technical Risks

### Risk 1: Thread summary quality degrades over many messages
**Likelihood**: Low for web mode (lightweight messages, easy to compress).
**Mitigation**: Summary prompt explicitly tracks "what's been thoroughly covered." At 20 web messages, the topic space is well-bounded. Summary regeneration from all messages possible as a repair mechanism if needed.

### Risk 2: SearchResult compact mode breaks existing standalone display
**Likelihood**: Low-Medium. Conditional rendering in a large component risks regressions.
**Mitigation**: `compact` prop only hides sections (no structural changes to existing rendering). Existing standalone web/research/brainstorm searches are unaffected — they don't pass `compact`.

### Risk 3: Thread creation adds latency to first web search
**Likelihood**: Low. Single Supabase insert (~50ms) runs in parallel with refine + limit check.
**Mitigation**: Thread creation is non-blocking. If it fails, search proceeds as standalone (graceful degradation).

### Risk 4: URL transition from `?q=...` to `?thread=...` causes flicker
**Likelihood**: Low-Medium. `router.replace` may trigger a re-render.
**Mitigation**: Replace URL after search completes (not during). Thread ID stored in component state, URL is cosmetic for shareability/resumption.

## Migration Rollback

If the migration needs to be reversed:

```sql
-- Rollback: remove threaded search tables
DROP TRIGGER IF EXISTS thread_message_inserted ON thread_messages;
DROP FUNCTION IF EXISTS update_thread_on_message();
DROP FUNCTION IF EXISTS cleanup_empty_threads();
DROP TABLE IF EXISTS thread_messages;
DROP TABLE IF EXISTS search_threads;
```

Order matters: drop the trigger and functions before tables. The `ON DELETE CASCADE` on `thread_messages.thread_id` means dropping `search_threads` alone would also cascade-delete messages, but explicit ordering is safer.
