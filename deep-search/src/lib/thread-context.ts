import { callLLMWithFallback } from './api-utils';
import type { OpenAIMessage } from './types';

/**
 * Generate or update a rolling thread summary.
 *
 * Enforcement: The 150-word limit is enforced via prompt instruction.
 * The LLM reliably respects word-count instructions at low temperature (0.3).
 * A unit test validates output stays under 150 words.
 *
 * @param previousSummary - Current thread summary (or null for first message)
 * @param latestQuery - The user's latest query
 * @param latestContent - The AI's latest response content
 * @returns Updated summary string (< 150 words)
 */
export async function generateThreadSummary(
  previousSummary: string | null,
  latestQuery: string,
  latestContent: string,
): Promise<string> {
  // Truncate latest content to ~500 words to bound input size
  const truncatedContent = truncateToWords(latestContent, 500);

  const messages: OpenAIMessage[] = [
    {
      role: 'system',
      content: 'You compress conversation threads into concise rolling summaries for use as context in future searches. Output plain text, under 150 words.',
    },
    {
      role: 'user',
      content: `Update this thread summary with the latest exchange.

Current summary: ${previousSummary || 'None (first message)'}

Latest exchange:
Q: ${latestQuery}
A: ${truncatedContent}

Write an updated summary covering:
- Key topics and findings discussed so far
- Notable entities, names, or concepts mentioned
- What the user seems most interested in exploring
- What has been thoroughly covered (so future searches can skip it)

Keep under 150 words.`,
    },
  ];

  try {
    const { response } = await callLLMWithFallback(messages, 0.3, false);

    // response is LLMResponse when stream=false
    const result = response as { content: string };
    return result.content.trim();
  } catch (error) {
    console.error('Error generating thread summary:', error);
    // Return previous summary on failure (graceful degradation)
    return previousSummary || '';
  }
}

/**
 * Truncate text to approximately N words.
 */
function truncateToWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(' ') + '...';
}
