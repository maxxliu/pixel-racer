import { NextRequest, NextResponse } from 'next/server';
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/tracks/[id] - Get single track by ID
export async function GET(
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

    const { data, error } = await supabase
      .from('tracks')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Track not found' },
          { status: 404 }
        );
      }
      throw error;
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching track:', error);
    return NextResponse.json(
      { error: 'Failed to fetch track' },
      { status: 500 }
    );
  }
}

// DELETE /api/tracks/[id] - Delete a track (admin only, not implemented)
export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  // This would require authentication
  return NextResponse.json(
    { error: 'Not implemented' },
    { status: 501 }
  );
}
