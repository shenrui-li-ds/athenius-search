import { ExtractedEntity, CrossCuttingEntity, EntityType } from '@/lib/types';

// Common suffixes to strip during normalization
const STRIP_SUFFIXES = [
  'corporation',
  'incorporated',
  'company',
  'foundation',
  'institute',
  'university',
  'inc.',
  'inc',
  'corp.',
  'corp',
  'ltd.',
  'ltd',
  'llc',
  'co.',
  'co',
];

/**
 * Normalize an entity name for cross-aspect matching.
 * Lowercases, strips common corporate/institutional suffixes, trims whitespace.
 */
export function normalizeEntityName(name: string): string {
  let normalized = name.toLowerCase().trim();

  // Strip trailing comma before suffixes (e.g., "Tesla, Inc.")
  normalized = normalized.replace(/,\s*$/, '');

  // Strip known suffixes (longest first to avoid partial matches)
  for (const suffix of STRIP_SUFFIXES) {
    // Match suffix at end, optionally preceded by comma and/or space
    const pattern = new RegExp(`[,\\s]+${suffix.replace('.', '\\.')}$`);
    if (pattern.test(normalized)) {
      normalized = normalized.replace(pattern, '');
      break; // Only strip one suffix
    }
  }

  return normalized.trim();
}

interface ExtractionWithEntities {
  aspect: string;
  entities?: ExtractedEntity[];
}

/**
 * Merge entities across aspect extractions.
 * Returns entities that appear in 2+ aspects (cross-cutting entities).
 * Performance: <20ms for 4 aspects with 15 entities each.
 */
export function mergeEntities(extractions: ExtractionWithEntities[]): CrossCuttingEntity[] {
  // Map: normalizedName -> { aspects: Set, names: Map<originalName, count>, type }
  const entityMap = new Map<string, {
    aspects: Set<string>;
    names: Map<string, number>;
    type: EntityType;
  }>();

  for (const extraction of extractions) {
    const entities = extraction.entities || [];
    const seenInAspect = new Set<string>(); // Dedup within same aspect

    for (const entity of entities) {
      if (!entity.name || !entity.normalizedName) continue;

      const normalizedName = entity.normalizedName;

      // Skip duplicates within the same aspect
      if (seenInAspect.has(normalizedName)) continue;
      seenInAspect.add(normalizedName);

      if (!entityMap.has(normalizedName)) {
        entityMap.set(normalizedName, {
          aspects: new Set(),
          names: new Map(),
          type: entity.type || 'concept',
        });
      }

      const entry = entityMap.get(normalizedName)!;
      entry.aspects.add(extraction.aspect);
      entry.names.set(entity.name, (entry.names.get(entity.name) || 0) + 1);
    }
  }

  // Filter to entities appearing in 2+ aspects
  const crossCutting: CrossCuttingEntity[] = [];

  for (const [normalizedName, entry] of entityMap) {
    if (entry.aspects.size < 2) continue;

    // Pick the most common original name
    let bestName = '';
    let bestCount = 0;
    for (const [name, count] of entry.names) {
      if (count > bestCount) {
        bestName = name;
        bestCount = count;
      }
    }

    crossCutting.push({
      name: bestName,
      normalizedName,
      type: entry.type,
      aspects: Array.from(entry.aspects),
      count: entry.aspects.size,
    });
  }

  // Sort by count descending (most cross-cutting first)
  crossCutting.sort((a, b) => b.count - a.count);

  return crossCutting;
}
