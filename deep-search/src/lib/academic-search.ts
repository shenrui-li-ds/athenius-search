import { XMLParser } from 'fast-xml-parser';
import { TavilySearchResult, Source } from './types';
import { createApiLogger } from './logger';

type QueryType = 'shopping' | 'travel' | 'technical' | 'academic' | 'explanatory' | 'finance' | 'general';

interface AcademicSearchResult {
  results: TavilySearchResult;
  sources: Source[];
}

const EMPTY_RESULT: AcademicSearchResult = {
  results: { query: '', results: [] },
  sources: [],
};

const ACADEMIC_QUERY_TYPES: QueryType[] = ['academic', 'technical', 'explanatory'];
const FETCH_TIMEOUT_MS = 8000;

// T004
export function reconstructAbstract(invertedIndex: Record<string, number[]> | null): string {
  if (!invertedIndex) return '';

  const words: [number, string][] = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const pos of positions) {
      words.push([pos, word]);
    }
  }
  words.sort((a, b) => a[0] - b[0]);
  return words.map(([, word]) => word).join(' ');
}

// T007
export function shouldSearchAcademic(queryType: QueryType): boolean {
  return ACADEMIC_QUERY_TYPES.includes(queryType);
}

// T005
export async function searchOpenAlex(query: string, maxResults = 5): Promise<AcademicSearchResult> {
  const log = createApiLogger('academic-openalex');

  try {
    const params = new URLSearchParams({
      search: query,
      select: 'id,display_name,abstract_inverted_index,authorships,cited_by_count,publication_date,doi,primary_location,topics',
      per_page: String(maxResults),
      sort: 'relevance_score:desc',
    });

    const mailto = process.env.OPENALEX_MAILTO;
    const apiKey = process.env.OPENALEX_API_KEY;
    if (mailto) params.set('mailto', mailto);
    if (apiKey) params.set('api_key', apiKey);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(`https://api.openalex.org/works?${params}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      log.warn('OpenAlex API error', { status: response.status, query });
      return { ...EMPTY_RESULT, results: { query, results: [] } };
    }

    const data = await response.json();
    const results: TavilySearchResult['results'] = [];
    const sources: Source[] = [];

    for (const work of data.results || []) {
      const abstract = reconstructAbstract(work.abstract_inverted_index);
      const url = work.doi || work.primary_location?.landing_page_url || work.id;
      const authors = (work.authorships || [])
        .map((a: { author: { display_name: string } }) => a.author?.display_name)
        .filter(Boolean);
      const publicationYear = work.publication_date ? new Date(work.publication_date).getFullYear() : undefined;
      const journalName = work.primary_location?.source?.display_name;

      results.push({
        title: work.display_name || 'Untitled',
        url,
        content: abstract || work.display_name || '',
        published_date: work.publication_date,
        author: authors.join(', '),
        source: journalName,
      });

      sources.push({
        id: '',
        title: work.display_name || 'Untitled',
        url,
        iconUrl: '',
        author: authors.join(', '),
        snippet: abstract ? abstract.slice(0, 200) : undefined,
        sourceType: 'academic',
        doi: work.doi,
        citedByCount: work.cited_by_count,
        journalName,
        publicationYear,
      });
    }

    log.info('OpenAlex search completed', { query, resultCount: results.length });
    return { results: { query, results }, sources };
  } catch (error) {
    log.warn('OpenAlex search failed', { query, error: error instanceof Error ? error.message : String(error) });
    return { ...EMPTY_RESULT, results: { query, results: [] } };
  }
}

// T006
export async function searchArxiv(query: string, maxResults = 3): Promise<AcademicSearchResult> {
  const log = createApiLogger('academic-arxiv');

  try {
    const params = new URLSearchParams({
      search_query: `all:${query}`,
      max_results: String(maxResults),
      sortBy: 'relevance',
      sortOrder: 'descending',
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(`http://export.arxiv.org/api/query?${params}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      log.warn('arXiv API error', { status: response.status, query });
      return { ...EMPTY_RESULT, results: { query, results: [] } };
    }

    const xml = await response.text();
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      isArray: (name) => name === 'entry' || name === 'author' || name === 'link',
    });
    const parsed = parser.parse(xml);
    const entries = parsed?.feed?.entry || [];

    const results: TavilySearchResult['results'] = [];
    const sources: Source[] = [];

    for (const entry of entries) {
      const title = (typeof entry.title === 'string' ? entry.title : '').replace(/\s+/g, ' ').trim();
      if (!title) continue;

      const summary = (typeof entry.summary === 'string' ? entry.summary : '').replace(/\s+/g, ' ').trim();
      const authors = (entry.author || [])
        .map((a: { name: string }) => a.name)
        .filter(Boolean);

      const links = entry.link || [];
      const absLink = links.find((l: { '@_rel'?: string; '@_href'?: string }) => l['@_rel'] === 'alternate');
      const url = absLink?.['@_href'] || entry.id || '';

      const published = entry.published;
      const publicationYear = published ? new Date(published).getFullYear() : undefined;
      const category = entry['arxiv:primary_category']?.['@_term'] || '';

      results.push({
        title,
        url,
        content: summary || title,
        published_date: published,
        author: authors.join(', '),
        source: category ? `arXiv [${category}]` : 'arXiv',
      });

      sources.push({
        id: '',
        title,
        url,
        iconUrl: '',
        author: authors.join(', '),
        snippet: summary ? summary.slice(0, 200) : undefined,
        sourceType: 'academic',
        journalName: category ? `arXiv [${category}]` : 'arXiv',
        publicationYear,
      });
    }

    log.info('arXiv search completed', { query, resultCount: results.length });
    return { results: { query, results }, sources };
  } catch (error) {
    log.warn('arXiv search failed', { query, error: error instanceof Error ? error.message : String(error) });
    return { ...EMPTY_RESULT, results: { query, results: [] } };
  }
}

// T008
export async function searchAcademicSources(
  query: string,
  includeArxiv = true,
): Promise<AcademicSearchResult> {
  const log = createApiLogger('academic-search');

  const promises: Promise<AcademicSearchResult>[] = [searchOpenAlex(query)];
  if (includeArxiv) {
    promises.push(searchArxiv(query));
  }

  const settled = await Promise.allSettled(promises);

  const allResults: TavilySearchResult['results'] = [];
  const allSources: Source[] = [];
  const seenUrls = new Set<string>();

  for (const result of settled) {
    if (result.status === 'fulfilled') {
      for (let i = 0; i < result.value.results.results.length; i++) {
        const r = result.value.results.results[i];
        const s = result.value.sources[i];
        if (!seenUrls.has(r.url)) {
          seenUrls.add(r.url);
          allResults.push(r);
          allSources.push(s);
        }
      }
    }
  }

  log.info('Academic search completed', { query, totalResults: allResults.length, includeArxiv });
  return {
    results: { query, results: allResults },
    sources: allSources,
  };
}
