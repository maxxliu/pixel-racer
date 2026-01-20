-- Create tracks table
CREATE TABLE tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  author_name TEXT NOT NULL,
  waypoints JSONB NOT NULL,
  start_position JSONB NOT NULL,
  thumbnail_svg TEXT,
  track_length_m INTEGER,
  difficulty TEXT CHECK (difficulty IN ('easy', 'medium', 'hard', 'expert')),
  turn_count INTEGER,
  play_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_public BOOLEAN NOT NULL DEFAULT TRUE
);

-- Create leaderboard entries table
CREATE TABLE leaderboard_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  time_ms INTEGER NOT NULL CHECK (time_ms > 0),
  lap_times JSONB,
  game_mode TEXT NOT NULL CHECK (game_mode IN ('time-trial', 'race')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for tracks
CREATE INDEX idx_tracks_is_public ON tracks(is_public);
CREATE INDEX idx_tracks_difficulty ON tracks(difficulty);
CREATE INDEX idx_tracks_play_count ON tracks(play_count DESC);
CREATE INDEX idx_tracks_created_at ON tracks(created_at DESC);

-- Create indexes for leaderboard entries
CREATE INDEX idx_leaderboard_track_id ON leaderboard_entries(track_id);
CREATE INDEX idx_leaderboard_time ON leaderboard_entries(time_ms ASC);
CREATE INDEX idx_leaderboard_game_mode ON leaderboard_entries(game_mode);
CREATE INDEX idx_leaderboard_track_mode_time ON leaderboard_entries(track_id, game_mode, time_ms ASC);

-- Create increment_play_count function
CREATE OR REPLACE FUNCTION increment_play_count(track_uuid UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE tracks
  SET play_count = play_count + 1
  WHERE id = track_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable Row Level Security
ALTER TABLE tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_entries ENABLE ROW LEVEL SECURITY;

-- Tracks policies
CREATE POLICY "Allow public read access to public tracks"
  ON tracks FOR SELECT
  TO anon, authenticated
  USING (is_public = TRUE);

CREATE POLICY "Allow public insert to tracks"
  ON tracks FOR INSERT
  TO anon, authenticated
  WITH CHECK (TRUE);

CREATE POLICY "Allow play_count updates"
  ON tracks FOR UPDATE
  TO anon, authenticated
  USING (TRUE)
  WITH CHECK (TRUE);

-- Leaderboard policies
CREATE POLICY "Allow public read access to leaderboard"
  ON leaderboard_entries FOR SELECT
  TO anon, authenticated
  USING (TRUE);

CREATE POLICY "Allow public insert to leaderboard"
  ON leaderboard_entries FOR INSERT
  TO anon, authenticated
  WITH CHECK (TRUE);
