# Tasks: Threaded Conversational Search

**Input**: Design documents from `/specs/004-threaded-search/`
**Prerequisites**: plan.md (required), spec.md (required for user stories)

**Tests**: Included per spec.md Testing section (integration tests for API routes, unit tests for CRUD and summary generation).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Database schema and shared type definitions

- [x] T001 Create database migration with search_threads and thread_messages tables, indexes, RLS policies, trigger, and cleanup function in `supabase/migrations/add-search-threads.sql`
- [x] T002 Add thread-related TypeScript types (SearchThread, ThreadMessage, ThreadInsert, ThreadMessageInsert) to `deep-search/src/lib/supabase/database.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core thread infrastructure that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Implement thread CRUD operations (createThread, getThread, getThreadMessages, addMessage, updateThreadSummary, deleteThread, bookmarkThread) in `deep-search/src/lib/supabase/threads.ts`. Note: updateThreadSummary uses last-write-wins semantics for concurrent access (multiple tabs).
- [x] T004 Implement thread summary generation (generateThreadSummary) using lightweight LLM call with <150 word output constraint in `deep-search/src/lib/thread-context.ts`
- [x] T005 [P] Add thread context sections to refineSearchQueryPrompt and summarizeSearchResultsPrompt (additive, only when threadContext is provided) in `deep-search/src/lib/prompts.ts`
- [x] T006 [P] Update `/api/refine` route to accept optional `threadContext` parameter in request body and pass it to the refine prompt in `deep-search/src/app/api/refine/route.ts`
- [x] T007 [P] Update `/api/summarize` route to accept optional `threadContext` parameter in request body and pass it to the summarize prompt in `deep-search/src/app/api/summarize/route.ts`

**Checkpoint**: Foundation ready — thread CRUD, summary generation, and thread-aware API routes are functional

---

## Phase 3: User Story 1 — Context-Aware Follow-ups (Priority: P1) 🎯 MVP

**Goal**: Web searches create threads. Follow-up queries use thread context to avoid redundancy and build on prior knowledge.

**Independent Test**: Start a web search for "What is quantum computing?". Ask follow-up "How does it compare to classical?". Verify: (a) second response doesn't re-explain quantum basics, (b) second response has its own [1]-[N] citations, (c) response references prior context naturally.

### Tests for User Story 1

- [ ] T008 [P] [US1] Write integration test for `/api/refine` covering both standalone (no threadContext) and threaded (with threadContext) paths, verifying existing behavior is unaffected when threadContext is absent and that non-web modes ignore threadContext, in `deep-search/src/app/api/refine/__tests__/route.test.ts`
- [ ] T009 [P] [US1] Write integration test for `/api/summarize` covering both standalone (no threadContext) and threaded (with threadContext) paths, verifying existing behavior is unaffected when threadContext is absent and that non-web modes ignore threadContext, in `deep-search/src/app/api/summarize/__tests__/route.test.ts`
- [ ] T010 [P] [US1] Write unit tests for threads.ts CRUD operations (create, read, addMessage, updateSummary, soft delete) in `deep-search/src/lib/supabase/__tests__/threads.test.ts`
- [ ] T011 [P] [US1] Write unit test for thread-context.ts verifying summary output stays under 150 words in `deep-search/src/lib/__tests__/thread-context.test.ts`

### Implementation for User Story 1

- [x] T012 [US1] Add `compact` prop to SearchResult component that hides related searches, floating follow-up input, tabs, share/copy, and action bar sections in `deep-search/src/components/SearchResult.tsx`
- [x] T013 [P] [US1] Create ThreadMessage component rendering a single Q&A pair (user query bubble left-aligned full-width + compact SearchResult response card) with responsive design for mobile and desktop in `deep-search/src/components/ThreadMessage.tsx`
- [x] T014 [P] [US1] Create ThreadView component with thread header, scrollable message list, thread limit banner (at 20 messages), and fixed-bottom follow-up input with responsive design for mobile and desktop in `deep-search/src/components/ThreadView.tsx`
- [x] T015 [US1] Add thread creation flow to search-client.tsx: detect mode=web + has `q` + no `thread` → create thread in Supabase (parallel with refine + limit check), save message on stream complete, generate summary fire-and-forget, replace URL to `?thread=<id>` in `deep-search/src/app/search/search-client.tsx`
- [x] T016 [US1] Add thread follow-up flow to search-client.tsx: load thread summary from component state, execute web search pipeline with threadContext, save message, update summary fire-and-forget, append ThreadMessage to UI in `deep-search/src/app/search/search-client.tsx`
- [x] T017 [US1] Update search page to read `thread` URL parameter and pass to search-client in `deep-search/src/app/search/page.tsx`
- [x] T018 [US1] Add thread resumption from URL: detect has `thread` + no `q` → fetch thread + all messages from Supabase, render ThreadView, load thread_summary into state in `deep-search/src/app/search/search-client.tsx`
- [x] T019 [US1] Enforce 20-message thread limit: when thread reaches 20 messages, show banner explaining the limit and suggesting a new thread in `deep-search/src/app/search/search-client.tsx`
- [x] T020 [US1] Update SearchBox component with thread-aware follow-up behavior (no mode selector when in thread, fixed web mode) in `deep-search/src/components/SearchBox.tsx`
- [x] T021 [US1] Add thread error handling in search-client.tsx: on stream failure don't save partial message (user can retry), on summary generation failure continue without updated summary (fall back to last successful summary), on navigation-away don't save incomplete message in `deep-search/src/app/search/search-client.tsx`

**Checkpoint**: Web searches create threads, follow-ups use context, thread can be resumed from URL. Core thread experience is functional.

---

## Phase 4: User Story 2 — Thread Persistence and Resumption (Priority: P1)

**Goal**: Threads are persisted, visible in Library, and resumable. Users can close the browser and return to their threads.

**Independent Test**: Create a thread with 3 messages. Close browser. Reopen. Navigate to Library. Click the thread. Verify all 3 messages load with sources. Type a follow-up. Verify it uses thread context.

### Implementation for User Story 2

- [x] T022 [US2] Add "Threads" section to Library page: fetch user's threads (sorted by updated_at DESC), display thread cards with title, message count, last updated relative time, bookmark icon in `deep-search/src/app/library/page.tsx`
- [x] T023 [US2] Add thread click navigation from Library: clicking a thread card navigates to `/search?thread=<id>` in `deep-search/src/app/library/page.tsx`
- [x] T024 [P] [US2] Add thread-related i18n translations (thread titles, message counts, library labels, limit messages, follow-up placeholder) to `deep-search/src/i18n/messages/en.json`
- [x] T025 [P] [US2] Add thread-related i18n translations (same keys as en.json) to `deep-search/src/i18n/messages/zh.json`

**Checkpoint**: Threads persist across sessions and are accessible from Library. Full persistence flow works end-to-end.

---

## Phase 5: User Story 3 — Thread Management (Priority: P2)

**Goal**: Users can manage threads: auto-generated titles, bookmarking, deletion.

**Independent Test**: Create a thread. Verify title is auto-generated from first query (truncated to 60 chars). Bookmark it. Verify it appears in bookmarked section. Delete it. Verify it's soft-deleted and no longer visible.

### Implementation for User Story 3

- [x] T026 [US3] Implement thread title auto-generation from first query (truncated to 60 characters with ellipsis, immutable after creation) in `deep-search/src/lib/supabase/threads.ts`
- [x] T027 [US3] Add bookmark toggle and soft-delete actions to thread cards in Library (bookmarked threads in separate section above non-bookmarked) in `deep-search/src/app/library/page.tsx`
- [x] T028 [US3] Add empty thread cleanup: on Library load, delete threads with message_count=0 older than 1 hour in `deep-search/src/app/library/page.tsx`

**Checkpoint**: Thread management features complete. Users can bookmark, delete, and see auto-generated titles.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation updates and migration verification

- [ ] T029 [P] Verify migration rollback SQL executes cleanly (run rollback statements against a test database, then re-apply migration) for `supabase/migrations/add-search-threads.sql`
- [x] T030 [P] Update CLAUDE.md Active Technologies and Recent Changes sections with threaded search info in `CLAUDE.md`
- [x] T031 [P] Update src/lib/CLAUDE.md with thread-context.ts documentation in `deep-search/src/lib/CLAUDE.md`
- [x] T032 [P] Update src/components/CLAUDE.md with ThreadView and ThreadMessage component documentation in `deep-search/src/components/CLAUDE.md`
- [x] T033 [P] Update src/lib/supabase/CLAUDE.md with threads.ts CRUD operations documentation in `deep-search/src/lib/supabase/CLAUDE.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (types must exist before CRUD)
- **US1 (Phase 3)**: Depends on Phase 2 (needs CRUD, prompts, API routes)
- **US2 (Phase 4)**: Depends on Phase 3 (threads must be creatable before listing)
- **US3 (Phase 5)**: Depends on Phase 4 (Library must show threads before management actions)
- **Polish (Phase 6)**: Can start after Phase 3; independent of Phases 4-5

### User Story Dependencies

- **User Story 1 (P1)**: Depends on Foundational — no dependency on other stories
- **User Story 2 (P1)**: Depends on US1 (threads must exist to be listed in Library)
- **User Story 3 (P2)**: Depends on US2 (Library must show threads before management)

### Within Each User Story

- Tests can run in parallel with each other
- Models/types before services
- Services before UI components
- UI components before page integration
- Commit after each task or logical group

### Parallel Opportunities

- T005, T006, T007 can run in parallel (different files)
- T008, T009, T010, T011 can all run in parallel (different test files)
- T012, T013, T014 — T013 and T014 can run in parallel (different new components); T012 must complete first (compact prop used by T013)
- T024, T025 can run in parallel (different locale files)
- T029–T033 can all run in parallel (different files)

---

## Parallel Example: User Story 1

```bash
# Launch all tests in parallel:
T008: "Integration test for /api/refine in __tests__/route.test.ts"
T009: "Integration test for /api/summarize in __tests__/route.test.ts"
T010: "Unit tests for threads.ts CRUD in __tests__/threads.test.ts"
T011: "Unit test for thread-context.ts summary in __tests__/thread-context.test.ts"

# Launch new components in parallel (after T012 compact prop):
T013: "ThreadMessage component in components/ThreadMessage.tsx"
T014: "ThreadView component in components/ThreadView.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (migration + types)
2. Complete Phase 2: Foundational (CRUD, prompts, API routes)
3. Complete Phase 3: User Story 1 (thread creation, follow-ups, UI)
4. **STOP and VALIDATE**: Test thread creation and follow-ups manually
5. Deploy/demo if ready — threads work but aren't persisted in Library yet

### Incremental Delivery

1. Setup + Foundational → Infrastructure ready
2. Add User Story 1 → Core thread experience works → Deploy (MVP!)
3. Add User Story 2 → Threads visible in Library → Deploy
4. Add User Story 3 → Thread management (bookmark, delete, titles) → Deploy
5. Polish → Documentation, migration verification → Deploy

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Non-web modes (research, brainstorm) are unchanged — no thread creation
