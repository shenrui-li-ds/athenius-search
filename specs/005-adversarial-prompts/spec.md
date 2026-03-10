# Feature Specification: Adversarial Evidence Analysis Prompts

**Feature Branch**: `005-adversarial-prompts`
**Created**: 2026-03-10
**Status**: Draft
**Input**: Design discussion on improving search/research quality through adversarial prompt engineering
**Depends on**: None (prompt-only changes in `prompts.ts`, no new API routes or UI changes)

## Overview

Shift LLM prompts from **reporter mode** (summarize what sources say) to **analyst mode** (evaluate evidence quality, challenge weak claims, surface disagreements, assess evidence hierarchy). This is a zero-latency, zero-cost quality upgrade — no additional API calls, no architectural changes, just substantially better prompts.

**Current state**: All prompts treat sources as equally trustworthy and all claims as equally established. A single blog post's prediction gets the same confidence framing as a data point confirmed by 5 independent sources. Contradictions are noted but not analyzed. The model produces smooth, authoritative-sounding output that hides where evidence is thin.

**Target state**: The model actively evaluates evidence strength. Multi-source claims are presented as established. Single-source claims are attributed rather than asserted as fact. Conflicts get real analysis (who says what, which side has stronger evidence). Evidence types are distinguished (data vs. opinion vs. study). Perspective gaps are noted. In deep research, unresolved gaps are honestly acknowledged.

**User benefit**: Users get more trustworthy search results — they can distinguish well-supported facts from single-source claims, see both sides of contested topics, and know when evidence is thin. This reduces the risk of acting on poorly-supported information presented with false confidence.

## Scope

**In scope**: Prompt changes in `deep-search/src/lib/prompts.ts` and one TypeScript interface update in `deep-search/src/app/api/research/extract/route.ts`. Five prompts affected:
1. `aspectExtractorPrompt` (research extraction) — Change 1
2. `researchSynthesizerPrompt` (research synthesis) — Change 2
3. `deepResearchSynthesizerPrompt` (deep research synthesis) — Change 3
4. `gapAnalyzerPrompt` (deep research gap analysis) — Change 4
5. `summarizeSearchResultsPrompt` (web mode) — Change 5

**Out of scope**:
- Brainstorm prompts (intentionally divergent/creative — adversarial constraints would reduce creative output)
- Refine prompt (simple query optimization, wrong place for evidence analysis)
- Proofread prompts (scoped to copy-editing, changing role breaks pipeline contract)
- Any UI changes (output format stays the same — markdown with citations)
- Any new API routes or parallel LLM calls (Phase 2/3 from original brainstorm)

## Design Decisions

### Cross-Model Compatibility

All instructions must work reliably on both fast/lightweight models (Gemini Flash, DeepSeek) and stronger reasoning models (Gemini Pro, GPT-5.4, Claude). This means:
- Use **conditional rules** with concrete triggers ("when only one source supports a claim...")
- Use **countable heuristics** ("2+ sources = established") instead of abstract judgment
- Use **binary/simple classifications** (data_backed vs. opinion) instead of fine-grained taxonomy
- Frame as **constraints** ("do not present as consensus") rather than open-ended reasoning tasks

### Evidence Type Taxonomy

Four types, deliberately simple:
| Type | Definition | Example |
|------|-----------|---------|
| `data` | Includes specific numbers, statistics, dates, measurements | "Revenue grew 25% YoY" |
| `study` | References a named study, paper, survey, or formal research | "A 2024 MIT study found..." |
| `expert_opinion` | Attributed to a named person/org as their view | "CEO stated that..." |
| `anecdotal` | General assertion, user experience, recommendation without hard data | "This is considered the best approach" |

Rationale: These categories are visible in the source text itself — no inference needed. Even Flash-tier models can ask "is there a number in this claim?" to determine the type.

### Adversarial Chain Across Pipeline

The five changes form a chain where upstream improvements create signal that downstream stages consume:

```
Extract (Change 1: confidence criteria + evidenceType)
  -> Claims tagged with reliable confidence levels and evidence types
  -> Contradictions explicitly captured
       |
Gap Analysis (Change 4: contradicted_claim type)
  -> Contradictions become actionable search tasks
  -> Round 2 targets conflict resolution, not just gap-filling
       |
Synthesize (Changes 2 + 3: evidence-weighted analysis)
  -> Evidence hierarchy applied (data > opinion, multi-source > single)
  -> Single-source claims attributed, not asserted
  -> Perspective gaps noted
  -> Unresolved gaps acknowledged honestly
       |
Web Summarize (Change 5: evidence-aware summarization)
  -> Same evidence awareness for lighter-weight web mode
```

---

## Changes

Changes are numbered in upstream-to-downstream pipeline order (matching plan.md phases).

### Change 1: `aspectExtractorPrompt` — Confidence Criteria + Evidence Type Tagging

**Problem**: (a) Confidence labels have no criteria — models default to "established" for everything. (b) Claims carry no metadata about what kind of evidence backs them, so the synthesizer can't distinguish data from opinion.

**Solution (a)**: Add after `<extractionRules>`:

```xml
<confidenceCriteria>
    <level name="established">Supported by 2 or more sources that agree</level>
    <level name="emerging">Supported by only 1 source, or only by very recent sources</level>
    <level name="contested">Sources directly disagree or present opposing positions on this point</level>
</confidenceCriteria>
```

**Solution (b)**: Add `evidenceType` field to claim extraction format:

```json
{"statement": "...", "sources": [1, 2], "confidence": "established|emerging|contested", "evidenceType": "data|study|expert_opinion|anecdotal"}
```

With definitions:
```xml
<evidenceTypes>
    <type name="data">Claim includes specific numbers, statistics, dates, or measurements</type>
    <type name="study">Claim references a named study, paper, survey, or formal research</type>
    <type name="expert_opinion">Claim is attributed to a named person or organization as their view</type>
    <type name="anecdotal">Claim is a general assertion, user experience, or recommendation without hard data</type>
</evidenceTypes>
```

**Impact**: Every research/deep extraction. Accurate confidence labels enable correct downstream hedging. Evidence types give the synthesizer structured signal for evidence weighting.

**TypeScript interface update**: The `ExtractedClaim` interface in `deep-search/src/app/api/research/extract/route.ts` must be updated to include `evidenceType?: 'data' | 'study' | 'expert_opinion' | 'anecdotal'` as an optional field, ensuring type safety for the new extraction schema while maintaining backwards compatibility with cached extractions.

### Change 2: `researchSynthesizerPrompt` — Evidence-Weighted Synthesis

**Problem**: The `<confidenceHandling>` section tells the model how to *phrase* different confidence levels but provides no incentive to actually *evaluate* evidence. The model writes smooth narratives and sprinkles citations decoratively.

**Solution**: Replace `<confidenceHandling>` with `<evidenceEvaluation>`:

```xml
<evidenceEvaluation>
    <principle>Present "established" claims (2+ sources agree) as facts with combined citations</principle>
    <principle>Frame "emerging" claims (single source or recent only) with attribution: "According to [source]..." or "Recent research suggests..."</principle>
    <principle>For "contested" claims, present the strongest evidence on each side rather than just noting disagreement exists. Let the evidence speak.</principle>
    <principle>When a key conclusion rests on a single source, note this explicitly — do not present it as widely supported</principle>
    <principle>Weight evidence by type: data and statistics carry more weight than predictions; named studies carry more weight than unnamed industry reports</principle>
    <principle>If all sources on a subtopic come from a similar perspective (all industry, all academic, all from one country), briefly note this limitation</principle>
</evidenceEvaluation>
```

**Note**: The `<evidenceEvaluation>` section text must be kept in sync between `researchSynthesizerPrompt` (Change 2) and `deepResearchSynthesizerPrompt` (Change 3). Both use the same 6 principles.

**Impact**: Every research search. The model now produces analyst-grade output: evidence hierarchy, single-source flagging, perspective gap detection.

### Change 3: `deepResearchSynthesizerPrompt` — Gap Resolution Honesty + Evidence Evaluation

**Problem**: The deep synthesizer "seamlessly integrates" Round 1 + Round 2 data, which means it papers over gaps that weren't actually resolved and smooths over Round 1 vs Round 2 contradictions.

**Solution**: Add `<gapResolution>` section:

```xml
<gapResolution>
    <principle>For each identified gap that Round 2 addressed, assess whether the new evidence genuinely resolves it or leaves it partially open</principle>
    <principle>If Round 2 evidence contradicts Round 1 findings, highlight the contradiction and analyze which side has stronger evidence rather than silently preferring the newer data</principle>
    <principle>If a gap was identified but Round 2 found little relevant information, briefly acknowledge the limitation rather than omitting the topic entirely</principle>
</gapResolution>
```

Also replace `<confidenceHandling>` with the same `<evidenceEvaluation>` section from Change 2 (same 6 principles, keep text in sync).

**Impact**: Every deep research search. Users get honest assessment of what is well-supported vs. uncertain. False confidence from smooth writing eliminated.

### Change 4: `gapAnalyzerPrompt` — Contradiction-Driven Search

**Problem**: All gap types target *missing* information. None target *conflicting* information that needs resolution. Contradictions detected in extraction become dead data — noted but never acted on.

**Solution**: Add new gap type:

```xml
<type id="contradicted_claim">An important claim where sources directly conflict — targeted search needed to find authoritative resolution</type>
```

Add prioritization rule:

```xml
<rule>If the extracted data contains contradictions on significant claims, prioritize generating a "contradicted_claim" gap with a search query designed to find authoritative or primary sources that can resolve the disagreement</rule>
```

**Impact**: Deep research searches with conflicting sources. Turns passive contradiction detection into active adversarial investigation — Round 2 searches specifically target conflict resolution.

### Change 5: `summarizeSearchResultsPrompt` — Evidence-Aware Summarization

**Problem**: The model treats all sources as equally authoritative and all claims as equally certain. A single analyst's prediction gets identical framing to a data point confirmed by multiple sources.

**Solution**: Add `<evidenceAnalysis>` section after `<requirements>`, before `<formatting>`:

```xml
<evidenceAnalysis>
    <principle>When multiple sources independently confirm a claim, present it as established fact with combined citations: "X is the case [1, 2, 3]."</principle>
    <principle>When only one source supports a significant claim, attribute it rather than stating it as fact: "According to [Source Name] [1]..." or "One analysis suggests..." rather than asserting it as consensus</principle>
    <principle>When sources directly conflict, present both positions with citations: "While [1] reports X, [2] argues Y" — do not silently pick a side</principle>
    <principle>Distinguish between data-backed claims (specific numbers, studies, official statistics) and opinion-based claims (predictions, recommendations, editorials). Present data-backed claims with more confidence than opinions.</principle>
</evidenceAnalysis>
```

Also strengthen `<specialInstructions>` line about conflicting info from:
```xml
<instruction>If information is uncertain or conflicting, acknowledge this clearly</instruction>
```
to:
```xml
<instruction>When sources present conflicting information, present both positions with their respective citations rather than picking one side</instruction>
```

**Source-faithful guardrail**: All evidence evaluation instructions operate on information present in the provided sources. The model should not introduce external claims or speculate beyond what sources contain. Evidence evaluation means better analysis of source material, not injection of outside knowledge.

**Impact**: Every web search. Fewer hallucinated consensus claims. Single-source claims properly attributed. Conflicts analyzed instead of ignored.

---

## Output Length Expectations

Evidence evaluation may increase output length on controversial topics where conflicts need both-sides treatment. Expected ranges:

| Mode | Current Length | Expected Length | Notes |
|------|--------------|-----------------|-------|
| Web | 200-300 words | 200-350 words | Slight increase only when conflicts exist |
| Research | 800-1000 words | 800-1100 words | Attribution phrases add ~10% on contested topics |
| Deep Research | 1000-1200 words | 1000-1300 words | Gap acknowledgment adds modest length |

If output consistently exceeds upper bounds during testing, tighten the word count instructions in the respective prompts.

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Over-hedging on simple factual queries | Low | Instructions are conditional ("when only one source..."). Simple queries have source consensus, so the established-fact path triggers. |
| Weaker models can't follow evidence type classification | Low | Four categories map to visible features in source text (has number? → data). No inference chain needed. |
| Longer output due to "present both sides" | Medium | Only triggers on actual conflicts. Most queries have source agreement. Monitor output length in testing. |
| Cached extractions missing evidenceType field | None | Synthesizer treats missing field as unknown — graceful degradation. Cache TTL is 24h so old extractions expire naturally. |

## Testing Strategy

- Test each change in isolation before combining
- Test with at least 3 providers (Gemini Flash, Gemini Pro, DeepSeek) to verify cross-model consistency
- Compare before/after on queries with known source conflicts (e.g., controversial tech comparisons, contested health claims)
- Compare before/after on simple factual queries to verify no over-hedging
- Verify extraction JSON schema still parses correctly with new evidenceType field
