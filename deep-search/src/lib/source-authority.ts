import { SourceAuthority } from '@/lib/types';

// Curated whitelist of known high-authority domains
// Categories: academic publishers, government/institutional, major research orgs, high-quality journalism
export const AUTHORITY_DOMAINS: Set<string> = new Set([
  // Academic publishers
  'arxiv.org',
  'nature.com',
  'sciencedirect.com',
  'springer.com',
  'wiley.com',
  'ieee.org',
  'acm.org',
  'pubmed.ncbi.nlm.nih.gov',
  'scholar.google.com',
  'jstor.org',
  'plos.org',
  'frontiersin.org',
  'mdpi.com',
  'cell.com',
  'thelancet.com',
  'bmj.com',
  'nejm.org',
  'science.org',
  'academic.oup.com',
  'cambridge.org',
  'tandfonline.com',
  'biomedcentral.com',
  'researchgate.net',
  'ssrn.com',
  'semanticscholar.org',
  'cochranelibrary.com',

  // Government / institutional
  'who.int',
  'un.org',
  'worldbank.org',
  'imf.org',
  'oecd.org',
  'europa.eu',

  // Major research organizations
  'nist.gov',
  'nih.gov',
  'cdc.gov',
  'nasa.gov',
  'nsf.gov',
  'epa.gov',
  'fda.gov',

  // High-quality journalism
  'reuters.com',
  'apnews.com',
  'bbc.com',
  'nytimes.com',
  'washingtonpost.com',
  'theguardian.com',
  'economist.com',

  // Financial news & data
  'bloomberg.com',
  'wsj.com',
  'ft.com',
  'cnbc.com',
  'forbes.com',
  'barrons.com',
  'marketwatch.com',
  'sec.gov',

  // Major tech / industry news
  'techcrunch.com',
  'wired.com',
  'arstechnica.com',
  'technologyreview.com',
  'statista.com',

  // Public media (non-profit)
  'npr.org',
  'pbs.org',

  // Consumer testing (independent, non-profit)
  'consumerreports.org',

  // Standards bodies & technical reference
  'w3.org',
  'ietf.org',
  'mozilla.org',

  // Travel & cultural authority
  'lonelyplanet.com',
  'nationalgeographic.com',

  // General reference
  'britannica.com',
  'smithsonianmag.com',
]);

// TLD-based rules for institutional domains
const AUTHORITY_TLDS = ['.edu', '.gov'];

/**
 * Extract the domain from a URL, stripping www. prefix.
 * Returns null if URL is invalid.
 */
function extractDomain(url: string): string | null {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname.startsWith('www.') ? hostname.slice(4) : hostname;
  } catch {
    return null;
  }
}

/**
 * Tag a source URL as 'high-authority' or 'unclassified' based on domain whitelist.
 * Never returns 'low-authority' — unknown domains are simply unclassified (FR-007).
 */
export function tagSourceAuthority(url: string): SourceAuthority {
  const domain = extractDomain(url);
  if (!domain) return 'unclassified';

  // Check exact domain match
  if (AUTHORITY_DOMAINS.has(domain)) return 'high-authority';

  // Check if domain is a subdomain of an authority domain
  for (const authorityDomain of AUTHORITY_DOMAINS) {
    if (domain.endsWith('.' + authorityDomain)) return 'high-authority';
  }

  // Check TLD-based rules (.edu, .gov)
  for (const tld of AUTHORITY_TLDS) {
    if (domain.endsWith(tld)) return 'high-authority';
  }

  return 'unclassified';
}
