import { NextRequest, NextResponse } from 'next/server';
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client';

interface LeaderboardEntryWithTrack {
  id: string;
  player_name: string;
  time_ms: number;
  game_mode: string;
  created_at: string;
  track_id: string;
  tracks: {
    id: string;
    name: string;
    difficulty: string | null;
    track_length_m: number | null;
  } | null;
}

// GET /api/leaderboard/global - Get global leaderboard across all tracks
export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured() || !supabase) {
    return NextResponse.json(
      { error: 'Database not configured' },
      { status: 503 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const gameMode = searchParams.get('mode');
    const limit = parseInt(searchParams.get('limit') || '50');

    // Fetch leaderboard entries with track information
    let query = supabase
      .from('leaderboard_entries')
      .select(`
        id,
        player_name,
        time_ms,
        game_mode,
        created_at,
        track_id,
        tracks (
          id,
          name,
          difficulty,
          track_length_m
        )
      `)
      .order('time_ms', { ascending: true })
      .limit(limit);

    if (gameMode) {
      query = query.eq('game_mode', gameMode);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Transform the data to flatten track info
    const entries = (data as LeaderboardEntryWithTrack[] | null)?.map((entry) => ({
      id: entry.id,
      playerName: entry.player_name,
      timeMs: entry.time_ms,
      gameMode: entry.game_mode,
      createdAt: entry.created_at,
      trackId: entry.track_id,
      trackName: entry.tracks?.name || 'Unknown Track',
      trackDifficulty: entry.tracks?.difficulty || null,
      trackLength: entry.tracks?.track_length_m || null
    })) || [];

    return NextResponse.json(entries);
  } catch (error) {
    console.error('Error fetching global leaderboard:', error);
    return NextResponse.json(
      { error: 'Failed to fetch leaderboard' },
      { status: 500 }
    );
  }
}
