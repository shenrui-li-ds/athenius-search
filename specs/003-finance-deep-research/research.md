# Research Notes: Finance-Aware Deep Research Enhancement

**Date**: 2026-03-07
**Source**: Analysis of `/Users/shenruili/Documents/GitHub/investment-notes` project

## Origin

These 5 patterns were identified by thoroughly reviewing the investment-notes project — a Claude Code-based investment research system with modular templates, parallel agent orchestration, and structured scoring frameworks. The analysis focused on what patterns could enhance athenius-search's finance-related deep research while respecting zero-latency and cost-efficiency constraints.

## Pattern Analysis

### Pattern 1: Finance Sub-Classification (from investment-notes Gate 0 / Archetype Classification)

**Source**: `investment-notes/templates/0-gates.md` — Gate 1 classifies stocks into archetypes (Structural Compounder, Moonshot/Disruptor, Cyclical, Thematic, Turnaround) and routes to completely different analytical frameworks.

**Adaptation**: Athenius doesn't need the full archetype system (that's for investment decisions). Instead, we borrow the core insight: different finance query types need different research angles. A stock analysis needs competitive positioning and valuation context; a macro query needs leading indicators and historical parallels. The current `researchPlannerFinancePrompt` uses one-size-fits-all aspects.

**Decision**: Implement sub-type detection via keyword matching in the planner prompt function. Sub-types: stock_analysis, macro, personal_finance, crypto, general_finance. Each sub-type gets tailored aspect strategies.

**Rejected alternatives**:
- Full archetype classification (too complex, investment-advice territory)
- LLM-based sub-classification (would add latency via new API call)
- Router prompt modification (would affect all query types, not just finance)

### Pattern 2: Structured Finance Extraction (from investment-notes Agent Prompts)

**Source**: `investment-notes/.claude/skills/research-company/AGENT-PROMPTS.md` — Each specialized agent (Financial Performance, Competitive Position, etc.) extracts data into strict structured formats. Financial metrics always include source, period, and comparison context. Every number must have a hyperlinked source.

**Adaptation**: Athenius can't enforce source linking (the LLM extracts from pre-fetched search results), but we can borrow the structured extraction schema. Instead of burying "Revenue $26.97B" in a generic claim, extract it as `{metric: "Revenue", value: "$26.97B", period: "Q4 2024", context: "YoY growth 22%"}`. This structure feeds better gap analysis and synthesis.

**Decision**: Add `financialMetrics`, `valuationData`, and `riskFactors` arrays to the extraction output schema for finance queries. All default to `[]`.

**Rejected alternatives**:
- Adding all investment-notes agent categories (too many — 6 agents × structured fields each)
- Requiring source validation (can't validate LLM-extracted data without additional API calls)

### Pattern 3: Finance-Aware Weak Areas (from investment-notes Scorecard System)

**Source**: `investment-notes/templates/4-scorecard.md` — The scorecard evaluates 13 specific dimensions (Circle of Competence, Kill Switch Risk, Moat Quality, etc.) and identifies exactly which areas need attention.

**Adaptation**: Athenius's `compressAspectSummary()` already identifies weak areas, but they're generic ("No expert opinions", "Few claims"). For finance queries, we can detect domain-specific gaps: no valuation data, no analyst views, no risk assessment, no competitive comparison. These labels help the gap analyzer generate more targeted Round 2 queries.

**Decision**: Add finance-specific weak area checks conditional on `queryType === 'finance'`.

### Pattern 4: Competitive Cluster Detection (from investment-notes Competitive Analysis)

**Source**: `investment-notes/templates/1-phase1-core.md` — Always includes competitive KPI comparison tables. `investment-notes/.claude/skills/research-company/AGENT-PROMPTS.md` — The Competitive Position Agent creates structured comparison tables with specific metrics per competitor.

**Adaptation**: Athenius's entity merge already identifies cross-cutting entities. When 3+ organizations appear across aspects in a finance query, this strongly signals a competitive landscape. Rather than just listing them as cross-cutting entities, we flag them as a "competitive cluster" and instruct the synthesizer to create comparison tables.

**Decision**: Add cluster detection as a post-processing step in `mergeEntities()` for finance queries. Threshold: 3+ organization-type entities across 2+ aspects.

### Pattern 5: Bear Case / Contrarian View (from investment-notes Synthesis Template)

**Source**: `investment-notes/templates/6-synthesis.md` — Requires a mandatory "Bear Case / Negative Research Review" section with structured bear arguments, rebuttals, and thesis impact assessment. Also includes "Anti-Thesis" with measurable failure conditions.

**Adaptation**: Athenius shouldn't provide investment advice or buy/sell recommendations, but presenting both sides of a financial topic is fundamental to quality research. The synthesizer should dedicate a section to risks and contrarian arguments for finance queries. This is a prompt-only change.

**Decision**: Add `<bearCaseInstruction>` XML section to `deepResearchSynthesizerPrompt` when `queryType === 'finance'`. Use collapsible section format to avoid making the output too long.

**Rejected alternatives**:
- Full thesis/anti-thesis framework (investment advice territory)
- Separate bear case API call (violates zero-latency constraint)
- Bear case for all query types (only relevant for finance/investment topics)

## Latency Analysis

| Pattern | Type | Latency Impact |
|---------|------|---------------|
| Finance sub-classification | Programmatic (regex) | < 1ms |
| Structured extraction schema | Prompt modification | 0ms (processed in existing LLM call) |
| Finance-aware weak areas | Programmatic (conditionals) | < 1ms |
| Competitive cluster detection | Programmatic (array filter) | < 1ms |
| Bear case synthesis instruction | Prompt modification | 0ms (processed in existing LLM call) |
| **Total** | | **< 5ms** |

## Cost Analysis

| Pattern | Additional Tokens |
|---------|------------------|
| Sub-type-specific planner prompt | ~0 (different text, same length) |
| Finance extraction schema additions | ~100-150 tokens added to extractor prompt |
| Finance extraction output additions | ~100-200 tokens additional output per aspect |
| Bear case synthesis instruction | ~80 tokens added to synthesizer prompt |
| **Total per deep research session** | **~500-800 additional tokens** |

At typical LLM pricing ($0.15-1.00/M tokens), this adds < $0.001 per deep research session.

## What We Deliberately Did NOT Borrow

| Investment-Notes Pattern | Why Not |
|--------------------------|---------|
| Full archetype routing (5 archetypes × separate templates) | Too complex; sub-type aspects achieve 80% of the value |
| Parallel agent orchestration (5-6 specialized agents) | Athenius already does parallel search across aspects |
| Position sizing / scoring matrices | Investment advice territory |
| SEC filing fetching (10-K, 10-Q, DEF 14A) | Would require new APIs, adding latency and cost |
| Human-in-the-loop gates | Web search is fully automated |
| Agent Summary / TLDR caching | Would require new API call to generate; defer to future spec |
| Template-based modular output (13 files) | Athenius produces a single synthesis document |
| Inline citation with page numbers | Can't validate without additional API calls |
