import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';

interface RouteContext {
  params: { id: string };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/tracks/[id]
export async function GET(_request: NextRequest, context: RouteContext) {
  if (!supabase) return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  const { id } = context.params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'Track not found' }, { status: 404 });
  try {
    const { data, error } = await supabase.from('tracks').select('*').eq('id', id).eq('is_public', true).single();
    if (error) {
      if (error.code === 'PGRST116') return NextResponse.json({ error: 'Track not found' }, { status: 404 });
      throw error;
    }
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching track:', error);
    return NextResponse.json({ error: 'Failed to fetch track' }, { status: 500 });
  }
}
