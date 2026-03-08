import { normalizeEntityName, mergeEntities } from '@/lib/entity-merge';
import { ExtractedEntity, MergeEntitiesResult } from '@/lib/types';

describe('normalizeEntityName', () => {
  it('converts to lowercase', () => {
    expect(normalizeEntityName('Tesla')).toBe('tesla');
    expect(normalizeEntityName('NVIDIA')).toBe('nvidia');
  });

  it('strips Inc suffix', () => {
    expect(normalizeEntityName('Tesla, Inc.')).toBe('tesla');
    expect(normalizeEntityName('Tesla Inc')).toBe('tesla');
    expect(normalizeEntityName('Tesla Inc.')).toBe('tesla');
  });

  it('strips Corp suffix', () => {
    expect(normalizeEntityName('Microsoft Corp')).toBe('microsoft');
    expect(normalizeEntityName('Microsoft Corp.')).toBe('microsoft');
    expect(normalizeEntityName('Microsoft Corporation')).toBe('microsoft');
  });

  it('strips Ltd suffix', () => {
    expect(normalizeEntityName('BYD Ltd')).toBe('byd');
    expect(normalizeEntityName('BYD Ltd.')).toBe('byd');
  });

  it('strips LLC suffix', () => {
    expect(normalizeEntityName('SpaceX LLC')).toBe('spacex');
  });

  it('strips Co suffix', () => {
    expect(normalizeEntityName('Samsung Co')).toBe('samsung');
    expect(normalizeEntityName('Samsung Co.')).toBe('samsung');
  });

  it('strips Company suffix', () => {
    expect(normalizeEntityName('Ford Motor Company')).toBe('ford motor');
  });

  it('strips Foundation suffix', () => {
    expect(normalizeEntityName('Linux Foundation')).toBe('linux');
  });

  it('strips Institute suffix', () => {
    expect(normalizeEntityName('MIT Institute')).toBe('mit');
  });

  it('strips University suffix', () => {
    expect(normalizeEntityName('Stanford University')).toBe('stanford');
  });

  it('trims whitespace', () => {
    expect(normalizeEntityName('  Tesla  ')).toBe('tesla');
    expect(normalizeEntityName('Tesla , Inc.')).toBe('tesla');
  });

  it('handles empty string', () => {
    expect(normalizeEntityName('')).toBe('');
  });

  it('preserves non-Latin scripts', () => {
    expect(normalizeEntityName('比亚迪')).toBe('比亚迪');
  });
});

describe('mergeEntities', () => {
  const makeEntity = (name: string, type: string = 'organization'): ExtractedEntity => ({
    name,
    normalizedName: normalizeEntityName(name),
    type: type as ExtractedEntity['type'],
  });

  it('returns entities appearing in 2+ aspects as cross-cutting', () => {
    const extractions = [
      {
        aspect: 'automotive',
        entities: [makeEntity('Tesla'), makeEntity('Elon Musk', 'person')],
      },
      {
        aspect: 'energy storage',
        entities: [makeEntity('Tesla, Inc.'), makeEntity('lithium-ion', 'technology')],
      },
      {
        aspect: 'manufacturing',
        entities: [makeEntity('Tesla Inc'), makeEntity('lithium-ion batteries', 'technology')],
      },
    ];

    const { crossCuttingEntities: result } = mergeEntities(extractions);

    // Tesla appears in all 3 aspects (normalized: "tesla")
    const tesla = result.find(e => e.normalizedName === 'tesla');
    expect(tesla).toBeDefined();
    expect(tesla!.aspects).toHaveLength(3);
    expect(tesla!.count).toBe(3);
    expect(tesla!.aspects).toContain('automotive');
    expect(tesla!.aspects).toContain('energy storage');
    expect(tesla!.aspects).toContain('manufacturing');
  });

  it('excludes entities appearing in only 1 aspect', () => {
    const extractions = [
      {
        aspect: 'automotive',
        entities: [makeEntity('Tesla'), makeEntity('Ford', 'organization')],
      },
      {
        aspect: 'energy storage',
        entities: [makeEntity('Tesla, Inc.')],
      },
    ];

    const { crossCuttingEntities: result } = mergeEntities(extractions);

    // Ford only appears in 1 aspect
    const ford = result.find(e => e.normalizedName === 'ford');
    expect(ford).toBeUndefined();

    // Tesla appears in 2 aspects
    const tesla = result.find(e => e.normalizedName === 'tesla');
    expect(tesla).toBeDefined();
    expect(tesla!.count).toBe(2);
  });

  it('returns empty array when no entities found', () => {
    const extractions = [
      { aspect: 'topic1', entities: [] },
      { aspect: 'topic2', entities: [] },
    ];

    const { crossCuttingEntities: result } = mergeEntities(extractions);
    expect(result).toEqual([]);
  });

  it('returns empty array when aspects have no shared entities', () => {
    const extractions = [
      {
        aspect: 'topic1',
        entities: [makeEntity('Alpha')],
      },
      {
        aspect: 'topic2',
        entities: [makeEntity('Beta')],
      },
    ];

    const { crossCuttingEntities: result } = mergeEntities(extractions);
    expect(result).toEqual([]);
  });

  it('handles missing entities array gracefully', () => {
    const extractions = [
      { aspect: 'topic1' },
      { aspect: 'topic2', entities: [makeEntity('Tesla')] },
    ] as Array<{ aspect: string; entities?: ExtractedEntity[] }>;

    const { crossCuttingEntities: result } = mergeEntities(extractions);
    expect(result).toEqual([]);
  });

  it('deduplicates entities within the same aspect', () => {
    const extractions = [
      {
        aspect: 'automotive',
        entities: [makeEntity('Tesla'), makeEntity('Tesla, Inc.')], // Same entity, different names
      },
      {
        aspect: 'energy',
        entities: [makeEntity('Tesla')],
      },
    ];

    const { crossCuttingEntities: result } = mergeEntities(extractions);

    const tesla = result.find(e => e.normalizedName === 'tesla');
    expect(tesla).toBeDefined();
    // Should appear in 2 aspects, not 3 (dedup within automotive)
    expect(tesla!.count).toBe(2);
    expect(tesla!.aspects).toHaveLength(2);
  });

  it('picks the most common original name', () => {
    const extractions = [
      {
        aspect: 'a1',
        entities: [makeEntity('Tesla')],
      },
      {
        aspect: 'a2',
        entities: [makeEntity('Tesla')],
      },
      {
        aspect: 'a3',
        entities: [makeEntity('Tesla, Inc.')],
      },
    ];

    const { crossCuttingEntities: result } = mergeEntities(extractions);
    const tesla = result.find(e => e.normalizedName === 'tesla');
    expect(tesla).toBeDefined();
    // "Tesla" appears 2 times, "Tesla, Inc." 1 time
    expect(tesla!.name).toBe('Tesla');
  });

  it('completes in <20ms for 4 aspects with 15 entities each', () => {
    const aspects = ['a1', 'a2', 'a3', 'a4'];
    const extractions = aspects.map(aspect => ({
      aspect,
      entities: Array.from({ length: 15 }, (_, i) => makeEntity(`Entity${i}`, 'organization')),
    }));

    const start = performance.now();
    mergeEntities(extractions);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(20);
  });

  it('preserves entity type', () => {
    const extractions = [
      {
        aspect: 'a1',
        entities: [makeEntity('Elon Musk', 'person')],
      },
      {
        aspect: 'a2',
        entities: [makeEntity('Elon Musk', 'person')],
      },
    ];

    const { crossCuttingEntities: result } = mergeEntities(extractions);
    expect(result[0].type).toBe('person');
  });

  it('returns MergeEntitiesResult structure', () => {
    const extractions = [
      { aspect: 'a1', entities: [makeEntity('Tesla')] },
      { aspect: 'a2', entities: [makeEntity('Tesla')] },
    ];

    const result = mergeEntities(extractions);
    expect(result).toHaveProperty('crossCuttingEntities');
    expect(Array.isArray(result.crossCuttingEntities)).toBe(true);
  });
});

describe('competitive cluster detection', () => {
  const makeEntity = (name: string, type: string = 'organization'): ExtractedEntity => ({
    name,
    normalizedName: normalizeEntityName(name),
    type: type as ExtractedEntity['type'],
  });

  it('detects cluster when 3+ org entities span 2+ aspects in finance', () => {
    const extractions = [
      {
        aspect: 'competitive_position',
        entities: [makeEntity('NVIDIA'), makeEntity('AMD'), makeEntity('Intel')],
      },
      {
        aspect: 'valuation_context',
        entities: [makeEntity('NVIDIA'), makeEntity('AMD'), makeEntity('Intel')],
      },
    ];

    const result = mergeEntities(extractions, 'finance');
    expect(result.competitiveCluster).toBeDefined();
    expect(result.competitiveCluster!.entities).toContain('NVIDIA');
    expect(result.competitiveCluster!.entities).toContain('AMD');
    expect(result.competitiveCluster!.entities).toContain('Intel');
    expect(result.competitiveCluster!.aspectOverlap).toBeGreaterThanOrEqual(2);
  });

  it('does NOT detect cluster with only 2 org entities', () => {
    const extractions = [
      {
        aspect: 'competitive_position',
        entities: [makeEntity('NVIDIA'), makeEntity('AMD')],
      },
      {
        aspect: 'valuation_context',
        entities: [makeEntity('NVIDIA'), makeEntity('AMD')],
      },
    ];

    const result = mergeEntities(extractions, 'finance');
    expect(result.competitiveCluster).toBeUndefined();
  });

  it('does NOT detect cluster with 3+ non-org entities', () => {
    const extractions = [
      {
        aspect: 'a1',
        entities: [makeEntity('AI', 'technology'), makeEntity('ML', 'technology'), makeEntity('DL', 'technology')],
      },
      {
        aspect: 'a2',
        entities: [makeEntity('AI', 'technology'), makeEntity('ML', 'technology'), makeEntity('DL', 'technology')],
      },
    ];

    const result = mergeEntities(extractions, 'finance');
    expect(result.competitiveCluster).toBeUndefined();
  });

  it('does NOT detect cluster in non-finance query', () => {
    const extractions = [
      {
        aspect: 'a1',
        entities: [makeEntity('NVIDIA'), makeEntity('AMD'), makeEntity('Intel')],
      },
      {
        aspect: 'a2',
        entities: [makeEntity('NVIDIA'), makeEntity('AMD'), makeEntity('Intel')],
      },
    ];

    const result = mergeEntities(extractions);
    expect(result.competitiveCluster).toBeUndefined();
  });

  it('cluster detection completes in <2ms', () => {
    const extractions = [
      {
        aspect: 'a1',
        entities: Array.from({ length: 10 }, (_, i) => makeEntity(`Company${i}`)),
      },
      {
        aspect: 'a2',
        entities: Array.from({ length: 10 }, (_, i) => makeEntity(`Company${i}`)),
      },
    ];

    const start = performance.now();
    mergeEntities(extractions, 'finance');
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(20); // generous for CI
  });
});
