/**
 * @jest-environment node
 */

import {
  calculateExpertiseLevel,
  calculateAgeInDays,
  getTTLDays,
  formatFilledGapsXML,
  formatPriorResearchXML,
  formatPriorContextXML,
  formatUserExpertiseXML,
  compressResearchSummary,
  type ResearchMemory,
  type UserExpertise,
} from '@/lib/research-memory';

// ── Mock LLM for compression tests ─────────────────────────────────

jest.mock('@/lib/api-utils', () => ({
  callLLMWithFallback: jest.fn(() =>
    Promise.resolve({
      response: { content: 'Compressed summary of research findings about IF.' },
      usedProvider: 'deepseek',
    })
  ),
}));

// ── Expertise Level Calculation ─────────────────────────────────────

describe('calculateExpertiseLevel', () => {
  const recentDate = new Date().toISOString();
  const staleDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(); // 100 days ago

  it('returns beginner for 1-5 queries (recent)', () => {
    expect(calculateExpertiseLevel(1, recentDate)).toBe('beginner');
    expect(calculateExpertiseLevel(5, recentDate)).toBe('beginner');
  });

  it('returns intermediate for 6-20 queries (recent)', () => {
    expect(calculateExpertiseLevel(6, recentDate)).toBe('intermediate');
    expect(calculateExpertiseLevel(20, recentDate)).toBe('intermediate');
  });

  it('returns advanced for 21+ queries (recent)', () => {
    expect(calculateExpertiseLevel(21, recentDate)).toBe('advanced');
    expect(calculateExpertiseLevel(50, recentDate)).toBe('advanced');
  });

  it('halves effective count if last_searched_at > 90 days ago', () => {
    // 12 queries, but stale → effective 6 → intermediate
    expect(calculateExpertiseLevel(12, staleDate)).toBe('intermediate');
    // 10 queries, but stale → effective 5 → beginner
    expect(calculateExpertiseLevel(10, staleDate)).toBe('beginner');
    // 42 queries, but stale → effective 21 → advanced
    expect(calculateExpertiseLevel(42, staleDate)).toBe('advanced');
  });

  it('does not halve if exactly 90 days ago', () => {
    const exactly90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    // 10 queries, 90 days → no decay → intermediate
    expect(calculateExpertiseLevel(10, exactly90)).toBe('intermediate');
  });

  it('accepts Date objects', () => {
    expect(calculateExpertiseLevel(10, new Date())).toBe('intermediate');
  });
});

// ── Staleness Age Calculation ───────────────────────────────────────

describe('calculateAgeInDays', () => {
  it('returns 0 for today', () => {
    expect(calculateAgeInDays(new Date())).toBe(0);
  });

  it('returns correct age for past dates', () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    expect(calculateAgeInDays(fiveDaysAgo)).toBe(5);
  });

  it('accepts ISO string', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(calculateAgeInDays(threeDaysAgo)).toBe(3);
  });
});

// ── TTL ─────────────────────────────────────────────────────────────

describe('getTTLDays', () => {
  it('returns 14 for research mode', () => {
    expect(getTTLDays('research')).toBe(14);
  });

  it('returns 30 for deep mode', () => {
    expect(getTTLDays('deep')).toBe(30);
  });
});

// ── Compression ─────────────────────────────────────────────────────

describe('compressResearchSummary', () => {
  it('skips compression if content is already short', async () => {
    const shortContent = 'This is a short synthesis under 200 words.';
    const result = await compressResearchSummary(shortContent, 'test query');
    expect(result).toBe(shortContent);
  });

  it('calls LLM for long content', async () => {
    const longContent = Array(300).fill('word').join(' ');
    const result = await compressResearchSummary(longContent, 'test query');
    expect(result).toBe('Compressed summary of research findings about IF.');
  });
});

// ── Retrieval Formatting (XML) ──────────────────────────────────────

const mockMemory: ResearchMemory = {
  id: 'test-id',
  topicQuery: 'intermittent fasting health effects',
  researchSummary: 'Prior research found mixed evidence for muscle retention.',
  filledGaps: ['metabolic mechanisms', 'cardiovascular effects'],
  openGaps: ['long-term muscle retention'],
  resolvedContradictions: [
    { topic: 'muscle loss', resolution: 'Minimal impact per 2025 meta-analysis' },
  ],
  keyClaims: [
    { statement: '16:8 IF shows no significant muscle loss', confidence: 'established' },
  ],
  ageInDays: 12,
  searchMode: 'deep',
  entities: [],
  sourceCount: 28,
};

describe('formatFilledGapsXML', () => {
  it('returns empty string for no memories', () => {
    expect(formatFilledGapsXML([])).toBe('');
  });

  it('returns empty string if memories have no filled gaps', () => {
    const noGaps = { ...mockMemory, filledGaps: [] };
    expect(formatFilledGapsXML([noGaps])).toBe('');
  });

  it('includes previouslyFilledGaps XML structure', () => {
    const xml = formatFilledGapsXML([mockMemory]);
    expect(xml).toContain('<previouslyFilledGaps');
    expect(xml).toContain('</previouslyFilledGaps>');
    expect(xml).toContain('age="12 days"');
    expect(xml).toContain('<gap>metabolic mechanisms</gap>');
    expect(xml).toContain('<gap>cardiovascular effects</gap>');
  });

  it('includes caveat about previously investigated gaps', () => {
    const xml = formatFilledGapsXML([mockMemory]);
    expect(xml).toContain('<caveat>');
    expect(xml).toContain('Avoid re-suggesting');
  });
});

describe('formatPriorResearchXML', () => {
  it('returns empty string for no memories', () => {
    expect(formatPriorResearchXML([])).toBe('');
  });

  it('includes priorResearch XML structure', () => {
    const xml = formatPriorResearchXML([mockMemory]);
    expect(xml).toContain('<priorResearch');
    expect(xml).toContain('</priorResearch>');
    expect(xml).toContain('age="12 days"');
    expect(xml).toContain('mode="deep"');
    expect(xml).toContain('<summary>');
    expect(xml).toContain('mixed evidence for muscle retention');
  });

  it('includes caveat about complementary angles', () => {
    const xml = formatPriorResearchXML([mockMemory]);
    expect(xml).toContain('COMPLEMENT');
    expect(xml).toContain('may be outdated');
  });
});

describe('formatPriorContextXML', () => {
  it('returns empty string for no memories', () => {
    expect(formatPriorContextXML([])).toBe('');
  });

  it('includes priorContext XML structure with contradictions', () => {
    const xml = formatPriorContextXML([mockMemory]);
    expect(xml).toContain('<priorContext');
    expect(xml).toContain('</priorContext>');
    expect(xml).toContain('age="12 days"');
    expect(xml).toContain('<summary>');
    expect(xml).toContain('<resolvedContradictions>');
    expect(xml).toContain('topic="muscle loss"');
  });

  it('omits resolvedContradictions when empty', () => {
    const noContradictions = { ...mockMemory, resolvedContradictions: [] };
    const xml = formatPriorContextXML([noContradictions]);
    expect(xml).not.toContain('<resolvedContradictions>');
  });

  it('includes caveat about preferring current sources', () => {
    const xml = formatPriorContextXML([mockMemory]);
    expect(xml).toContain('prefer current sources');
    expect(xml).toContain('explicitly note the update');
  });
});

describe('formatUserExpertiseXML', () => {
  it('returns empty string for undefined expertise', () => {
    expect(formatUserExpertiseXML(undefined)).toBe('');
  });

  it('includes userExpertise XML structure', () => {
    const expertise: UserExpertise = {
      domain: 'finance',
      queryCount: 35,
      effectiveLevel: 'advanced',
      lastSearchedAt: new Date().toISOString(),
    };
    const xml = formatUserExpertiseXML(expertise);
    expect(xml).toContain('<userExpertise>');
    expect(xml).toContain('</userExpertise>');
    expect(xml).toContain('<domain>finance</domain>');
    expect(xml).toContain('<level>advanced</level>');
    expect(xml).toContain('Skip basic definitions');
  });

  it('includes beginner hint for new users', () => {
    const expertise: UserExpertise = {
      domain: 'academic',
      queryCount: 3,
      effectiveLevel: 'beginner',
      lastSearchedAt: new Date().toISOString(),
    };
    const xml = formatUserExpertiseXML(expertise);
    expect(xml).toContain('<level>beginner</level>');
    expect(xml).toContain('Include definitions');
  });
});
