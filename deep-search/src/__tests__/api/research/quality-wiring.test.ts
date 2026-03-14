/**
 * @jest-environment node
 *
 * Integration tests verifying the quality enhancement data flow:
 *   extract → (entities + sourceAuthority) → analyze-gaps → synthesize
 *
 * These tests call real route handlers with mocked LLM to verify
 * that entity, authority, and compressed summary data flows correctly
 * across the pipeline.
 */
import { NextRequest } from 'next/server';

// --- Mocks ---

const mockCallLLM = jest.fn();

jest.mock('@/lib/api-utils', () => ({
  callLLM: (...args: unknown[]) => mockCallLLM(...args),
  getCurrentDate: jest.fn(() => 'Friday, March 7, 2026'),
  getStreamParser: jest.fn(() => async function* mockStreamParser() {
    yield 'Chunk 1';
  }),
  detectLanguage: jest.fn(() => 'English'),
  resolveResponseLanguage: jest.fn(() => 'English'),
}));

jest.mock('@/lib/prompts', () => ({
  aspectExtractorPrompt: jest.fn(() => 'mocked extractor prompt'),
  gapAnalyzerPrompt: jest.fn(() => 'mocked gap analyzer prompt'),
  researchSynthesizerPrompt: jest.fn(() => 'mocked synthesizer prompt'),
  deepResearchSynthesizerPrompt: jest.fn(() => 'mocked deep synthesizer prompt'),
}));

jest.mock('@/lib/cache', () => ({
  generateCacheKey: jest.fn(() => 'test-cache-key'),
  getFromCache: jest.fn(() => Promise.resolve({ data: null, source: 'miss' })),
  setToCache: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => Promise.resolve({})),
}));

jest.mock('@/lib/supabase/usage-tracking', () => ({
  trackServerApiUsage: jest.fn(() => Promise.resolve()),
  estimateTokens: jest.fn(() => 100),
}));

// --- Route imports (after mocks) ---

import { POST as extractPOST } from '@/app/api/research/extract/route';
import { POST as analyzeGapsPOST } from '@/app/api/research/analyze-gaps/route';
import { POST as synthesizePOST } from '@/app/api/research/synthesize/route';
import { mergeEntities } from '@/lib/entity-merge';
import { tagSourceAuthority } from '@/lib/source-authority';
import { CrossCuttingEntity } from '@/lib/types';

// --- Test data ---

const ASPECT_RESULTS = {
  automotive: {
    aspect: 'automotive',
    query: 'tesla automotive impact',
    results: [
      { title: 'Tesla EV Leadership', url: 'https://nature.com/tesla-ev', content: 'Tesla leads EV market with 20% share.' },
      { title: 'EV Market Blog', url: 'https://evblog.example.com/post', content: 'Tesla is expanding into new markets.' },
    ],
  },
  energy: {
    aspect: 'energy storage',
    query: 'tesla energy storage',
    results: [
      { title: 'Grid Storage Paper', url: 'https://ieee.org/grid-storage', content: 'Tesla Megapack deployed at 100+ sites.' },
      { title: 'Energy News', url: 'https://energy-news.example.com/article', content: 'Tesla battery costs declining 15% YoY.' },
    ],
  },
};

function makeLLMExtraction(aspect: string, entities: Array<{ name: string; normalizedName: string; type: string }>) {
  return {
    aspect,
    claims: [
      { statement: `${aspect} claim 1`, sources: [1], confidence: 'established' },
      { statement: `${aspect} claim 2`, sources: [2], confidence: 'emerging' },
    ],
    statistics: [
      { metric: 'Growth', value: '15%', source: 1, year: '2024' },
    ],
    definitions: [],
    expertOpinions: [
      { expert: 'Dr. Smith', opinion: 'Promising outlook', source: 1 },
    ],
    contradictions: [],
    keyInsight: `Key insight about ${aspect}`,
    entities,
  };
}

describe('Quality Enhancement Pipeline Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Extract → Entity + Authority flow', () => {
    it('extract route returns entities and sourceAuthority in response', async () => {
      const extraction = makeLLMExtraction('automotive', [
        { name: 'Tesla, Inc.', normalizedName: 'tesla', type: 'organization' },
        { name: 'Elon Musk', normalizedName: 'elon musk', type: 'person' },
      ]);

      mockCallLLM.mockResolvedValueOnce({ content: JSON.stringify(extraction) });

      const request = new NextRequest('http://localhost/api/research/extract', {
        method: 'POST',
        body: JSON.stringify({
          query: 'tesla impact',
          aspectResult: ASPECT_RESULTS.automotive,
          globalSourceIndex: {},
          provider: 'deepseek',
        }),
      });

      const response = await extractPOST(request);
      const data = await response.json();

      expect(response.status).toBe(200);

      // Entities extracted
      expect(data.extraction.entities).toHaveLength(2);
      expect(data.extraction.entities[0].name).toBe('Tesla, Inc.');
      expect(data.extraction.entities[0].type).toBe('organization');
      expect(data.extraction.entities[1].name).toBe('Elon Musk');

      // Source authority tagged
      expect(data.sourceAuthority).toBeDefined();
      expect(data.sourceAuthority['https://nature.com/tesla-ev']).toBe('high-authority');
      expect(data.sourceAuthority['https://evblog.example.com/post']).toBe('unclassified');
    });

    it('extract route defaults entities to [] on malformed LLM output', async () => {
      const extraction = makeLLMExtraction('automotive', []);
      // Remove entities to simulate LLM not returning them
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (extraction as any).entities;

      mockCallLLM.mockResolvedValueOnce({ content: JSON.stringify(extraction) });

      const request = new NextRequest('http://localhost/api/research/extract', {
        method: 'POST',
        body: JSON.stringify({
          query: 'tesla impact',
          aspectResult: ASPECT_RESULTS.automotive,
          globalSourceIndex: {},
        }),
      });

      const response = await extractPOST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.extraction.entities).toEqual([]);
      // sourceAuthority should still be present
      expect(data.sourceAuthority).toBeDefined();
    });
  });

  describe('Entity merge across aspects', () => {
    it('mergeEntities finds cross-cutting entities from multiple extract responses', async () => {
      // Simulate two extract responses
      const extractions = [
        {
          aspect: 'automotive',
          entities: [
            { name: 'Tesla, Inc.', normalizedName: 'tesla', type: 'organization' as const },
            { name: 'Elon Musk', normalizedName: 'elon musk', type: 'person' as const },
          ],
        },
        {
          aspect: 'energy storage',
          entities: [
            { name: 'Tesla', normalizedName: 'tesla', type: 'organization' as const },
            { name: 'lithium-ion', normalizedName: 'lithium-ion', type: 'technology' as const },
          ],
        },
      ];

      const { crossCuttingEntities: crossCutting } = mergeEntities(extractions);

      // Tesla appears in both aspects
      expect(crossCutting).toHaveLength(1);
      expect(crossCutting[0].normalizedName).toBe('tesla');
      expect(crossCutting[0].aspects).toContain('automotive');
      expect(crossCutting[0].aspects).toContain('energy storage');
      expect(crossCutting[0].count).toBe(2);
    });

    it('tagSourceAuthority correctly classifies mixed sources', () => {
      const sources = [
        { url: 'https://nature.com/tesla-ev' },
        { url: 'https://ieee.org/grid-storage' },
        { url: 'https://evblog.example.com/post' },
        { url: 'https://arxiv.org/abs/2401.001' },
        { url: 'https://mit.edu/research' },
      ];

      const highCount = sources.filter(s => tagSourceAuthority(s.url) === 'high-authority').length;
      const unclassifiedCount = sources.filter(s => tagSourceAuthority(s.url) === 'unclassified').length;

      expect(highCount).toBe(4); // nature, ieee, arxiv, mit.edu
      expect(unclassifiedCount).toBe(1); // evblog
    });
  });

  describe('Analyze-gaps receives entity + authority context', () => {
    it('passes crossCuttingEntities and sourceAuthority to gap analyzer prompt', async () => {
      mockCallLLM.mockResolvedValueOnce({ content: '[]', usage: undefined });

      const crossCuttingEntities: CrossCuttingEntity[] = [
        { name: 'Tesla', normalizedName: 'tesla', type: 'organization', aspects: ['automotive', 'energy storage'], count: 2 },
      ];

      const request = new NextRequest('http://localhost/api/research/analyze-gaps', {
        method: 'POST',
        body: JSON.stringify({
          query: 'tesla impact on energy',
          extractedData: [
            {
              aspect: 'automotive',
              keyInsight: 'Tesla leads EV market',
              claims: [
                { statement: 'Tesla has 20% EV market share', confidence: 'established' },
                { statement: 'EV adoption accelerating', confidence: 'emerging' },
              ],
              statistics: [{ metric: 'Market share', value: '20%', year: '2024' }],
              expertOpinions: [{ expert: 'Dr. Smith', opinion: 'Promising' }],
              contradictions: [],
              entities: [{ normalizedName: 'tesla' }],
            },
          ],
          language: 'English',
          provider: 'deepseek',
          crossCuttingEntities,
          sourceAuthority: { highAuthorityCount: 3, unclassifiedCount: 5 },
        }),
      });

      const response = await analyzeGapsPOST(request);
      expect(response.status).toBe(200);

      // Verify the LLM received entity and authority context
      const llmCall = mockCallLLM.mock.calls[0];
      const userMessage = llmCall[0][1].content as string;

      // Cross-cutting entities included
      expect(userMessage).toContain('Cross-cutting entities');
      expect(userMessage).toContain('Tesla');
      expect(userMessage).toContain('automotive, energy storage');

      // Source authority included
      expect(userMessage).toContain('3 high-authority');
      expect(userMessage).toContain('5 unclassified');
    });

    it('uses compressed summary format with claim counts', async () => {
      mockCallLLM.mockResolvedValueOnce({ content: '[]', usage: undefined });

      const request = new NextRequest('http://localhost/api/research/analyze-gaps', {
        method: 'POST',
        body: JSON.stringify({
          query: 'test topic',
          extractedData: [
            {
              aspect: 'fundamentals',
              keyInsight: 'Key finding',
              claims: [
                { statement: 'Claim A', confidence: 'established' },
                { statement: 'Claim B', confidence: 'established' },
                { statement: 'Claim C', confidence: 'emerging' },
              ],
              statistics: [
                { metric: 'Revenue', value: '$5B', year: '2023' },
                { metric: 'Growth', value: '15%', year: '2025' },
              ],
              expertOpinions: [],
              contradictions: [],
              entities: [],
            },
          ],
          language: 'English',
          provider: 'deepseek',
        }),
      });

      const response = await analyzeGapsPOST(request);
      expect(response.status).toBe(200);

      const llmCall = mockCallLLM.mock.calls[0];
      const userMessage = llmCall[0][1].content as string;

      // Compressed format: structured counts, not raw claim text
      expect(userMessage).toContain('Aspect: fundamentals');
      expect(userMessage).toContain('established');
      expect(userMessage).toContain('Expert opinions:');
      expect(userMessage).toContain('Key finding');
    });
  });

  describe('Synthesize receives entity + authority context', () => {
    it('includes crossCuttingEntities XML in synthesizer prompt', async () => {
      mockCallLLM.mockResolvedValueOnce({ content: '## Synthesis\n\nTesla connects automotive and energy...', usage: undefined });

      const crossCuttingEntities: CrossCuttingEntity[] = [
        { name: 'Tesla', normalizedName: 'tesla', type: 'organization', aspects: ['automotive', 'energy storage'], count: 2 },
        { name: 'lithium-ion', normalizedName: 'lithium-ion', type: 'technology', aspects: ['energy storage', 'manufacturing'], count: 2 },
      ];

      const request = new NextRequest('http://localhost/api/research/synthesize', {
        method: 'POST',
        body: JSON.stringify({
          query: 'tesla impact',
          extractedData: [
            {
              aspect: 'automotive',
              claims: [{ statement: 'Tesla leads EVs', sources: [1], confidence: 'established' }],
              statistics: [],
              definitions: [],
              expertOpinions: [],
              contradictions: [],
              keyInsight: 'EV leadership',
              entities: [],
            },
          ],
          stream: false,
          deep: true,
          provider: 'deepseek',
          crossCuttingEntities,
          sourceAuthority: { highAuthorityCount: 4, unclassifiedCount: 8 },
        }),
      });

      const response = await synthesizePOST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.synthesis).toBeDefined();

      // Verify prompt includes entity XML
      const llmCall = mockCallLLM.mock.calls[0];
      const messages = llmCall[0] as { role: string; content: string }[];
      const userMessage = messages.find(m => m.role === 'user');

      expect(userMessage?.content).toContain('<crossCuttingEntities>');
      expect(userMessage?.content).toContain('Tesla');
      expect(userMessage?.content).toContain('automotive, energy storage');
      expect(userMessage?.content).toContain('<entityInstruction>');

      // Verify authority XML
      expect(userMessage?.content).toContain('<sourceAuthority>');
      expect(userMessage?.content).toContain('highAuthority');
      expect(userMessage?.content).toContain('count="4"');
      expect(userMessage?.content).toContain('<authorityInstruction>');
    });

    it('omits entity/authority XML when not provided', async () => {
      mockCallLLM.mockResolvedValueOnce({ content: 'Plain synthesis', usage: undefined });

      const request = new NextRequest('http://localhost/api/research/synthesize', {
        method: 'POST',
        body: JSON.stringify({
          query: 'generic topic',
          extractedData: [
            {
              aspect: 'overview',
              claims: [],
              statistics: [],
              definitions: [],
              expertOpinions: [],
              contradictions: [],
              keyInsight: 'Overview',
              entities: [],
            },
          ],
          stream: false,
          deep: true,
          provider: 'deepseek',
          // No crossCuttingEntities or sourceAuthority
        }),
      });

      const response = await synthesizePOST(request);
      expect(response.status).toBe(200);

      const llmCall = mockCallLLM.mock.calls[0];
      const messages = llmCall[0] as { role: string; content: string }[];
      const userMessage = messages.find(m => m.role === 'user');

      expect(userMessage?.content).not.toContain('<crossCuttingEntities>');
      expect(userMessage?.content).not.toContain('<sourceAuthority>');
    });
  });

  describe('Full pipeline: extract → merge → analyze-gaps → synthesize', () => {
    it('data flows correctly through all stages', async () => {
      // Stage 1: Extract from two aspects
      const automotiveExtraction = makeLLMExtraction('automotive', [
        { name: 'Tesla, Inc.', normalizedName: 'tesla', type: 'organization' },
        { name: 'Elon Musk', normalizedName: 'elon musk', type: 'person' },
      ]);
      const energyExtraction = makeLLMExtraction('energy storage', [
        { name: 'Tesla', normalizedName: 'tesla', type: 'organization' },
        { name: 'Megapack', normalizedName: 'megapack', type: 'technology' },
      ]);

      mockCallLLM
        .mockResolvedValueOnce({ content: JSON.stringify(automotiveExtraction) })
        .mockResolvedValueOnce({ content: JSON.stringify(energyExtraction) });

      const [autoResponse, energyResponse] = await Promise.all([
        extractPOST(new NextRequest('http://localhost/api/research/extract', {
          method: 'POST',
          body: JSON.stringify({
            query: 'tesla impact',
            aspectResult: ASPECT_RESULTS.automotive,
            globalSourceIndex: {},
            provider: 'deepseek',
          }),
        })),
        extractPOST(new NextRequest('http://localhost/api/research/extract', {
          method: 'POST',
          body: JSON.stringify({
            query: 'tesla impact',
            aspectResult: ASPECT_RESULTS.energy,
            globalSourceIndex: {},
            provider: 'deepseek',
          }),
        })),
      ]);

      const autoData = await autoResponse.json();
      const energyData = await energyResponse.json();

      expect(autoData.extraction.entities).toHaveLength(2);
      expect(energyData.extraction.entities).toHaveLength(2);
      expect(autoData.sourceAuthority).toBeDefined();
      expect(energyData.sourceAuthority).toBeDefined();

      // Stage 2: Merge entities across aspects
      const validExtractions = [autoData.extraction, energyData.extraction];
      const { crossCuttingEntities } = mergeEntities(
        validExtractions as Array<{ aspect: string; entities?: { name: string; normalizedName: string; type: 'person' | 'organization' | 'technology' | 'concept' | 'location' | 'event' }[] }>
      );

      // Tesla appears in both aspects
      expect(crossCuttingEntities.length).toBeGreaterThanOrEqual(1);
      const tesla = crossCuttingEntities.find(e => e.normalizedName === 'tesla');
      expect(tesla).toBeDefined();
      expect(tesla!.count).toBe(2);

      // Compute source authority counts
      const allSourceUrls = [
        ...ASPECT_RESULTS.automotive.results.map(r => r.url),
        ...ASPECT_RESULTS.energy.results.map(r => r.url),
      ];
      const highAuthorityCount = allSourceUrls.filter(url => tagSourceAuthority(url) === 'high-authority').length;
      const unclassifiedCount = allSourceUrls.filter(url => tagSourceAuthority(url) === 'unclassified').length;

      expect(highAuthorityCount).toBe(2); // nature.com, ieee.org
      expect(unclassifiedCount).toBe(2); // evblog, energy-news

      // Stage 3: Analyze gaps with entity + authority context
      const mockGaps = [
        { type: 'missing_comparison', gap: 'No comparison with competitors', query: 'tesla vs competitors energy storage', importance: 'high' },
      ];
      mockCallLLM.mockResolvedValueOnce({ content: JSON.stringify(mockGaps), usage: undefined });

      const gapResponse = await analyzeGapsPOST(new NextRequest('http://localhost/api/research/analyze-gaps', {
        method: 'POST',
        body: JSON.stringify({
          query: 'tesla impact',
          extractedData: validExtractions,
          language: 'English',
          provider: 'deepseek',
          crossCuttingEntities,
          sourceAuthority: { highAuthorityCount, unclassifiedCount },
        }),
      }));

      const gapData = await gapResponse.json();
      expect(gapData.hasGaps).toBe(true);
      expect(gapData.gaps).toHaveLength(1);

      // Verify gap analyzer received entity context
      const gapLLMCall = mockCallLLM.mock.calls[2]; // 3rd call (after 2 extracts)
      const gapUserMsg = gapLLMCall[0][1].content as string;
      expect(gapUserMsg).toContain('Tesla');
      expect(gapUserMsg).toContain('2 high-authority');

      // Stage 4: Synthesize with all context
      mockCallLLM.mockResolvedValueOnce({
        content: '## Tesla Impact\n\nTesla connects automotive and energy storage sectors...',
        usage: undefined,
      });

      const synthResponse = await synthesizePOST(new NextRequest('http://localhost/api/research/synthesize', {
        method: 'POST',
        body: JSON.stringify({
          query: 'tesla impact',
          extractedData: validExtractions,
          stream: false,
          deep: true,
          provider: 'deepseek',
          gapDescriptions: gapData.gaps.map((g: { gap: string }) => g.gap),
          crossCuttingEntities,
          sourceAuthority: { highAuthorityCount, unclassifiedCount },
        }),
      }));

      const synthData = await synthResponse.json();
      expect(synthData.synthesis).toContain('Tesla');

      // Verify synthesizer received all context
      const synthLLMCall = mockCallLLM.mock.calls[3]; // 4th call
      const synthMessages = synthLLMCall[0] as { role: string; content: string }[];
      const synthUserMsg = synthMessages.find(m => m.role === 'user');

      expect(synthUserMsg?.content).toContain('<crossCuttingEntities>');
      expect(synthUserMsg?.content).toContain('Tesla');
      expect(synthUserMsg?.content).toContain('<sourceAuthority>');
      expect(synthUserMsg?.content).toContain(`count="${highAuthorityCount}"`);
    });
  });
});
