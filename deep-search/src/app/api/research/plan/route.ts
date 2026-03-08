import { NextRequest, NextResponse } from 'next/server';
import { callLLM, getCurrentDate, LLMProvider, LLMResponse } from '@/lib/api-utils';
import { trackServerApiUsage, estimateTokens } from '@/lib/supabase/usage-tracking';
import {
  researchRouterPrompt,
  detectFinanceSubType,
  // V2 prompts (two-dimensional classification)
  researchPlannerFinancePromptV2,
  researchPlannerShoppingPromptV2,
  researchPlannerTravelPromptV2,
  researchPlannerTechnicalPromptV2,
  researchPlannerAcademicPromptV2,
  researchPlannerExplanatoryPromptV2,
  researchPlannerGeneralPromptV2,
} from '@/lib/prompts';
import { OpenAIMessage } from '@/lib/types';
import { generateCacheKey, getFromCache, setToCache } from '@/lib/cache';
import { createClient } from '@/lib/supabase/server';
import { logClassification } from '@/lib/classification-log';

export type QueryType = 'shopping' | 'travel' | 'technical' | 'academic' | 'explanatory' | 'finance' | 'general';
export type ResearchDepth = 'standard' | 'deep';

export interface ResearchPlanItem {
  aspect: string;
  query: string;
}

export type FinanceSubType = 'stock_analysis' | 'macro' | 'personal_finance' | 'crypto' | 'general_finance';

export interface ResearchPlanResponse {
  originalQuery: string;
  queryType: QueryType;
  queryContext?: string;
  suggestedDepth: ResearchDepth;
  plan: ResearchPlanItem[];
  cached?: boolean;
  financeSubType?: FinanceSubType;
}

interface RouterResult {
  category: QueryType;
  suggestedDepth: ResearchDepth;
}

// Map query type to V2 planner prompt (two-dimensional classification)
function getPlannerPrompt(queryType: QueryType, query: string, currentDate: string): string {
  switch (queryType) {
    case 'shopping': return researchPlannerShoppingPromptV2(query, currentDate);
    case 'travel': return researchPlannerTravelPromptV2(query, currentDate);
    case 'technical': return researchPlannerTechnicalPromptV2(query, currentDate);
    case 'academic': return researchPlannerAcademicPromptV2(query, currentDate);
    case 'explanatory': return researchPlannerExplanatoryPromptV2(query, currentDate);
    case 'finance': return researchPlannerFinancePromptV2(query, currentDate);
    case 'general':
    default: return researchPlannerGeneralPromptV2(query, currentDate);
  }
}

// Classify query type and suggest depth using router
async function classifyQuery(query: string, provider: LLMProvider | undefined): Promise<RouterResult> {
  const prompt = researchRouterPrompt(query);

  const messages: OpenAIMessage[] = [
    { role: 'system', content: 'You are a query classifier. Output only a JSON object with category and suggestedDepth.' },
    { role: 'user', content: prompt }
  ];

  const defaultResult: RouterResult = { category: 'general', suggestedDepth: 'standard' };

  try {
    const llmResult = await callLLM(messages, 0.3, false, provider) as LLMResponse;

    // Track API usage for router
    const routerInputTokens = estimateTokens(prompt);
    const routerOutputTokens = estimateTokens(llmResult.content);
    trackServerApiUsage({
      provider: provider || 'auto',
      tokens_used: routerInputTokens + routerOutputTokens,
      request_type: 'plan',
      actual_usage: llmResult.usage
    }).catch(err => console.error('Failed to track API usage:', err));

    // Parse JSON response
    let jsonStr = llmResult.content.trim();
    // Extract from markdown code block if present
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr);

    // Validate the category
    const validCategories: QueryType[] = ['shopping', 'travel', 'technical', 'academic', 'explanatory', 'finance', 'general'];
    const validDepths: ResearchDepth[] = ['standard', 'deep'];

    const category = validCategories.includes(parsed.category) ? parsed.category : 'general';
    const suggestedDepth = validDepths.includes(parsed.suggestedDepth) ? parsed.suggestedDepth : 'standard';

    console.log(`[Router] Query classified as: ${category}, depth: ${suggestedDepth}`);
    return { category, suggestedDepth };
  } catch (error) {
    console.error('[Router] Classification failed, defaulting to general/standard:', error);
    return defaultResult;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { query, provider } = await req.json();
    const llmProvider = provider as LLMProvider | undefined;

    if (!query) {
      return NextResponse.json(
        { error: 'Query parameter is required' },
        { status: 400 }
      );
    }

    // Generate cache key
    const cacheKey = generateCacheKey('plan', {
      query,
      provider: llmProvider,
    });

    // Try to get from cache
    let supabase;
    try {
      supabase = await createClient();
    } catch {
      console.log('[Cache] Supabase not available, using memory cache only');
    }

    const { data: cachedData, source } = await getFromCache<ResearchPlanResponse>(
      cacheKey,
      supabase
    );

    if (cachedData) {
      console.log(`[Plan] Cache ${source} hit for: ${query.slice(0, 50)}`);
      return NextResponse.json({
        ...cachedData,
        cached: true,
      });
    }

    // Cache miss - first classify the query type and depth
    // Check classification cache (provider-independent)
    const classificationCacheKey = generateCacheKey('classification', { query });
    const { data: cachedClassification } = await getFromCache<RouterResult>(
      classificationCacheKey,
      supabase
    );

    const classificationStart = Date.now();
    let routerResult: RouterResult;
    let classificationCached = false;

    if (cachedClassification) {
      routerResult = cachedClassification;
      classificationCached = true;
      console.log(`[Router] Classification cache hit: ${routerResult.category}/${routerResult.suggestedDepth}`);
    } else {
      routerResult = await classifyQuery(query, llmProvider);
      // Cache classification (provider-independent)
      await setToCache(classificationCacheKey, 'classification', query, routerResult, undefined, supabase);
    }

    const { category: queryType, suggestedDepth } = routerResult;
    const classificationLatencyMs = classificationCached ? null : Date.now() - classificationStart;

    // Get the appropriate V2 planner prompt based on query type
    const currentDate = getCurrentDate();
    const prompt = getPlannerPrompt(queryType, query, currentDate);

    const messages: OpenAIMessage[] = [
      { role: 'system', content: 'You are a research planning expert. You analyze topics and identify distinct research angles for comprehensive coverage.' },
      { role: 'user', content: prompt }
    ];

    const plannerResult = await callLLM(messages, 0.7, false, llmProvider) as LLMResponse;

    // Track API usage for planner
    const plannerInputTokens = estimateTokens(prompt);
    const plannerOutputTokens = estimateTokens(plannerResult.content);
    trackServerApiUsage({
      provider: llmProvider || 'auto',
      tokens_used: plannerInputTokens + plannerOutputTokens,
      request_type: 'plan',
      actual_usage: plannerResult.usage
    }).catch(err => console.error('Failed to track API usage:', err));

    // Parse the V2 JSON response (includes queryContext)
    let plan: ResearchPlanItem[] = [];
    let queryContext: string | null = null;
    try {
      // Extract JSON from potential markdown code blocks
      let jsonStr = plannerResult.content.trim();
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }
      const parsed = JSON.parse(jsonStr);

      // V2 format: { queryContext: "stock", plan: [...] }
      if (parsed.queryContext && Array.isArray(parsed.plan)) {
        queryContext = parsed.queryContext;
        plan = parsed.plan;
      } else if (Array.isArray(parsed)) {
        // Fallback: V1-style array response
        plan = parsed;
      } else {
        throw new Error('Invalid plan format');
      }

      // Validate the plan structure
      if (plan.length === 0) {
        throw new Error('Empty plan');
      }

      // Ensure each item has aspect and query
      plan = plan.filter(item => item.aspect && item.query);

      // Limit to 4 search queries max
      if (plan.length > 4) {
        plan = plan.slice(0, 4);
      }
    } catch (parseError) {
      console.error('Failed to parse research plan:', parseError);
      // Fallback: use the original query as a single search
      plan = [{ aspect: 'general', query: query }];
    }

    const financeSubType = queryType === 'finance' ? detectFinanceSubType(query) : undefined;

    const result: ResearchPlanResponse = {
      originalQuery: query,
      queryType,
      ...(queryContext && { queryContext }),
      suggestedDepth,
      plan,
      ...(financeSubType && { financeSubType }),
    };

    // Log classification (fire-and-forget)
    logClassification({
      query,
      queryType,
      queryContext: queryContext || null,
      suggestedDepth,
      provider: llmProvider || null,
      cached: classificationCached,
      latencyMs: classificationLatencyMs,
    }, supabase);

    // Cache the response
    await setToCache(cacheKey, 'plan', query, result, llmProvider, supabase);

    return NextResponse.json(result);

  } catch (error) {
    console.error('Error in research plan API:', error);
    return NextResponse.json(
      { error: 'Failed to create research plan' },
      { status: 500 }
    );
  }
}
