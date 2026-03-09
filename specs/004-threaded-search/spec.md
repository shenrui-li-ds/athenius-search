# Feature Specification: Threaded Conversational Search

**Feature Branch**: `004-threaded-search`
**Created**: 2026-03-08
**Status**: Draft
**Input**: Brainstorm session analyzing multi-round search patterns (Perplexity-style threaded conversations)
**Depends on**: None (builds on existing search infrastructure)

## Overview

Add persistent, context-aware search threads to Web mode. Each thread is a conversation around a topic where follow-up queries build on previous context — eliminating redundancy and enabling guided exploration.

**Current state**: Each search is atomic. The follow-up input navigates to a fresh `/search?q=...` with zero memory of prior results. Users who ask follow-ups get redundant answers that re-explain what they already know.

**Target state**: Web searches live in threads. Follow-up queries inherit a compressed summary of previous messages, producing targeted results that build on — not repeat — established knowledge. Threads are persisted, resumable from the library, and bookmarkable.

## Scope

**In scope**: Threaded conversation for Web search mode only.

**Out of scope**: Research and Brainstorm thread support. These modes produce heavy output per message (800-1200 words + 30-55 sources for research, 800-1000 words + 24-48 sources for brainstorm). Thread bloat, citation numbering, and context compression become significantly harder with these output shapes. Web mode is lightweight (200-300 words + 10-15 sources per message), making threads natural and manageable. Research and brainstorm threads can be explored as a future enhancement once the core thread infrastructure is proven.

## Design Decisions

### Per-Message Citation Numbering

Each message restarts citation numbering at [1]. Messages are self-contained — source pills below each message correspond to [1]-[N] for that message only.

**Rationale**: Continuous numbering across messages produces unreadable citations in later messages (e.g., [47], [53]). Per-message numbering keeps citations scannable and matches the current standalone search UX. The tradeoff — no cross-message citation referencing — is acceptable because users read messages sequentially and check sources within the message they're reading.

### Thread Summary as Sole Context Bridge

The only data that flows between messages is a compressed rolling summary (< 150 words). Individual messages don't read prior message content. This bounds prompt overhead to ~200 tokens regardless of thread length and keeps the architecture simple.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Web Thread: Context-Aware Follow-ups (Priority: P1)

A user searches "What is quantum computing?" in Web mode. They get a concise summary with sources cited as [1]-[10]. They type a follow-up: "How does it compare to classical computing?" Instead of getting a fresh, redundant answer that re-explains quantum basics, the system recognizes the thread context. The refine step generates a targeted search query focused on comparison angles not yet covered. The summary builds on established context: "Building on the quantum fundamentals discussed earlier, classical computing differs in..." with its own citations [1]-[8]. The user can continue asking follow-ups, each adding genuinely new information.

**Why this priority**: Web mode has the widest quality gap to fill — it's currently the only mode with zero context memory. This story delivers the core thread experience.

**Independent Test**: Start a web search for "What is quantum computing?". Ask follow-up "How does it compare to classical?". Verify: (a) the second response doesn't re-explain quantum basics, (b) the second response has its own [1]-[N] citations with its own source pills, (c) the response references prior context naturally.

**Acceptance Scenarios**:

1. **Given** a user's first query in web mode, **When** the first message completes and is saved, **Then** a thread is created in Supabase with the first message, a thread summary is generated (fire-and-forget), and the URL updates to include the thread ID.
2. **Given** a user types a follow-up query in an existing web thread, **When** the refine API runs, **Then** it receives the thread summary and generates a search query that avoids redundancy with previously covered topics.
3. **Given** a follow-up search completes, **When** the summarize API runs, **Then** it receives the thread summary, produces a response that builds on prior context, and uses its own per-message citation numbering starting at [1].
4. **Given** a thread with 3+ messages, **When** the user views the thread, **Then** all messages are displayed vertically in order, each with their own sources and thinking panel.
5. **Given** a thread reaches 20 messages, **When** the user tries to add another follow-up, **Then** a message explains the thread limit and suggests starting a new thread.

---

### User Story 2 - Thread Persistence and Resumption (Priority: P1)

A user has an active web thread about quantum computing with 5 messages. They close the browser and come back the next day. They navigate to Library and see their thread listed with the title "Quantum Computing", showing 5 messages and the last update timestamp. They click it and the full thread loads with all messages. They type a follow-up and the conversation continues with full context.

**Why this priority**: P1 because without persistence, threads are just session-local state — far less valuable.

**Independent Test**: Create a thread with 3 messages. Close browser. Reopen. Navigate to Library. Click the thread. Verify all 3 messages load with sources. Type a follow-up. Verify it uses thread context.

**Acceptance Scenarios**:

1. **Given** a thread with messages, **When** the user navigates to Library, **Then** the thread appears with title, message count, and last updated timestamp.
2. **Given** a thread in the Library, **When** the user clicks it, **Then** it loads at `/search?thread=<id>` with all messages displayed.
3. **Given** a resumed thread, **When** the user types a follow-up, **Then** the thread summary is loaded from the database and passed to the search pipeline.

---

### User Story 3 - Thread Management (Priority: P2)

Users can manage their threads: auto-generated titles, bookmarking, deletion, and viewing thread info.

**Acceptance Scenarios**:

1. **Given** the first message in a thread, **When** the thread is created, **Then** the title is auto-generated from the first query (truncated to 60 chars).
2. **Given** a thread, **When** the user bookmarks it, **Then** it appears in the bookmarked section of Library.
3. **Given** a thread, **When** the user deletes it, **Then** it is soft-deleted and no longer appears in Library (but can be recovered).
4. **Given** Library view, **When** threads are listed, **Then** they show: title, message count, last updated time, bookmarked status.

---

## Non-Functional Requirements

### Performance
- Thread loading from Library: < 2 seconds for threads with up to 20 messages. While loading, show thread header immediately with skeleton placeholders for messages, then render messages progressively.
- Thread context adds < 500ms to refine + summarize API calls (prompt overhead of ~100-200 tokens)
- Thread summary generation runs fire-and-forget after main response streams (no perceived cost)

### Limits
- Maximum 20 messages per thread (prevents unbounded growth)
- Thread summary kept under 150 words (bounds context token cost)
- Thread title max 60 characters

### Cost
- Each follow-up costs 1 credit (same as standalone web search)
- Thread summary generation: ~300-500 LLM tokens per message (negligible cost, no Tavily usage)
- No additional Tavily costs — thread context makes existing searches more targeted, not more numerous

### Reliability
- Each message in a thread is independently reliable (same API calls as standalone search)
- Thread state persisted after each message completion — thread recoverable on crash
- Thread summary corruption does not block search — falls back to no-context search if summary is missing/invalid

### Data
- Threads stored in Supabase with RLS (users can only access own threads)
- Thread messages stored with full content, sources, and metadata
- Soft delete for threads (recoverable)
- Thread summary updated incrementally after each message

### Testing

- `/api/refine` and `/api/summarize` MUST have integration tests covering both standalone (no threadContext) and threaded (with threadContext) paths, verifying that existing behavior is unaffected when threadContext is absent.
- `threads.ts` CRUD operations MUST have unit tests for create, read, update (summary/bookmark), and soft delete.
- `thread-context.ts` summary generation MUST have a unit test verifying output stays under 150 words.

## Edge Cases

1. **First message in thread fails**: Thread is created but has no messages. Clean up empty threads on next Library load or via cron.
2. **Follow-up fails mid-stream**: Previous messages are intact. Failed message is not saved. User can retry.
3. **Thread summary generation fails**: Thread continues without updated summary. Next follow-up uses the last successful summary (or no context if first message).
4. **Very long first query as thread title**: Truncate to 60 characters with ellipsis. Title is immutable after creation (auto-generated, not user-editable).
5. **User navigates away during follow-up**: Stream interrupted, partial message not saved. Thread intact with previous messages.
6. **Concurrent thread access** (same user, multiple tabs): Last-write-wins for thread summary. Messages have sequence numbers to prevent ordering issues.
7. **Research/Brainstorm mode selected**: Thread not created. These modes continue to work as standalone searches (current behavior unchanged).
8. **Provider switching within a thread**: Users can change the LLM provider between messages. Each message stores its own provider. The thread-level `provider` field records the initial default only.

## Future Enhancements (not in scope)

- Research mode thread support
- Brainstorm mode thread support
- Thread sharing (public link)
- Thread export (PDF/markdown)
- Thread search (search within thread content)
- Unify search_history with threads
