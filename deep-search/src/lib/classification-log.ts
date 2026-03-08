// Classification logging for monitoring and analytics
// Fire-and-forget: adds zero latency to the request pipeline

export interface ClassificationLogEntry {
  query: string;
  queryType: string;
  queryContext: string | null;
  suggestedDepth: string;
  provider: string | null;
  cached: boolean;
  latencyMs: number | null;
}

// In-memory ring buffer for recent classifications (survives within server lifetime)
const BUFFER_SIZE = 500;
const recentClassifications: ClassificationLogEntry[] = [];

/**
 * Log a classification result. Fire-and-forget — never throws, never blocks.
 * Stores in in-memory ring buffer for debugging/monitoring.
 * Optionally persists to Supabase if a client is provided.
 */
export function logClassification(
  entry: ClassificationLogEntry,
  supabase?: { from: (table: string) => { insert: (data: Record<string, unknown>) => { then: (fn: () => void) => { catch: (fn: (err: unknown) => void) => void } } } }
): void {
  // In-memory ring buffer
  if (recentClassifications.length >= BUFFER_SIZE) {
    recentClassifications.shift();
  }
  recentClassifications.push(entry);

  // Fire-and-forget Supabase insert if available
  if (supabase) {
    supabase.from('classification_log').insert({
      query: entry.query.slice(0, 500), // truncate long queries
      query_type: entry.queryType,
      query_context: entry.queryContext,
      suggested_depth: entry.suggestedDepth,
      provider: entry.provider,
      cached: entry.cached,
      latency_ms: entry.latencyMs,
    }).then(() => {}).catch((err: unknown) => {
      // Silently fail — logging should never block the pipeline
      console.warn('[ClassificationLog] Failed to persist:', err);
    });
  }
}

/**
 * Get recent classifications from in-memory buffer.
 * Useful for debugging and the test endpoint.
 */
export function getRecentClassifications(limit = 50): ClassificationLogEntry[] {
  return recentClassifications.slice(-limit);
}

/**
 * Get classification stats from in-memory buffer.
 */
export function getClassificationStats(): {
  total: number;
  byQueryType: Record<string, number>;
  byQueryContext: Record<string, number>;
  cacheHitRate: number;
  avgLatencyMs: number;
} {
  const total = recentClassifications.length;
  const byQueryType: Record<string, number> = {};
  const byQueryContext: Record<string, number> = {};
  let cacheHits = 0;
  let totalLatency = 0;
  let latencyCount = 0;

  for (const entry of recentClassifications) {
    byQueryType[entry.queryType] = (byQueryType[entry.queryType] || 0) + 1;
    if (entry.queryContext) {
      byQueryContext[entry.queryContext] = (byQueryContext[entry.queryContext] || 0) + 1;
    }
    if (entry.cached) cacheHits++;
    if (entry.latencyMs !== null) {
      totalLatency += entry.latencyMs;
      latencyCount++;
    }
  }

  return {
    total,
    byQueryType,
    byQueryContext,
    cacheHitRate: total > 0 ? cacheHits / total : 0,
    avgLatencyMs: latencyCount > 0 ? Math.round(totalLatency / latencyCount) : 0,
  };
}
