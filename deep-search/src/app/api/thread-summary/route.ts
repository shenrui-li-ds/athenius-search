import { NextRequest, NextResponse } from 'next/server';
import { generateThreadSummary } from '@/lib/thread-context';

export async function POST(req: NextRequest) {
  try {
    const { previousSummary, latestQuery, latestContent } = await req.json();

    if (!latestQuery || !latestContent) {
      return NextResponse.json(
        { error: 'latestQuery and latestContent are required' },
        { status: 400 }
      );
    }

    const summary = await generateThreadSummary(
      previousSummary || null,
      latestQuery,
      latestContent
    );

    return NextResponse.json({ summary });
  } catch (error) {
    console.error('Error in thread-summary API:', error);
    return NextResponse.json(
      { error: 'Failed to generate thread summary' },
      { status: 500 }
    );
  }
}
