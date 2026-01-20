import { NextRequest, NextResponse } from 'next/server';
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/tracks/[id]/leaderboard - Get leaderboard for a track
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
    const { searchParams } = new URL(request.url);
    const gameMode = searchParams.get('mode');
    const limit = parseInt(searchParams.get('limit') || '10');

    let query = supabase
      .from('leaderboard_entries')
      .select('*')
      .eq('track_id', id)
      .order('time_ms', { ascending: true })
      .limit(limit);

    if (gameMode) {
      query = query.eq('game_mode', gameMode);
    }

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return NextResponse.json(
      { error: 'Failed to fetch leaderboard' },
      { status: 500 }
    );
  }
}

// POST /api/tracks/[id]/leaderboard - Submit a leaderboard entry
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
    const body = await request.json();

    // Validate required fields
    if (!body.player_name || !body.time_ms || !body.game_mode) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate time
    if (typeof body.time_ms !== 'number' || body.time_ms <= 0) {
      return NextResponse.json(
        { error: 'Invalid time' },
        { status: 400 }
      );
    }

    // Validate game mode
    if (!['time-trial', 'race'].includes(body.game_mode)) {
      return NextResponse.json(
        { error: 'Invalid game mode' },
        { status: 400 }
      );
    }

    // Check if track exists
    const { data: track, error: trackError } = await supabase
      .from('tracks')
      .select('id')
      .eq('id', id)
      .single();

    if (trackError || !track) {
      return NextResponse.json(
        { error: 'Track not found' },
        { status: 404 }
      );
    }

    const entry = {
      track_id: id,
      player_name: body.player_name.slice(0, 50),
      time_ms: Math.round(body.time_ms),
      lap_times: body.lap_times || null,
      game_mode: body.game_mode as 'time-trial' | 'race'
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('leaderboard_entries')
      .insert(entry)
      .select()
      .single();

    if (error) throw error;

    // Get the rank of this entry
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rankings, error: rankError } = await (supabase as any)
      .from('leaderboard_entries')
      .select('id')
      .eq('track_id', id)
      .eq('game_mode', body.game_mode)
      .order('time_ms', { ascending: true });

    let rank = 1;
    if (!rankError && rankings) {
      rank = (rankings as { id: string }[]).findIndex(r => r.id === data?.id) + 1;
    }

    return NextResponse.json({
      ...data,
      rank
    }, { status: 201 });
  } catch (error) {
    console.error('Error submitting leaderboard entry:', error);
    return NextResponse.json(
      { error: 'Failed to submit entry' },
      { status: 500 }
    );
  }
}
