import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';

interface RouteContext {
  params: { id: string };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/tracks/[id]/play - increment play count via the SECURITY DEFINER function
export async function POST(_request: NextRequest, context: RouteContext) {
  if (!supabase) return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  const { id } = context.params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'Track not found' }, { status: 404 });
  try {
    const { data: track } = await supabase.from('tracks').select('id').eq('id', id).eq('is_public', true).maybeSingle();
    if (!track) return NextResponse.json({ error: 'Track not found' }, { status: 404 });
    const { error } = await supabase.rpc('increment_play_count', { track_uuid: id });
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error incrementing play count:', error);
    return NextResponse.json({ error: 'Failed to increment play count' }, { status: 500 });
  }
}
