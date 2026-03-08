import { tagSourceAuthority, AUTHORITY_DOMAINS } from '@/lib/source-authority';

describe('tagSourceAuthority', () => {
  describe('exact domain matches', () => {
    it('tags arxiv.org as high-authority', () => {
      expect(tagSourceAuthority('https://arxiv.org/abs/2401.12345')).toBe('high-authority');
    });

    it('tags nature.com as high-authority', () => {
      expect(tagSourceAuthority('https://nature.com/articles/s41586-024')).toBe('high-authority');
    });

    it('tags nih.gov as high-authority', () => {
      expect(tagSourceAuthority('https://nih.gov/research')).toBe('high-authority');
    });

    it('tags reuters.com as high-authority', () => {
      expect(tagSourceAuthority('https://reuters.com/technology')).toBe('high-authority');
    });

    it('tags cnbc.com as high-authority', () => {
      expect(tagSourceAuthority('https://cnbc.com/2025/06/12/amd-mi400.html')).toBe('high-authority');
    });

    it('tags forbes.com as high-authority', () => {
      expect(tagSourceAuthority('https://forbes.com/sites/article')).toBe('high-authority');
    });

    it('tags bloomberg.com as high-authority', () => {
      expect(tagSourceAuthority('https://bloomberg.com/news/markets')).toBe('high-authority');
    });

    it('tags consumerreports.org as high-authority', () => {
      expect(tagSourceAuthority('https://consumerreports.org/reviews/backpacks')).toBe('high-authority');
    });

    it('tags lonelyplanet.com as high-authority', () => {
      expect(tagSourceAuthority('https://lonelyplanet.com/mexico/cozumel')).toBe('high-authority');
    });

    it('tags developer.mozilla.org as high-authority via subdomain', () => {
      expect(tagSourceAuthority('https://developer.mozilla.org/en-US/docs/Web/HTTP')).toBe('high-authority');
    });

    it('tags britannica.com as high-authority', () => {
      expect(tagSourceAuthority('https://britannica.com/science/quantum-mechanics')).toBe('high-authority');
    });
  });

  describe('TLD-based rules', () => {
    it('tags .edu domains as high-authority', () => {
      expect(tagSourceAuthority('https://mit.edu/research')).toBe('high-authority');
    });

    it('tags .gov domains as high-authority', () => {
      expect(tagSourceAuthority('https://energy.gov/science')).toBe('high-authority');
    });

    it('tags subdomain .edu as high-authority', () => {
      expect(tagSourceAuthority('https://cs.stanford.edu/people')).toBe('high-authority');
    });

    it('tags subdomain .gov as high-authority', () => {
      expect(tagSourceAuthority('https://data.census.gov/table')).toBe('high-authority');
    });
  });

  describe('subdomain handling', () => {
    it('strips www. prefix and matches', () => {
      expect(tagSourceAuthority('https://www.nature.com/articles')).toBe('high-authority');
    });

    it('matches subdomains of authority domains', () => {
      expect(tagSourceAuthority('https://pubmed.ncbi.nlm.nih.gov/12345')).toBe('high-authority');
    });

    it('matches deep subdomains of authority domains', () => {
      expect(tagSourceAuthority('https://journals.plos.org/plosone')).toBe('high-authority');
    });
  });

  describe('unknown domains return unclassified', () => {
    it('tags random blog as unclassified', () => {
      expect(tagSourceAuthority('https://randomtechblog.com/post')).toBe('unclassified');
    });

    it('tags medium.com as unclassified', () => {
      expect(tagSourceAuthority('https://medium.com/@user/article')).toBe('unclassified');
    });

    it('tags wikipedia as unclassified', () => {
      expect(tagSourceAuthority('https://en.wikipedia.org/wiki/Topic')).toBe('unclassified');
    });

    it('never returns low-authority', () => {
      const result = tagSourceAuthority('https://sketchy-source.xyz/fake');
      expect(result).toBe('unclassified');
      expect(result).not.toBe('low-authority');
    });
  });

  describe('invalid URLs', () => {
    it('returns unclassified for empty string', () => {
      expect(tagSourceAuthority('')).toBe('unclassified');
    });

    it('returns unclassified for malformed URL', () => {
      expect(tagSourceAuthority('not-a-url')).toBe('unclassified');
    });

    it('returns unclassified for relative path', () => {
      expect(tagSourceAuthority('/path/to/page')).toBe('unclassified');
    });
  });

  describe('performance', () => {
    it('completes in <1ms per call', () => {
      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        tagSourceAuthority('https://nature.com/article');
      }
      const elapsed = performance.now() - start;
      const perCall = elapsed / 100;

      expect(perCall).toBeLessThan(1);
    });
  });

  describe('AUTHORITY_DOMAINS set', () => {
    it('contains expected number of domains (40+)', () => {
      expect(AUTHORITY_DOMAINS.size).toBeGreaterThanOrEqual(40);
    });

    it('contains key academic domains', () => {
      expect(AUTHORITY_DOMAINS.has('arxiv.org')).toBe(true);
      expect(AUTHORITY_DOMAINS.has('nature.com')).toBe(true);
      expect(AUTHORITY_DOMAINS.has('ieee.org')).toBe(true);
    });

    it('contains key government domains', () => {
      expect(AUTHORITY_DOMAINS.has('nih.gov')).toBe(true);
      expect(AUTHORITY_DOMAINS.has('nasa.gov')).toBe(true);
    });

    it('contains key financial/news domains', () => {
      expect(AUTHORITY_DOMAINS.has('bloomberg.com')).toBe(true);
      expect(AUTHORITY_DOMAINS.has('wsj.com')).toBe(true);
      expect(AUTHORITY_DOMAINS.has('cnbc.com')).toBe(true);
      expect(AUTHORITY_DOMAINS.has('forbes.com')).toBe(true);
      expect(AUTHORITY_DOMAINS.has('ft.com')).toBe(true);
      expect(AUTHORITY_DOMAINS.has('nytimes.com')).toBe(true);
    });

    it('contains consumer, travel, and reference domains', () => {
      expect(AUTHORITY_DOMAINS.has('consumerreports.org')).toBe(true);
      expect(AUTHORITY_DOMAINS.has('lonelyplanet.com')).toBe(true);
      expect(AUTHORITY_DOMAINS.has('nationalgeographic.com')).toBe(true);
      expect(AUTHORITY_DOMAINS.has('britannica.com')).toBe(true);
    });

    it('contains standards bodies and technical reference', () => {
      expect(AUTHORITY_DOMAINS.has('w3.org')).toBe(true);
      expect(AUTHORITY_DOMAINS.has('ietf.org')).toBe(true);
      expect(AUTHORITY_DOMAINS.has('mozilla.org')).toBe(true);
    });
  });
});
