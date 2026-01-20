import { NextRequest, NextResponse } from 'next/server';
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/tracks/[id]/play - Increment play count
export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  if (!isSupabaseConfigured() || !supabase) {
    return NextResponse.json(
      { error: 'Database not configured' },
      { status: 503 }
    );
  }

  try {
    const { id } = await context.params;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;

    // Use RPC function to increment play count
    const { error } = await db.rpc('increment_play_count', {
      track_uuid: id
    });

    if (error) {
      // Fallback to manual increment if RPC doesn't exist
      const { data: track, error: fetchError } = await db
        .from('tracks')
        .select('play_count')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      const { error: updateError } = await db
        .from('tracks')
        .update({ play_count: ((track as { play_count?: number })?.play_count || 0) + 1 })
        .eq('id', id);

      if (updateError) throw updateError;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error incrementing play count:', error);
    return NextResponse.json(
      { error: 'Failed to increment play count' },
      { status: 500 }
    );
  }
}
