import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import { LIMITS, parseIntParam, sanitizeSearch, cleanString, validateDifficulty, validateTrackWaypoints, validateStartPosition } from '@/lib/api/validate';
import { computeTrackStats } from '@/lib/game/TrackSerializer';
import { generateThumbnailSvg } from '@/lib/track/thumbnail';

const SORT_FIELDS = new Set(['play_count', 'created_at', 'track_length_m', 'turn_count']);

// GET /api/tracks - list public tracks
export async function GET(request: NextRequest) {
  if (!supabase) return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  try {
    const { searchParams } = new URL(request.url);
    const difficulty = validateDifficulty(searchParams.get('difficulty'));
    const sortParam = searchParams.get('sort') ?? 'play_count';
    const sort = SORT_FIELDS.has(sortParam) ? sortParam : 'play_count';
    const ascending = searchParams.get('order') === 'asc';
    const search = sanitizeSearch(searchParams.get('search'));
    const limit = parseIntParam(searchParams.get('limit'), 20, 1, LIMITS.listLimitMax);
    const offset = parseIntParam(searchParams.get('offset'), 0, 0, LIMITS.offsetMax);

    let query = supabase
      .from('tracks')
      .select('id, name, author_name, thumbnail_svg, track_length_m, difficulty, turn_count, play_count, created_at', { count: 'exact' })
      .eq('is_public', true);
    if (difficulty) query = query.eq('difficulty', difficulty);
    if (search) query = query.ilike('name', `%${search}%`);
    query = query.order(sort, { ascending }).range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;
    return NextResponse.json({ tracks: data ?? [], total: count ?? 0, limit, offset });
  } catch (error) {
    console.error('Error fetching tracks:', error);
    return NextResponse.json({ error: 'Failed to fetch tracks' }, { status: 500 });
  }
}

// POST /api/tracks - create a track (stats and thumbnail are computed server-side)
export async function POST(request: NextRequest) {
  if (!supabase) return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const name = cleanString(body.name, LIMITS.nameMax);
  const author = cleanString(body.author_name, LIMITS.authorMax);
  if (!name || !author) return NextResponse.json({ error: 'Name and author are required' }, { status: 400 });
  const wp = validateTrackWaypoints(body.waypoints);
  if ('error' in wp) return NextResponse.json({ error: wp.error }, { status: 400 });
  const start = validateStartPosition(body.start_position);
  if (!start) return NextResponse.json({ error: 'Invalid start position' }, { status: 400 });

  try {
    const stats = computeTrackStats(wp.waypoints);
    const { data, error } = await supabase
      .from('tracks')
      .insert({
        name,
        author_name: author,
        waypoints: wp.waypoints,
        start_position: start,
        thumbnail_svg: generateThumbnailSvg(wp.waypoints),
        track_length_m: stats.trackLengthM,
        difficulty: stats.difficulty,
        turn_count: stats.turnCount,
        is_public: true,
      })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Error creating track:', error);
    return NextResponse.json({ error: 'Failed to create track' }, { status: 500 });
  }
}
