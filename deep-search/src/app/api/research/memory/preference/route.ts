import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/research/memory/preference
 * Returns whether research memory is enabled for the current user.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ enabled: false });
    }

    const { data } = await supabase
      .from('user_limits')
      .select('research_memory_enabled')
      .eq('user_id', user.id)
      .single();

    return NextResponse.json({ enabled: data?.research_memory_enabled ?? false });
  } catch {
    return NextResponse.json({ enabled: false });
  }
}

/**
 * POST /api/research/memory/preference
 * Toggle research memory enabled/disabled.
 * Body: { enabled: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { enabled } = await request.json();

    const { error } = await supabase
      .from('user_limits')
      .update({ research_memory_enabled: enabled })
      .eq('user_id', user.id);

    if (error) {
      console.error('Error updating memory preference:', error);
      return NextResponse.json({ error: 'Failed to update preference' }, { status: 500 });
    }

    return NextResponse.json({ success: true, enabled });
  } catch {
    return NextResponse.json({ error: 'Failed to update preference' }, { status: 500 });
  }
}
