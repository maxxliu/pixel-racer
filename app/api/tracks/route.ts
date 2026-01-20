import { NextRequest, NextResponse } from 'next/server';
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client';

// GET /api/tracks - List tracks with filtering and sorting
export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured() || !supabase) {
    return NextResponse.json(
      { error: 'Database not configured' },
      { status: 503 }
    );
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const { searchParams } = new URL(request.url);
    const difficulty = searchParams.get('difficulty');
    const sort = searchParams.get('sort') || 'play_count';
    const order = searchParams.get('order') || 'desc';
    const search = searchParams.get('search');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    let query = db
      .from('tracks')
      .select('*', { count: 'exact' })
      .eq('is_public', true);

    // Apply filters
    if (difficulty) {
      query = query.eq('difficulty', difficulty);
    }

    if (search) {
      query = query.ilike('name', `%${search}%`);
    }

    // Apply sorting
    const validSortFields = ['play_count', 'created_at', 'track_length_m', 'turn_count'];
    const sortField = validSortFields.includes(sort) ? sort : 'play_count';
    query = query.order(sortField, { ascending: order === 'asc' });

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    return NextResponse.json({
      tracks: data,
      total: count,
      limit,
      offset
    });
  } catch (error) {
    console.error('Error fetching tracks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tracks' },
      { status: 500 }
    );
  }
}

// POST /api/tracks - Create a new track
export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured() || !supabase) {
    return NextResponse.json(
      { error: 'Database not configured' },
      { status: 503 }
    );
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const body = await request.json();

    // Validate required fields
    if (!body.name || !body.author_name || !body.waypoints || !body.start_position) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate waypoints
    if (!Array.isArray(body.waypoints) || body.waypoints.length < 8) {
      return NextResponse.json(
        { error: 'Track must have at least 8 waypoints' },
        { status: 400 }
      );
    }

    const trackInsert = {
      name: body.name.slice(0, 100),
      author_name: body.author_name.slice(0, 50),
      waypoints: body.waypoints,
      start_position: body.start_position,
      thumbnail_svg: body.thumbnail_svg || null,
      track_length_m: body.track_length_m || null,
      difficulty: body.difficulty || null,
      turn_count: body.turn_count || null,
      is_public: body.is_public !== false
    };

    const { data, error } = await db
      .from('tracks')
      .insert(trackInsert)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Error creating track:', error);
    return NextResponse.json(
      { error: 'Failed to create track' },
      { status: 500 }
    );
  }
}
