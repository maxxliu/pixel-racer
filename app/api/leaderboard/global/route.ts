import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import { LIMITS, parseIntParam, validateGameMode } from '@/lib/api/validate';

interface EntryWithTrack {
  id: string;
  player_name: string;
  time_ms: number;
  game_mode: string;
  created_at: string;
  track_id: string;
  tracks: { id: string; name: string; difficulty: string | null; track_length_m: number | null; is_public: boolean } | null;
}

// GET /api/leaderboard/global
export async function GET(request: NextRequest) {
  if (!supabase) return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  try {
    const { searchParams } = new URL(request.url);
    const mode = validateGameMode(searchParams.get('mode'));
    const limit = parseIntParam(searchParams.get('limit'), 20, 1, LIMITS.listLimitMax);
    let query = supabase
      .from('leaderboard_entries')
      .select('id, player_name, time_ms, game_mode, created_at, track_id, tracks!inner ( id, name, difficulty, track_length_m, is_public )')
      .eq('tracks.is_public', true)
      .order('time_ms', { ascending: true })
      .limit(limit);
    if (mode) query = query.eq('game_mode', mode);
    const { data, error } = await query;
    if (error) throw error;
    const entries = ((data ?? []) as unknown as EntryWithTrack[]).map((e) => ({
      id: e.id,
      playerName: e.player_name,
      timeMs: e.time_ms,
      gameMode: e.game_mode,
      createdAt: e.created_at,
      trackId: e.track_id,
      trackName: e.tracks?.name ?? 'Unknown track',
      trackDifficulty: e.tracks?.difficulty ?? null,
      trackLength: e.tracks?.track_length_m ?? null,
    }));
    return NextResponse.json(entries);
  } catch (error) {
    console.error('Error fetching global leaderboard:', error);
    return NextResponse.json({ error: 'Failed to fetch leaderboard' }, { status: 500 });
  }
}
