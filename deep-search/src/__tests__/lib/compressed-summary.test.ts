import { compressAspectSummary, formatCompressedSummaries } from '@/lib/compressed-summary';
import { CompressedAspectSummary } from '@/lib/types';

// Helper to build a mock extraction
function mockExtraction(overrides: Record<string, unknown> = {}) {
  return {
    aspect: 'fundamentals',
    claims: [
      { statement: 'Claim A', sources: [1, 2], confidence: 'established' as const },
      { statement: 'Claim B', sources: [3], confidence: 'emerging' as const },
      { statement: 'Claim C', sources: [1], confidence: 'established' as const },
      { statement: 'Claim D', sources: [2, 4], confidence: 'contested' as const },
    ],
    statistics: [
      { metric: 'Market size', value: '$5B', source: 1, year: '2023' },
      { metric: 'Growth rate', value: '15%', source: 2, year: '2025' },
      { metric: 'Users', value: '10M', source: 3 },
    ],
    definitions: [{ term: 'Quantum', definition: 'A discrete quantity', source: 1 }],
    expertOpinions: [
      { expert: 'Dr. Smith', opinion: 'This is promising', source: 1 },
      { expert: 'Prof. Jones', opinion: 'More research needed', source: 2 },
    ],
    contradictions: [
      { claim1: 'Market growing', claim2: 'Market shrinking', sources: [1, 3] as [number, number] },
    ],
    keyInsight: 'The market is evolving rapidly',
    entities: [
      { name: 'Tesla', normalizedName: 'tesla', type: 'organization' as const },
      { name: 'AI', normalizedName: 'ai', type: 'technology' as const },
    ],
    ...overrides,
  };
}

// Helper to build mock sources
function mockSources() {
  return [
    { id: '1', title: 'Source 1', url: 'https://nature.com/article1', iconUrl: '' },
    { id: '2', title: 'Source 2', url: 'https://randomsite.com/post', iconUrl: '' },
    { id: '3', title: 'Source 3', url: 'https://arxiv.org/abs/2401.001', iconUrl: '' },
    { id: '4', title: 'Source 4', url: 'https://blog.example.com/entry', iconUrl: '' },
  ];
}

describe('compressAspectSummary', () => {
  it('correctly counts claims by confidence level', () => {
    const result = compressAspectSummary(mockExtraction(), mockSources());
    expect(result.claimsByConfidence).toEqual({
      established: 2,
      emerging: 1,
      contested: 1,
    });
  });

  it('counts statistics and extracts date range', () => {
    const result = compressAspectSummary(mockExtraction(), mockSources());
    expect(result.statisticCount).toBe(3);
    expect(result.statisticDateRange).toBe('2023-2025');
  });

  it('handles statistics with no year', () => {
    const result = compressAspectSummary(
      mockExtraction({ statistics: [{ metric: 'Count', value: '10', source: 1 }] }),
      mockSources()
    );
    expect(result.statisticDateRange).toBeNull();
  });

  it('counts expert opinions', () => {
    const result = compressAspectSummary(mockExtraction(), mockSources());
    expect(result.expertOpinionCount).toBe(2);
  });

  it('counts contradictions and includes briefs (max 3)', () => {
    const result = compressAspectSummary(mockExtraction(), mockSources());
    expect(result.contradictionCount).toBe(1);
    expect(result.contradictionBriefs).toHaveLength(1);
    expect(result.contradictionBriefs[0]).toContain('Market growing');
  });

  it('limits contradiction briefs to 3', () => {
    const manyContradictions = [
      { claim1: 'A1', claim2: 'A2', sources: [1, 2] as [number, number] },
      { claim1: 'B1', claim2: 'B2', sources: [1, 2] as [number, number] },
      { claim1: 'C1', claim2: 'C2', sources: [1, 2] as [number, number] },
      { claim1: 'D1', claim2: 'D2', sources: [1, 2] as [number, number] },
    ];
    const result = compressAspectSummary(
      mockExtraction({ contradictions: manyContradictions }),
      mockSources()
    );
    expect(result.contradictionCount).toBe(4);
    expect(result.contradictionBriefs).toHaveLength(3);
  });

  it('computes source authority distribution', () => {
    const result = compressAspectSummary(mockExtraction(), mockSources());
    expect(result.sourceAuthority.highAuthority).toBe(2); // nature.com, arxiv.org
    expect(result.sourceAuthority.unclassified).toBe(2);  // randomsite.com, blog.example.com
  });

  it('includes entity names', () => {
    const result = compressAspectSummary(mockExtraction(), mockSources());
    expect(result.entities).toContain('tesla');
    expect(result.entities).toContain('ai');
  });

  it('identifies weak areas', () => {
    const result = compressAspectSummary(
      mockExtraction({ expertOpinions: [], contradictions: [] }),
      [{ id: '1', title: 'Blog', url: 'https://blog.com/post', iconUrl: '' }]
    );
    expect(result.weakAreas.length).toBeGreaterThan(0);
  });

  it('limits weak areas to 3', () => {
    const result = compressAspectSummary(
      mockExtraction({
        expertOpinions: [],
        contradictions: [],
        statistics: [],
        claims: [{ statement: 'Only one', sources: [1], confidence: 'emerging' }],
      }),
      [{ id: '1', title: 'Blog', url: 'https://blog.com/post', iconUrl: '' }]
    );
    expect(result.weakAreas.length).toBeLessThanOrEqual(3);
  });

  it('preserves keyInsight', () => {
    const result = compressAspectSummary(mockExtraction(), mockSources());
    expect(result.keyInsight).toBe('The market is evolving rapidly');
  });

  it('preserves aspect name', () => {
    const result = compressAspectSummary(mockExtraction(), mockSources());
    expect(result.aspect).toBe('fundamentals');
  });

  it('completes in <5ms per aspect', () => {
    const start = performance.now();
    compressAspectSummary(mockExtraction(), mockSources());
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(5);
  });

  it('handles empty extraction gracefully', () => {
    const result = compressAspectSummary(
      mockExtraction({
        claims: [],
        statistics: [],
        definitions: [],
        expertOpinions: [],
        contradictions: [],
        entities: [],
      }),
      []
    );
    expect(result.claimsByConfidence).toEqual({ established: 0, emerging: 0, contested: 0 });
    expect(result.statisticCount).toBe(0);
    expect(result.expertOpinionCount).toBe(0);
  });
});

describe('compressAspectSummary with finance queryType', () => {
  it('detects no valuation data when valuationData is empty', () => {
    const result = compressAspectSummary(
      mockExtraction({ valuationData: [] }),
      mockSources(),
      'finance'
    );
    expect(result.weakAreas).toContain('No valuation data');
    expect(result.valuationDataCount).toBe(0);
  });

  it('detects no analyst views when expertOpinions empty in finance context', () => {
    const result = compressAspectSummary(
      mockExtraction({ expertOpinions: [] }),
      mockSources(),
      'finance'
    );
    expect(result.weakAreas).toContain('No analyst views');
  });

  it('detects no risk assessment when riskFactors is empty', () => {
    const result = compressAspectSummary(
      mockExtraction({ riskFactors: [] }),
      mockSources(),
      'finance'
    );
    expect(result.weakAreas).toContain('No risk assessment');
    expect(result.riskFactorCount).toBe(0);
  });

  it('detects no competitive comparison when single org entity', () => {
    const result = compressAspectSummary(
      mockExtraction({
        entities: [{ name: 'Tesla', normalizedName: 'tesla', type: 'organization' }],
      }),
      mockSources(),
      'finance'
    );
    expect(result.weakAreas).toContain('No competitive comparison');
  });

  it('does NOT flag competitive comparison when multiple org entities', () => {
    const result = compressAspectSummary(
      mockExtraction({
        entities: [
          { name: 'Tesla', normalizedName: 'tesla', type: 'organization' },
          { name: 'Ford', normalizedName: 'ford', type: 'organization' },
        ],
      }),
      mockSources(),
      'finance'
    );
    expect(result.weakAreas).not.toContain('No competitive comparison');
  });

  it('non-finance queries use generic weak areas only', () => {
    const result = compressAspectSummary(
      mockExtraction({ expertOpinions: [], riskFactors: [], valuationData: [] }),
      mockSources()
    );
    // Should have generic 'No expert opinions' but NOT finance-specific labels
    expect(result.weakAreas).toContain('No expert opinions');
    expect(result.weakAreas).not.toContain('No analyst views');
    expect(result.weakAreas).not.toContain('No valuation data');
    expect(result.weakAreas).not.toContain('No risk assessment');
  });

  it('includes finance-specific counts in output', () => {
    const result = compressAspectSummary(
      mockExtraction({
        financialMetrics: [
          { metric: 'Revenue', value: '$26B', period: 'Q3 2024', context: 'Record' },
          { metric: 'EPS', value: '$6.12', period: 'Q3 2024', context: 'Beat' },
        ],
        valuationData: [
          { metric: 'P/E', currentValue: '65' },
        ],
        riskFactors: [
          { factor: 'Supply chain', type: 'risk', severity: 'high', description: 'TSMC dependency' },
          { factor: 'AI demand', type: 'opportunity', severity: 'medium', description: 'Growing' },
          { factor: 'Regulation', type: 'risk', severity: 'low', description: 'EU AI Act' },
        ],
      }),
      mockSources(),
      'finance'
    );
    expect(result.financialMetricCount).toBe(2);
    expect(result.valuationDataCount).toBe(1);
    expect(result.riskFactorCount).toBe(3);
  });

  it('defaults finance counts to 0 when fields absent', () => {
    const result = compressAspectSummary(
      mockExtraction(),
      mockSources(),
      'finance'
    );
    expect(result.financialMetricCount).toBe(0);
    expect(result.valuationDataCount).toBe(0);
    expect(result.riskFactorCount).toBe(0);
  });
});

describe('formatCompressedSummaries', () => {
  it('formats summaries as text for gap analyzer prompt', () => {
    const summaries: CompressedAspectSummary[] = [
      {
        aspect: 'fundamentals',
        claimsByConfidence: { established: 3, emerging: 1, contested: 0 },
        statisticCount: 2,
        statisticDateRange: '2022-2024',
        expertOpinionCount: 1,
        contradictionCount: 0,
        contradictionBriefs: [],
        sourceAuthority: { highAuthority: 2, unclassified: 3 },
        entities: ['tesla', 'ai'],
        weakAreas: ['No contradictions identified'],
        keyInsight: 'AI is transforming the industry',
      },
    ];

    const formatted = formatCompressedSummaries(summaries);
    expect(formatted).toContain('fundamentals');
    expect(formatted).toContain('3 established');
    expect(formatted).toContain('2022-2024');
    expect(formatted).toContain('tesla');
    expect(formatted).toContain('ai');
    expect(formatted).toContain('high-authority');
  });

  it('produces output under ~150 tokens per aspect', () => {
    const summaries: CompressedAspectSummary[] = [
      {
        aspect: 'test-aspect',
        claimsByConfidence: { established: 5, emerging: 2, contested: 1 },
        statisticCount: 4,
        statisticDateRange: '2022-2025',
        expertOpinionCount: 2,
        contradictionCount: 1,
        contradictionBriefs: ['Growth vs decline debate'],
        sourceAuthority: { highAuthority: 3, unclassified: 5 },
        entities: ['alpha', 'beta', 'gamma'],
        weakAreas: ['No academic sources', 'Missing expert opinions on cost'],
        keyInsight: 'Key finding about the topic',
      },
    ];

    const formatted = formatCompressedSummaries(summaries);
    // Rough token estimate: ~4 chars per token
    const estimatedTokens = formatted.length / 4;
    expect(estimatedTokens).toBeLessThan(150);
  });

  it('handles multiple summaries', () => {
    const summaries: CompressedAspectSummary[] = [
      {
        aspect: 'aspect-1',
        claimsByConfidence: { established: 1, emerging: 0, contested: 0 },
        statisticCount: 0,
        statisticDateRange: null,
        expertOpinionCount: 0,
        contradictionCount: 0,
        contradictionBriefs: [],
        sourceAuthority: { highAuthority: 0, unclassified: 1 },
        entities: [],
        weakAreas: [],
        keyInsight: 'Insight 1',
      },
      {
        aspect: 'aspect-2',
        claimsByConfidence: { established: 2, emerging: 1, contested: 0 },
        statisticCount: 1,
        statisticDateRange: '2024',
        expertOpinionCount: 1,
        contradictionCount: 0,
        contradictionBriefs: [],
        sourceAuthority: { highAuthority: 1, unclassified: 2 },
        entities: ['entity-x'],
        weakAreas: [],
        keyInsight: 'Insight 2',
      },
    ];

    const formatted = formatCompressedSummaries(summaries);
    expect(formatted).toContain('aspect-1');
    expect(formatted).toContain('aspect-2');
  });
});
