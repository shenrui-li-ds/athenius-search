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
  financialMetricCount?: number;      // Finance-specific: count of financial metrics
  valuationDataCount?: number;        // Finance-specific: count of valuation data points
  riskFactorCount?: number;           // Finance-specific: count of risk factors
}

// Finance-specific types (003-finance-deep-research)

export type FinanceSubType = 'stock_analysis' | 'macro' | 'personal_finance' | 'crypto' | 'general_finance';

// Two-dimensional classification: queryContext is mandatory (always returned by planner)
export type FinanceContext = 'stock' | 'earnings' | 'sector' | 'macro' | 'personal' | 'crypto' | 'etf_fund' | 'real_estate' | 'general';
export type ShoppingContext = 'product_search' | 'comparison' | 'single_product' | 'budget' | 'general';
export type TravelContext = 'destination_overview' | 'itinerary' | 'logistics' | 'food_culture' | 'adventure' | 'general';
export type TechnicalContext = 'spec_comparison' | 'architecture' | 'troubleshooting' | 'setup_config' | 'general';
export type AcademicContext = 'literature_review' | 'methodology' | 'theoretical' | 'empirical' | 'interdisciplinary' | 'general';
export type ExplanatoryContext = 'how_it_works' | 'comparison_explainer' | 'history_evolution' | 'practical_guide' | 'general';
export type GeneralContext = 'news_events' | 'people' | 'culture_society' | 'historical' | 'general';
export type QueryContext = FinanceContext | ShoppingContext | TravelContext | TechnicalContext | AcademicContext | ExplanatoryContext | GeneralContext;

export interface FinancialMetric {
  metric: string;    // e.g., "Revenue", "Net Income", "Free Cash Flow"
  value: string;     // e.g., "$26.97B", "22%", "$4.50"
  period: string;    // e.g., "Q4 2024", "FY 2024", "TTM"
  context: string;   // e.g., "YoY growth 22%", "beat estimates by 5%"
}

export interface ValuationDataPoint {
  metric: string;           // e.g., "P/E (TTM)", "EV/Revenue", "P/B"
  currentValue: string;     // e.g., "65x", "25.3x"
  historicalMedian?: string; // e.g., "45x" (5Y median, if available)
  peerComparison?: string;  // e.g., "AMD 120x, Intel 25x"
}

export interface RiskFactor {
  factor: string;                      // Short label: "China export restrictions"
  type: 'risk' | 'opportunity';       // Classification
  severity: 'high' | 'medium' | 'low'; // Impact assessment
  description: string;                 // Full description with context
}

export interface CompetitiveCluster {
  entities: string[];    // Names of clustered organizations
  aspectOverlap: number; // Number of aspects where these entities co-appear
}

export interface MergeEntitiesResult {
  crossCuttingEntities: CrossCuttingEntity[];
  competitiveCluster?: CompetitiveCluster;
}
