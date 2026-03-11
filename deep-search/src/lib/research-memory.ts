import { callLLMWithFallback } from './api-utils';
import type { OpenAIMessage } from './types';

// ── Types ─────────────────────────────────────────────────────────────

export interface ResearchMemory {
  id: string;
  topicQuery: string;
  researchSummary: string;
  filledGaps: string[];
  openGaps: string[];
  resolvedContradictions: Array<{ topic: string; resolution: string }>;
  keyClaims: Array<{ statement: string; confidence: string }>;
  ageInDays: number;
  searchMode: 'research' | 'deep';
  entities: Array<{ name: string; normalizedName: string; type: string }>;
  sourceCount: number;
}

export interface MemoryRetrievalResult {
  memories: ResearchMemory[];
  hasMemory: boolean;
  expertise?: UserExpertise[];
}

export interface UserExpertise {
  domain: string;
  queryCount: number;
  effectiveLevel: ExpertiseLevel;
  lastSearchedAt: string;
}

export type ExpertiseLevel = 'beginner' | 'intermediate' | 'advanced';

// ── Memory Compression ───────────────────────────────────────────────

/**
 * Compress a synthesis into a ~150-word summary for memory storage.
 * Follows the pattern from thread-context.ts (generateThreadSummary).
 *
 * Uses cheapest provider (DeepSeek), caps input at 1000 words,
 * and skips compression if synthesis is already under 200 words.
 */
export async function compressResearchSummary(
  synthesisContent: string,
  query: string,
): Promise<string> {
  // Skip compression if already short enough
  const wordCount = synthesisContent.split(/\s+/).length;
  if (wordCount <= 200) {
    return synthesisContent.trim();
  }

  // Cap input at 1000 words to bound cost
  const truncated = truncateToWords(synthesisContent, 1000);

  const messages: OpenAIMessage[] = [
    {
      role: 'system',
      content: 'You compress research findings into concise summaries for use as context in future research sessions. Output plain text, under 150 words. Preserve key findings, claims, and conclusions. Do not add commentary.',
    },
    {
      role: 'user',
      content: `Compress this research synthesis on "${query}" into a summary under 150 words. Preserve key findings, notable claims, and conclusions.

Research content:
${truncated}

Write the compressed summary:`,
    },
  ];

  try {
    const { response } = await callLLMWithFallback(messages, 0.3, false, 'deepseek');
    const result = response as { content: string };
    return result.content.trim();
  } catch (error) {
    console.error('Error compressing research summary:', error);
    // Graceful degradation: return truncated original
    return truncateToWords(synthesisContent, 150);
  }
}

// ── Retrieval Formatting ─────────────────────────────────────────────

/**
 * Format retrieved memories as prompt-ready XML for the gap analyzer.
 */
export function formatFilledGapsXML(
  memories: ResearchMemory[],
): string {
  if (!memories.length) return '';

  const gaps = memories.flatMap(m =>
    m.filledGaps.map(gap => `    <gap>${gap}</gap>`)
  );
  if (!gaps.length) return '';

  const oldestAge = Math.max(...memories.map(m => m.ageInDays));

  return `<previouslyFilledGaps age="${oldestAge} days">
    <caveat>The user previously researched a related topic. These gaps were already investigated. Avoid re-suggesting them unless the current data specifically contradicts the prior findings.</caveat>
${gaps.join('\n')}
</previouslyFilledGaps>`;
}

/**
 * Format retrieved memories as prompt-ready XML for the research planner.
 */
export function formatPriorResearchXML(
  memories: ResearchMemory[],
): string {
  if (!memories.length) return '';

  const primary = memories[0];
  return `<priorResearch age="${primary.ageInDays} days" mode="${primary.searchMode}">
    <caveat>This summary is from a previous research session and may be outdated. Generate research angles that COMPLEMENT this prior work rather than repeating it. Focus on what's NEW or DIFFERENT about the current query.</caveat>
    <summary>${primary.researchSummary}</summary>
</priorResearch>`;
}

/**
 * Format retrieved memories as prompt-ready XML for the synthesizer.
 */
export function formatPriorContextXML(
  memories: ResearchMemory[],
): string {
  if (!memories.length) return '';

  const primary = memories[0];

  const contradictions = primary.resolvedContradictions
    .map(c => `        <contradiction topic="${c.topic}" resolution="${c.resolution}" />`)
    .join('\n');

  const contradictionsSection = contradictions
    ? `\n    <resolvedContradictions>\n${contradictions}\n    </resolvedContradictions>`
    : '';

  return `<priorContext age="${primary.ageInDays} days">
    <caveat>The user has prior research on a related topic. Reference it naturally where relevant ("Building on previous findings...") but ALWAYS prefer current sources over stored claims. If current sources contradict stored findings, explicitly note the update.</caveat>
    <summary>${primary.researchSummary}</summary>${contradictionsSection}
</priorContext>`;
}

/**
 * Format user expertise as prompt-ready XML for the synthesizer.
 */
export function formatUserExpertiseXML(
  expertise: UserExpertise | undefined,
): string {
  if (!expertise) return '';

  const hints: Record<ExpertiseLevel, string> = {
    beginner: `The user is new to ${expertise.domain} topics (${expertise.queryCount} sessions). Include definitions and explain key terminology.`,
    intermediate: `The user has moderate experience with ${expertise.domain} topics (${expertise.queryCount} sessions). Brief definitions for complex terms only.`,
    advanced: `The user frequently researches ${expertise.domain} topics (${expertise.queryCount}+ sessions). Skip basic definitions and focus on nuanced analysis. Assume familiarity with standard terminology.`,
  };

  return `<userExpertise>
    <domain>${expertise.domain}</domain>
    <level>${expertise.effectiveLevel}</level>
    <hint>${hints[expertise.effectiveLevel]}</hint>
</userExpertise>`;
}

// ── Expertise Calculation ────────────────────────────────────────────

const EXPERTISE_DECAY_THRESHOLD_DAYS = 90;

/**
 * Calculate effective expertise level from query count and recency.
 * Halves effective query count if last_searched_at > 90 days ago.
 */
export function calculateExpertiseLevel(
  queryCount: number,
  lastSearchedAt: Date | string,
): ExpertiseLevel {
  const lastDate = typeof lastSearchedAt === 'string'
    ? new Date(lastSearchedAt)
    : lastSearchedAt;

  const daysSinceLastSearch = Math.floor(
    (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Apply decay: halve effective count if inactive > 90 days
  const effectiveCount = daysSinceLastSearch > EXPERTISE_DECAY_THRESHOLD_DAYS
    ? Math.floor(queryCount / 2)
    : queryCount;

  if (effectiveCount >= 21) return 'advanced';
  if (effectiveCount >= 6) return 'intermediate';
  return 'beginner';
}

// ── Staleness ────────────────────────────────────────────────────────

/**
 * Calculate age in days from a created_at timestamp.
 */
export function calculateAgeInDays(createdAt: Date | string): number {
  const created = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
  return Math.floor(
    (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24)
  );
}

/**
 * Get TTL in days based on search mode.
 */
export function getTTLDays(searchMode: 'research' | 'deep'): number {
  return searchMode === 'deep' ? 30 : 14;
}

// ── Helpers ──────────────────────────────────────────────────────────

function truncateToWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(' ') + '...';
}
