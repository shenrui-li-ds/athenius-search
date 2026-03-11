/**
 * @jest-environment node
 */

/**
 * Integration tests for /api/research/memory route.
 * Tests GET (retrieve), POST (store), DELETE (clear) with mocked Supabase.
 */

import { NextRequest } from 'next/server';

// ── Mock setup ──────────────────────────────────────────────────────

const mockUser = { id: 'user-123', email: 'test@example.com' };
const mockUser2 = { id: 'user-456', email: 'other@example.com' };
let currentUser: typeof mockUser | null = mockUser;

// Supabase mock state
let mockMemories: Array<Record<string, unknown>> = [];
let mockExpertise: Array<Record<string, unknown>> = [];
let mockUserLimits = { research_memory_enabled: true };

const mockRpcResults: Record<string, unknown[]> = {};

const mockSupabase = {
  auth: {
    getUser: jest.fn(() => Promise.resolve({
      data: { user: currentUser },
      error: null,
    })),
  },
  from: jest.fn((table: string) => {
    const chain = {
      select: jest.fn(() => chain),
      insert: jest.fn(() => {
        if (table === 'research_memory') {
          return Promise.resolve({ error: null });
        }
        return Promise.resolve({ error: null });
      }),
      update: jest.fn(() => chain),
      delete: jest.fn(() => chain),
      eq: jest.fn((_col: string, _val: unknown) => {
        if (table === 'user_limits') {
          return { single: jest.fn(() => Promise.resolve({ data: mockUserLimits, error: null })) };
        }
        if (table === 'user_expertise') {
          return Promise.resolve({ data: mockExpertise, error: null });
        }
        if (table === 'research_memory') {
          return Promise.resolve({ error: null });
        }
        return chain;
      }),
      single: jest.fn(() => Promise.resolve({ data: mockUserLimits, error: null })),
    };
    return chain;
  }),
  rpc: jest.fn((fnName: string) => {
    if (mockRpcResults[fnName] !== undefined) {
      return Promise.resolve({ data: mockRpcResults[fnName], error: null });
    }
    return Promise.resolve({ data: [], error: null });
  }),
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => Promise.resolve(mockSupabase)),
}));

jest.mock('@/lib/api-utils', () => ({
  callLLMWithFallback: jest.fn(() =>
    Promise.resolve({
      response: { content: 'Compressed summary.' },
      usedProvider: 'deepseek',
    })
  ),
}));

// ── Import route handlers ───────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-require-imports
let GET: typeof import('@/app/api/research/memory/route').GET;
// eslint-disable-next-line @typescript-eslint/no-require-imports
let POST: typeof import('@/app/api/research/memory/route').POST;
// eslint-disable-next-line @typescript-eslint/no-require-imports
let DELETE: typeof import('@/app/api/research/memory/route').DELETE;

beforeAll(async () => {
  const mod = await import('@/app/api/research/memory/route');
  GET = mod.GET;
  POST = mod.POST;
  DELETE = mod.DELETE;
});

beforeEach(() => {
  jest.clearAllMocks();
  currentUser = mockUser;
  mockMemories = [];
  mockExpertise = [];
  mockUserLimits = { research_memory_enabled: true };
  // Reset RPC results
  for (const key of Object.keys(mockRpcResults)) {
    delete mockRpcResults[key];
  }
});

// ── Helpers ─────────────────────────────────────────────────────────

function createGetRequest(query: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/research/memory?query=${encodeURIComponent(query)}`);
}

function createPostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/research/memory', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function createDeleteRequest(): NextRequest {
  return new NextRequest('http://localhost:3000/api/research/memory', {
    method: 'DELETE',
  });
}

// ══════════════════════════════════════════════════════════════════════
// GET /api/research/memory
// ══════════════════════════════════════════════════════════════════════

describe('GET /api/research/memory', () => {
  it('returns empty when no memories exist', async () => {
    mockRpcResults['retrieve_research_memories'] = [];

    const res = await GET(createGetRequest('intermittent fasting'));
    const data = await res.json();

    expect(data.memories).toEqual([]);
    expect(data.hasMemory).toBe(false);
  });

  it('returns memories when found', async () => {
    mockRpcResults['retrieve_research_memories'] = [
      {
        id: 'mem-1',
        topic_query: 'intermittent fasting health',
        research_summary: 'Prior findings on IF...',
        filled_gaps: ['metabolic mechanisms'],
        open_gaps: ['muscle retention'],
        resolved_contradictions: [],
        key_claims: [{ statement: 'IF is safe', confidence: 'established' }],
        created_at: new Date().toISOString(),
        search_mode: 'deep',
        entities: [],
        source_count: 15,
      },
    ];

    const res = await GET(createGetRequest('intermittent fasting for athletes'));
    const data = await res.json();

    expect(data.hasMemory).toBe(true);
    expect(data.memories).toHaveLength(1);
    expect(data.memories[0].topicQuery).toBe('intermittent fasting health');
    expect(data.memories[0].filledGaps).toEqual(['metabolic mechanisms']);
    expect(data.memories[0].searchMode).toBe('deep');
  });

  it('returns empty when user is not authenticated', async () => {
    currentUser = null;

    const res = await GET(createGetRequest('test'));
    const data = await res.json();

    expect(data.memories).toEqual([]);
    expect(data.hasMemory).toBe(false);
  });

  it('returns empty when memory preference is disabled', async () => {
    mockUserLimits = { research_memory_enabled: false };

    const res = await GET(createGetRequest('test'));
    const data = await res.json();

    expect(data.memories).toEqual([]);
    expect(data.hasMemory).toBe(false);
  });

  it('returns empty when query param is missing', async () => {
    const req = new NextRequest('http://localhost:3000/api/research/memory');
    const res = await GET(req);
    const data = await res.json();

    expect(data.hasMemory).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════
// POST /api/research/memory
// ══════════════════════════════════════════════════════════════════════

describe('POST /api/research/memory', () => {
  it('stores new memory when no similar exists', async () => {
    mockRpcResults['find_similar_memory'] = [];

    const res = await POST(createPostRequest({
      query: 'intermittent fasting for athletes',
      synthesisContent: 'A '.repeat(300) + 'long synthesis about IF.',
      entities: [],
      filledGaps: ['athletic performance'],
      searchMode: 'deep',
      sourceCount: 20,
      queryType: 'academic',
    }));
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(mockSupabase.from).toHaveBeenCalledWith('research_memory');
  });

  it('calls upsert_user_expertise when queryType provided', async () => {
    mockRpcResults['find_similar_memory'] = [];

    await POST(createPostRequest({
      query: 'IF athletes',
      synthesisContent: 'A '.repeat(300) + 'content.',
      queryType: 'academic',
    }));

    expect(mockSupabase.rpc).toHaveBeenCalledWith('upsert_user_expertise', {
      p_user_id: 'user-123',
      p_domain: 'academic',
    });
  });

  it('upserts when similar memory exists', async () => {
    mockRpcResults['find_similar_memory'] = [
      { id: 'existing-mem-1', topic_query: 'intermittent fasting health' },
    ];

    const res = await POST(createPostRequest({
      query: 'intermittent fasting effects',
      synthesisContent: 'A '.repeat(300) + 'updated synthesis.',
      searchMode: 'research',
    }));
    const data = await res.json();

    expect(data.success).toBe(true);
    // Should update rather than insert
    expect(mockSupabase.from).toHaveBeenCalledWith('research_memory');
  });

  it('returns 401 when not authenticated', async () => {
    currentUser = null;

    const res = await POST(createPostRequest({
      query: 'test',
      synthesisContent: 'content',
    }));

    expect(res.status).toBe(401);
  });

  it('returns 400 when missing required fields', async () => {
    const res = await POST(createPostRequest({ query: 'test' }));
    expect(res.status).toBe(400);
  });
});

// ══════════════════════════════════════════════════════════════════════
// DELETE /api/research/memory
// ══════════════════════════════════════════════════════════════════════

describe('DELETE /api/research/memory', () => {
  it('clears all memories for the user', async () => {
    const res = await DELETE(createDeleteRequest());
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(mockSupabase.from).toHaveBeenCalledWith('research_memory');
    expect(mockSupabase.from).toHaveBeenCalledWith('user_expertise');
  });

  it('returns 401 when not authenticated', async () => {
    currentUser = null;

    const res = await DELETE(createDeleteRequest());
    expect(res.status).toBe(401);
  });
});
