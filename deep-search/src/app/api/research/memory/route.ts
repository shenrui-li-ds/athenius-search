import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  compressResearchSummary,
  calculateAgeInDays,
  calculateExpertiseLevel,
  getTTLDays,
  type ResearchMemory,
  type MemoryRetrievalResult,
  type UserExpertise,
} from '@/lib/research-memory';

/**
 * GET /api/research/memory
 *
 * Retrieve relevant prior research memories for a query.
 * Uses pg_trgm fuzzy matching, weighted by topic similarity (70%) + freshness (30%).
 *
 * Query params:
 * - query: string — the current research topic
 *
 * Returns up to 3 memories with similarity > 0.2.
 * RLS enforces user-scoped access automatically.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ memories: [], hasMemory: false });
    }

    const query = request.nextUrl.searchParams.get('query');
    if (!query) {
      return NextResponse.json({ memories: [], hasMemory: false });
    }

    // Check if memory preference is enabled
    const { data: prefs } = await supabase
      .from('user_limits')
      .select('research_memory_enabled')
      .eq('user_id', user.id)
      .single();

    if (!prefs?.research_memory_enabled) {
      return NextResponse.json({ memories: [], hasMemory: false });
    }

    // Retrieve memories by topic similarity with freshness weighting
    const { data: rows, error } = await supabase.rpc('retrieve_research_memories', {
      p_user_id: user.id,
      p_query: query,
    });

    if (error) {
      console.error('Error retrieving research memories:', error);
      return NextResponse.json({ memories: [], hasMemory: false });
    }

    const memories: ResearchMemory[] = (rows || []).map((row: {
      id: string;
      topic_query: string;
      research_summary: string;
      filled_gaps: string[];
      open_gaps: string[];
      resolved_contradictions: Array<{ topic: string; resolution: string }>;
      key_claims: Array<{ statement: string; confidence: string }>;
      created_at: string;
      search_mode: 'research' | 'deep';
      entities: Array<{ name: string; normalizedName: string; type: string }>;
      source_count: number;
    }) => ({
      id: row.id,
      topicQuery: row.topic_query,
      researchSummary: row.research_summary,
      filledGaps: row.filled_gaps || [],
      openGaps: row.open_gaps || [],
      resolvedContradictions: row.resolved_contradictions || [],
      keyClaims: row.key_claims || [],
      ageInDays: calculateAgeInDays(row.created_at),
      searchMode: row.search_mode,
      entities: row.entities || [],
      sourceCount: row.source_count || 0,
    }));

    // Retrieve user expertise for the response
    const { data: expertiseRows } = await supabase
      .from('user_expertise')
      .select('domain, query_count, last_searched_at')
      .eq('user_id', user.id);

    const expertise: UserExpertise[] = (expertiseRows || []).map((row: {
      domain: string;
      query_count: number;
      last_searched_at: string;
    }) => ({
      domain: row.domain,
      queryCount: row.query_count,
      effectiveLevel: calculateExpertiseLevel(row.query_count, row.last_searched_at),
      lastSearchedAt: row.last_searched_at,
    }));

    const result: MemoryRetrievalResult = {
      memories,
      hasMemory: memories.length > 0,
      expertise: expertise.length > 0 ? expertise : undefined,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in GET /api/research/memory:', error);
    return NextResponse.json({ memories: [], hasMemory: false });
  }
}

/**
 * POST /api/research/memory
 *
 * Store compressed research memory after synthesis completes.
 * Uses upsert logic — replaces existing memory with similarity > 0.6.
 * Also increments user expertise for the detected domain.
 *
 * Fire-and-forget from client — failure doesn't affect current session.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      query,
      synthesisContent,
      entities = [],
      filledGaps = [],
      openGaps = [],
      contradictions = [],
      keyClaims = [],
      searchMode = 'research',
      sourceCount = 0,
      queryType,
    } = await request.json();

    if (!query || !synthesisContent) {
      return NextResponse.json({ error: 'Missing query or synthesisContent' }, { status: 400 });
    }

    // Check if memory preference is enabled
    const { data: prefs } = await supabase
      .from('user_limits')
      .select('research_memory_enabled')
      .eq('user_id', user.id)
      .single();

    if (!prefs?.research_memory_enabled) {
      return NextResponse.json({ success: true, skipped: true });
    }

    // Compress synthesis into ~150-word summary
    const researchSummary = await compressResearchSummary(synthesisContent, query);

    // Calculate TTL
    const ttlDays = getTTLDays(searchMode);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + ttlDays);

    // Check for existing memory with high similarity (upsert)
    const { data: existing } = await supabase.rpc('find_similar_memory', {
      p_user_id: user.id,
      p_query: query,
      p_threshold: 0.6,
    });

    if (existing && existing.length > 0) {
      // Update existing memory (upsert)
      const { error: updateError } = await supabase
        .from('research_memory')
        .update({
          topic_query: query,
          research_summary: researchSummary,
          entities,
          filled_gaps: filledGaps,
          open_gaps: openGaps,
          resolved_contradictions: contradictions,
          key_claims: keyClaims,
          search_mode: searchMode,
          source_count: sourceCount,
          created_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
        })
        .eq('id', existing[0].id);

      if (updateError) {
        console.error('Error updating research memory:', updateError);
      }
    } else {
      // Insert new memory
      const { error: insertError } = await supabase
        .from('research_memory')
        .insert({
          user_id: user.id,
          topic_query: query,
          research_summary: researchSummary,
          entities,
          filled_gaps: filledGaps,
          open_gaps: openGaps,
          resolved_contradictions: contradictions,
          key_claims: keyClaims,
          search_mode: searchMode,
          source_count: sourceCount,
          expires_at: expiresAt.toISOString(),
        });

      if (insertError) {
        console.error('Error inserting research memory:', insertError);
      }
    }

    // Increment user expertise for detected domain (if queryType provided)
    if (queryType) {
      const { error: expertiseError } = await supabase.rpc('upsert_user_expertise', {
        p_user_id: user.id,
        p_domain: queryType,
      });

      if (expertiseError) {
        console.error('Error updating user expertise:', expertiseError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in POST /api/research/memory:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/**
 * DELETE /api/research/memory
 *
 * Clear all research memories for the authenticated user.
 * Used by Account > Preferences "Clear Research Memory" button.
 */
export async function DELETE() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // RLS ensures only the user's own memories are deleted
    const { error: memoryError } = await supabase
      .from('research_memory')
      .delete()
      .eq('user_id', user.id);

    if (memoryError) {
      console.error('Error clearing research memories:', memoryError);
      return NextResponse.json({ error: 'Failed to clear memories' }, { status: 500 });
    }

    // Also clear user expertise
    const { error: expertiseError } = await supabase
      .from('user_expertise')
      .delete()
      .eq('user_id', user.id);

    if (expertiseError) {
      console.error('Error clearing user expertise:', expertiseError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/research/memory:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
