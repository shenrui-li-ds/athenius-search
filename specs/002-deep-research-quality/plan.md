# Implementation Plan: Zero-Latency Deep Research Quality Enhancement

**Branch**: `002-deep-research-quality` | **Date**: 2026-03-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-deep-research-quality/spec.md`

## Summary

Enhance deep research quality by ~25-35% with zero additional latency through four changes that piggyback on existing pipeline steps: (1) entity extraction in the existing LLM extraction call, (2) programmatic cross-aspect entity merge, (3) compressed structured gap analysis format replacing the lossy `summarizeExtractedData()`, and (4) source authority tagging via domain whitelist. No new API calls, no new sequential steps.

## Technical Context

**Language/Version**: TypeScript 5.x / Next.js 15.2 (App Router)
**Primary Dependencies**: React 19, next-intl, react-markdown, Tailwind CSS 4
**Storage**: N/A (all changes are in-memory, per-session only)
**Testing**: Jest (existing test suite in `deep-search/src/__tests__/`)
**Target Platform**: Vercel serverless (Node.js runtime)
**Project Type**: Web application (Next.js monolith in `deep-search/`)
**Performance Goals**: Zero perceptible latency increase; all new programmatic operations < 50ms combined
**Constraints**: No new sequential API calls; entity merge < 20ms; compressed summary ~120 tokens/aspect
**Scale/Scope**: 3-7 Tavily queries per deep research session; 3-4 aspects per research plan

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. User-Centric Design | PASS | Directly improves output quality for users; no UX degradation |
| II. Fast Iteration | PASS | Four independent, incrementally deployable enhancements |
| III. Cost-Effective Operations | PASS | Zero new API calls; piggybacks on existing LLM calls |
| IV. Responsive & Intuitive UI | PASS | Zero latency increase guaranteed by design |
| V. Code Quality | PASS | TypeScript strict mode; extends existing patterns |
| VI. Test-Driven Development | PASS | Unit tests for entity merge, authority tagging, compressed summary |
| VII. Secure & Robust Data Model | PASS | No database changes; in-memory only |
| VIII. Clear Documentation | PASS | CLAUDE.md updates for new pipeline behavior |

**Quality Gates:**

| Gate | Plan |
|------|------|
| Lint | All new code passes `npm run lint` |
| TypeScript | Strict mode, no `any` types |
| Tests | Unit tests for all new pure functions; integration test for pipeline |
| Security | No new external calls; no user input in authority whitelist |
| Documentation | Update `src/lib/CLAUDE.md`, `src/app/api/CLAUDE.md` |

## Project Structure

### Documentation (this feature)

```text
specs/002-deep-research-quality/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── contracts/           # Phase 1 output (internal contracts only)
```

### Source Code (modified files)

```text
deep-search/src/
├── lib/
│   ├── prompts.ts                          # Modified: aspectExtractorPrompt adds entity output
│   ├── types.ts                            # Modified: add ExtractedEntity, authority types
│   ├── entity-merge.ts                     # NEW: mergeEntities() + normalizeEntityName()
│   ├── source-authority.ts                 # NEW: tagSourceAuthority() + AUTHORITY_DOMAINS whitelist
│   └── compressed-summary.ts              # NEW: compressAspectSummary() replacing summarizeExtractedData()
├── app/api/research/
│   ├── extract/route.ts                    # Modified: parse entities from extraction output
│   ├── analyze-gaps/route.ts               # Modified: use compressed summary + entity context
│   └── synthesize/route.ts                 # Modified: accept cross-cutting entities + authority context
└── __tests__/
    └── lib/
        ├── entity-merge.test.ts            # NEW: unit tests for entity merge
        ├── source-authority.test.ts         # NEW: unit tests for authority tagging
        └── compressed-summary.test.ts      # NEW: unit tests for compressed summary
```

**Structure Decision**: All changes fit within the existing Next.js monolith structure. Three new utility modules in `src/lib/` for pure functions, modifications to three existing API routes, and three new test files.

## Complexity Tracking

No constitution violations. No complexity justifications needed.
