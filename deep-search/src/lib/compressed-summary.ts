import { CompressedAspectSummary } from '@/lib/types';
import { tagSourceAuthority } from '@/lib/source-authority';

interface ExtractionForSummary {
  aspect: string;
  claims?: Array<{ confidence?: string }>;
  statistics?: Array<{ year?: string }>;
  expertOpinions?: unknown[];
  contradictions?: Array<{ claim1: string; claim2: string }>;
  entities?: Array<{ normalizedName: string }>;
  keyInsight?: string;
}

interface SourceForSummary {
  url: string;
}

/**
 * Compress an aspect extraction into a structured summary (~120 tokens).
 * Internally calls tagSourceAuthority() on each source URL.
 * Performance: <5ms per aspect.
 */
export function compressAspectSummary(
  extraction: ExtractionForSummary,
  sources: SourceForSummary[]
): CompressedAspectSummary {
  const claims = extraction.claims || [];
  const statistics = extraction.statistics || [];
  const expertOpinions = extraction.expertOpinions || [];
  const contradictions = extraction.contradictions || [];
  const entities = extraction.entities || [];

  // Count claims by confidence level
  const claimsByConfidence = { established: 0, emerging: 0, contested: 0 };
  for (const claim of claims) {
    const conf = claim.confidence as keyof typeof claimsByConfidence;
    if (conf in claimsByConfidence) {
      claimsByConfidence[conf]++;
    }
  }

  // Compute statistic date range
  const years = statistics
    .map(s => s.year)
    .filter((y): y is string => !!y)
    .map(y => parseInt(y, 10))
    .filter(y => !isNaN(y));

  let statisticDateRange: string | null = null;
  if (years.length > 0) {
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);
    statisticDateRange = minYear === maxYear ? String(minYear) : `${minYear}-${maxYear}`;
  }

  // Contradiction briefs (max 3)
  const contradictionBriefs = contradictions
    .slice(0, 3)
    .map(c => `${c.claim1} vs ${c.claim2}`);

  // Source authority distribution
  let highAuthority = 0;
  let unclassified = 0;
  for (const source of sources) {
    if (tagSourceAuthority(source.url) === 'high-authority') {
      highAuthority++;
    } else {
      unclassified++;
    }
  }

  // Entity names
  const entityNames = entities.map(e => e.normalizedName);

  // Identify weak areas (max 3)
  const weakAreas: string[] = [];
  if (expertOpinions.length === 0) {
    weakAreas.push('No expert opinions');
  }
  if (highAuthority === 0 && sources.length > 0) {
    weakAreas.push('No high-authority sources');
  }
  if (claims.length < 3) {
    weakAreas.push('Few claims extracted');
  }
  if (statistics.length === 0) {
    weakAreas.push('No statistics');
  }
  if (contradictions.length > 0 && contradictions.length > claims.length / 3) {
    weakAreas.push('High contradiction ratio');
  }

  return {
    aspect: extraction.aspect,
    claimsByConfidence,
    statisticCount: statistics.length,
    statisticDateRange,
    expertOpinionCount: expertOpinions.length,
    contradictionCount: contradictions.length,
    contradictionBriefs,
    sourceAuthority: { highAuthority, unclassified },
    entities: entityNames,
    weakAreas: weakAreas.slice(0, 3),
    keyInsight: extraction.keyInsight || '',
  };
}

/**
 * Format compressed summaries as text for the gap analyzer prompt.
 * Produces ~120 tokens per aspect in a structured text format.
 */
export function formatCompressedSummaries(summaries: CompressedAspectSummary[]): string {
  return summaries.map(s => {
    const lines = [
      `Aspect: ${s.aspect}`,
      `Claims: ${s.claimsByConfidence.established} established, ${s.claimsByConfidence.emerging} emerging, ${s.claimsByConfidence.contested} contested`,
      `Statistics: ${s.statisticCount}${s.statisticDateRange ? ` (range: ${s.statisticDateRange})` : ''}`,
      `Expert opinions: ${s.expertOpinionCount}`,
    ];

    if (s.contradictionCount > 0) {
      lines.push(`Contradictions: ${s.contradictionCount} — ${s.contradictionBriefs.join('; ')}`);
    } else {
      lines.push('Contradictions: 0');
    }

    lines.push(`Sources: ${s.sourceAuthority.highAuthority} high-authority, ${s.sourceAuthority.unclassified} unclassified`);

    if (s.entities.length > 0) {
      lines.push(`Entities: ${s.entities.join(', ')}`);
    }

    if (s.weakAreas.length > 0) {
      lines.push(`Weak areas: ${s.weakAreas.join(', ')}`);
    }

    lines.push(`Key insight: ${s.keyInsight}`);

    return lines.join('\n');
  }).join('\n\n');
}
