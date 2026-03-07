import { reconstructAbstract, shouldSearchAcademic, searchOpenAlex, searchArxiv, searchAcademicSources } from '@/lib/academic-search';

// Mock logger
jest.mock('@/lib/logger', () => ({
  createApiLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

describe('reconstructAbstract', () => {
  it('returns empty string for null input', () => {
    expect(reconstructAbstract(null)).toBe('');
  });

  it('reconstructs abstract from inverted index', () => {
    const index = {
      'This': [0],
      'is': [1],
      'a': [2],
      'test': [3],
      'abstract': [4],
    };
    expect(reconstructAbstract(index)).toBe('This is a test abstract');
  });

  it('handles words appearing at multiple positions', () => {
    const index = {
      'the': [0, 4],
      'cat': [1],
      'sat': [2],
      'on': [3],
      'mat': [5],
    };
    expect(reconstructAbstract(index)).toBe('the cat sat on the mat');
  });

  it('handles empty inverted index', () => {
    expect(reconstructAbstract({})).toBe('');
  });
});

describe('shouldSearchAcademic', () => {
  it('returns true for academic query types', () => {
    expect(shouldSearchAcademic('academic')).toBe(true);
    expect(shouldSearchAcademic('technical')).toBe(true);
    expect(shouldSearchAcademic('explanatory')).toBe(true);
  });

  it('returns false for non-academic query types', () => {
    expect(shouldSearchAcademic('shopping')).toBe(false);
    expect(shouldSearchAcademic('travel')).toBe(false);
    expect(shouldSearchAcademic('finance')).toBe(false);
    expect(shouldSearchAcademic('general')).toBe(false);
  });
});

const mockOpenAlexResponse = {
  meta: { count: 1, per_page: 5, page: 1 },
  results: [
    {
      id: 'https://openalex.org/W123',
      display_name: 'Quantum Error Correction',
      abstract_inverted_index: { 'Quantum': [0], 'computing': [1], 'requires': [2], 'error': [3], 'correction': [4] },
      authorships: [{ author: { display_name: 'Alice Smith' } }],
      cited_by_count: 150,
      publication_date: '2024-03-15',
      doi: 'https://doi.org/10.1234/example',
      primary_location: {
        landing_page_url: 'https://journal.example.com/paper',
        source: { display_name: 'Nature Physics' },
      },
      topics: [{ display_name: 'Quantum Computing' }],
    },
  ],
};

const mockArxivXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom">
  <entry>
    <id>http://arxiv.org/abs/2401.12345v1</id>
    <title>Quantum Error Correction Preprint</title>
    <summary>A preprint about quantum error correction techniques.</summary>
    <author><name>Bob Jones</name></author>
    <published>2024-01-15T00:00:00Z</published>
    <link href="http://arxiv.org/abs/2401.12345v1" rel="alternate"/>
    <link href="http://arxiv.org/pdf/2401.12345v1" rel="related" title="pdf"/>
    <arxiv:primary_category term="cs.AI"/>
  </entry>
</feed>`;

describe('searchOpenAlex', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('converts OpenAlex response to standard format', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockOpenAlexResponse),
    });

    const result = await searchOpenAlex('quantum error correction');

    expect(result.results.results).toHaveLength(1);
    expect(result.results.results[0].title).toBe('Quantum Error Correction');
    expect(result.results.results[0].url).toBe('https://doi.org/10.1234/example');
    expect(result.results.results[0].content).toBe('Quantum computing requires error correction');

    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].sourceType).toBe('academic');
    expect(result.sources[0].doi).toBe('https://doi.org/10.1234/example');
    expect(result.sources[0].citedByCount).toBe(150);
    expect(result.sources[0].journalName).toBe('Nature Physics');
    expect(result.sources[0].publicationYear).toBe(2024);
  });

  it('returns empty results on API failure', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });

    const result = await searchOpenAlex('test query');
    expect(result.results.results).toHaveLength(0);
    expect(result.sources).toHaveLength(0);
  });

  it('returns empty results on network error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    const result = await searchOpenAlex('test query');
    expect(result.results.results).toHaveLength(0);
    expect(result.sources).toHaveLength(0);
  });
});

describe('searchArxiv', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('converts arXiv XML response to standard format', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockArxivXml),
    });

    const result = await searchArxiv('quantum error correction');

    expect(result.results.results).toHaveLength(1);
    expect(result.results.results[0].title).toBe('Quantum Error Correction Preprint');
    expect(result.results.results[0].url).toBe('http://arxiv.org/abs/2401.12345v1');
    expect(result.results.results[0].author).toBe('Bob Jones');

    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].sourceType).toBe('academic');
    expect(result.sources[0].journalName).toBe('arXiv [cs.AI]');
    expect(result.sources[0].publicationYear).toBe(2024);
  });

  it('returns empty results on API failure', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });

    const result = await searchArxiv('test query');
    expect(result.results.results).toHaveLength(0);
  });

  it('returns empty results on network error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    const result = await searchArxiv('test query');
    expect(result.results.results).toHaveLength(0);
  });
});

describe('searchAcademicSources', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('combines results from OpenAlex and arXiv', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockOpenAlexResponse),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockArxivXml),
      });

    const result = await searchAcademicSources('quantum error correction');
    expect(result.results.results).toHaveLength(2);
    expect(result.sources).toHaveLength(2);
  });

  it('deduplicates by URL', async () => {
    const duplicateArxivXml = mockArxivXml.replaceAll(
      'http://arxiv.org/abs/2401.12345v1',
      'https://doi.org/10.1234/example',
    );
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockOpenAlexResponse),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(duplicateArxivXml),
      });

    const result = await searchAcademicSources('quantum error correction');
    expect(result.results.results).toHaveLength(1);
  });

  it('skips arXiv when includeArxiv is false', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockOpenAlexResponse),
    });

    const result = await searchAcademicSources('quantum', false);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result.results.results).toHaveLength(1);
  });

  it('returns partial results when one API fails', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockOpenAlexResponse),
      })
      .mockRejectedValueOnce(new Error('arXiv down'));

    const result = await searchAcademicSources('quantum');
    expect(result.results.results).toHaveLength(1);
  });
});
