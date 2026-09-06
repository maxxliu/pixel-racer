import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import { LIMITS, parseIntParam, cleanString, validateGameMode, validateLapTimes } from '@/lib/api/validate';

interface RouteContext {
  params: { id: string };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/tracks/[id]/leaderboard
export async function GET(request: NextRequest, context: RouteContext) {
  if (!supabase) return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  const { id } = context.params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'Track not found' }, { status: 404 });
  try {
    const { searchParams } = new URL(request.url);
    const mode = validateGameMode(searchParams.get('mode'));
    const limit = parseIntParam(searchParams.get('limit'), 10, 1, LIMITS.listLimitMax);
    let query = supabase
      .from('leaderboard_entries')
      .select('id, player_name, time_ms, lap_times, game_mode, created_at')
      .eq('track_id', id)
      .order('time_ms', { ascending: true })
      .limit(limit);
    if (mode) query = query.eq('game_mode', mode);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json(data ?? []);
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return NextResponse.json({ error: 'Failed to fetch leaderboard' }, { status: 500 });
  }
}

// POST /api/tracks/[id]/leaderboard
export async function POST(request: NextRequest, context: RouteContext) {
  if (!supabase) return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  const { id } = context.params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'Track not found' }, { status: 404 });
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const playerName = cleanString(body.player_name, LIMITS.playerMax);
  const mode = validateGameMode(body.game_mode);
  const timeMs = typeof body.time_ms === 'number' && Number.isFinite(body.time_ms) ? Math.round(body.time_ms) : NaN;
  if (!playerName) return NextResponse.json({ error: 'Player name is required' }, { status: 400 });
  if (!mode) return NextResponse.json({ error: 'Invalid game mode' }, { status: 400 });
  if (!Number.isFinite(timeMs) || timeMs < LIMITS.timeMinMs || timeMs > LIMITS.timeMaxMs) {
    return NextResponse.json({ error: 'Invalid time' }, { status: 400 });
  }
  const laps = validateLapTimes(body.lap_times, timeMs);
  if (laps && !Array.isArray(laps)) return NextResponse.json({ error: laps.error }, { status: 400 });

  try {
    const { data: track } = await supabase.from('tracks').select('id').eq('id', id).eq('is_public', true).maybeSingle();
    if (!track) return NextResponse.json({ error: 'Track not found' }, { status: 404 });

    const { data, error } = await supabase
      .from('leaderboard_entries')
      .insert({ track_id: id, player_name: playerName, time_ms: timeMs, lap_times: laps, game_mode: mode })
      .select('id, player_name, time_ms, game_mode, created_at')
      .single();
    if (error) throw error;

    const { count } = await supabase
      .from('leaderboard_entries')
      .select('id', { count: 'exact', head: true })
      .eq('track_id', id)
      .eq('game_mode', mode)
      .lt('time_ms', timeMs);

    return NextResponse.json({ ...data, rank: (count ?? 0) + 1 }, { status: 201 });
  } catch (error) {
    console.error('Error submitting leaderboard entry:', error);
    return NextResponse.json({ error: 'Failed to submit entry' }, { status: 500 });
  }
}
