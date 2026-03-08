import { NextRequest, NextResponse } from 'next/server';
import { callLLM, getCurrentDate, LLMProvider, LLMResponse } from '@/lib/api-utils';
import {
  // V1 prompts
  researchPlannerPrompt,
  researchPlannerShoppingPrompt,
  researchPlannerTravelPrompt,
  researchPlannerTechnicalPrompt,
  researchPlannerAcademicPrompt,
  researchPlannerExplanatoryPrompt,
  researchPlannerFinancePrompt,
  detectFinanceSubType,
  // V2 prompts
  researchPlannerFinancePromptV2,
  researchPlannerShoppingPromptV2,
  researchPlannerTravelPromptV2,
  researchPlannerTechnicalPromptV2,
  researchPlannerAcademicPromptV2,
  researchPlannerExplanatoryPromptV2,
  researchPlannerGeneralPromptV2,
} from '@/lib/prompts';
import { OpenAIMessage } from '@/lib/types';

type QueryType = 'shopping' | 'travel' | 'technical' | 'academic' | 'explanatory' | 'finance' | 'general';

interface PlanItem {
  aspect: string;
  query: string;
}

function getV1Prompt(queryType: QueryType, query: string, currentDate: string): string {
  switch (queryType) {
    case 'shopping': return researchPlannerShoppingPrompt(query, currentDate);
    case 'travel': return researchPlannerTravelPrompt(query, currentDate);
    case 'technical': return researchPlannerTechnicalPrompt(query, currentDate);
    case 'academic': return researchPlannerAcademicPrompt(query, currentDate);
    case 'explanatory': return researchPlannerExplanatoryPrompt(query, currentDate);
    case 'finance': return researchPlannerFinancePrompt(query, currentDate);
    case 'general':
    default: return researchPlannerPrompt(query, currentDate);
  }
}

function getV2Prompt(queryType: QueryType, query: string, currentDate: string): string {
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

function parsePlanResponse(content: string): PlanItem[] {
  let jsonStr = content.trim();
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }
  const parsed = JSON.parse(jsonStr);
  if (Array.isArray(parsed)) return parsed;
  return [];
}

function parseV2Response(content: string): { queryContext: string; plan: PlanItem[] } {
  let jsonStr = content.trim();
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }
  const parsed = JSON.parse(jsonStr);
  return {
    queryContext: parsed.queryContext || 'unknown',
    plan: Array.isArray(parsed.plan) ? parsed.plan : [],
  };
}

export async function POST(req: NextRequest) {
  try {
    const { query, provider, queryType: requestedType } = await req.json();
    const llmProvider = (provider || 'gemini') as LLMProvider;
    const currentDate = getCurrentDate();
    const queryType: QueryType = requestedType || 'finance';

    if (!query) {
      return NextResponse.json({ error: 'Query required' }, { status: 400 });
    }

    // Run V1 and V2 in parallel
    const v1Prompt = getV1Prompt(queryType, query, currentDate);
    const v2Prompt = getV2Prompt(queryType, query, currentDate);

    const systemMessage = 'You are a research planning expert. You analyze topics and identify distinct research angles for comprehensive coverage.';

    const v1Messages: OpenAIMessage[] = [
      { role: 'system', content: systemMessage },
      { role: 'user', content: v1Prompt },
    ];
    const v2Messages: OpenAIMessage[] = [
      { role: 'system', content: systemMessage },
      { role: 'user', content: v2Prompt },
    ];

    const [v1Result, v2Result] = await Promise.all([
      callLLM(v1Messages, 0.7, false, llmProvider) as Promise<LLMResponse>,
      callLLM(v2Messages, 0.7, false, llmProvider) as Promise<LLMResponse>,
    ]);

    // Parse results
    let v1Plan: PlanItem[] = [];
    let v1Error: string | undefined;
    try {
      v1Plan = parsePlanResponse(v1Result.content);
    } catch (e) {
      v1Error = `Parse failed: ${(e as Error).message}`;
    }

    let v2Plan: PlanItem[] = [];
    let v2Context = 'unknown';
    let v2Error: string | undefined;
    try {
      const v2Parsed = parseV2Response(v2Result.content);
      v2Plan = v2Parsed.plan;
      v2Context = v2Parsed.queryContext;
    } catch (e) {
      v2Error = `Parse failed: ${(e as Error).message}`;
    }

    // Compute comparison
    const v1Aspects = new Set(v1Plan.map(p => p.aspect));
    const v2Aspects = new Set(v2Plan.map(p => p.aspect));
    const overlap = [...v1Aspects].filter(a => v2Aspects.has(a));

    // Build response
    const response: Record<string, unknown> = {
      query,
      queryType,
      provider: llmProvider,
      v1: {
        plan: v1Plan,
        aspects: [...v1Aspects],
        ...(v1Error && { error: v1Error }),
        rawOutput: v1Result.content,
      },
      v2: {
        queryContext: v2Context,
        plan: v2Plan,
        aspects: [...v2Aspects],
        ...(v2Error && { error: v2Error }),
        rawOutput: v2Result.content,
      },
      comparison: {
        aspectOverlap: overlap,
        v1Only: [...v1Aspects].filter(a => !v2Aspects.has(a)),
        v2Only: [...v2Aspects].filter(a => !v1Aspects.has(a)),
      },
    };

    // Add finance-specific comparison
    if (queryType === 'finance') {
      const regexSubType = detectFinanceSubType(query);
      response.regexClassification = regexSubType;
      (response.comparison as Record<string, unknown>).regexVsLLM =
        regexSubType === v2Context || (regexSubType === 'stock_analysis' && v2Context === 'stock')
          ? 'agree' : 'differ';
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('Planner V2 test error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
