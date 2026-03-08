export interface Source {
  id: string;
  title: string;
  url: string;
  iconUrl: string;
  author?: string;
  timeAgo?: string;
  readTime?: string;
  snippet?: string;
  sourceType?: 'web' | 'academic';
  doi?: string;
  citedByCount?: number;
  journalName?: string;
  publicationYear?: number;
}

export interface SearchImage {
  url: string;
  alt: string;
  sourceId?: string;
}

export interface SearchResult {
  query: string;
  content: string;
  sources: Source[];
  images: SearchImage[];
}

export interface TavilySearchResult {
  query: string;
  results: {
    title: string;
    url: string;
    content: string;
    published_date?: string;
    author?: string;
    source?: string;
  }[];
  images?: {
    url: string;
    alt_text?: string;
  }[];
  search_context?: {
    retrieved_from?: string;
    search_depth?: string;
    search_type?: string;
    content_extraction?: string;  // 'jina' | 'snippet' for Google fallback
  };
}

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'function';
  content: string;
  name?: string;
  function_call?: {
    name: string;
    arguments: string;
  };
}

export interface StreamData {
  data: string;
  done: boolean;
}

// Entity types for deep research quality enhancement

export type EntityType = 'person' | 'organization' | 'technology' | 'concept' | 'location' | 'event';

export interface ExtractedEntity {
  name: string;           // Original name as extracted: "Tesla, Inc."
  normalizedName: string; // Normalized: "tesla"
  type: EntityType;       // Classification
}

export interface CrossCuttingEntity {
  name: string;           // Most common original name across aspects
  normalizedName: string; // Normalized name used for matching
  type: EntityType;       // Entity type
  aspects: string[];      // List of aspect names where this entity appears
  count: number;          // Number of aspects containing this entity
}

export type SourceAuthority = 'high-authority' | 'unclassified';

export interface CompressedAspectSummary {
  aspect: string;
  claimsByConfidence: {
    established: number;
    emerging: number;
    contested: number;
  };
  statisticCount: number;
  statisticDateRange: string | null;  // e.g., "2022-2025"
  expertOpinionCount: number;
  contradictionCount: number;
  contradictionBriefs: string[];      // 1-sentence summaries, max 3
  sourceAuthority: {
    highAuthority: number;
    unclassified: number;
  };
  entities: string[];                 // Normalized entity names
  weakAreas: string[];                // Identified coverage gaps, max 3
  keyInsight: string;                 // Preserved from extraction
}
