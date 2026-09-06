-- Tighten anonymous access.
-- The original "Allow play_count updates" policy granted UPDATE on every column of
-- every track to anon. play_count is incremented through the SECURITY DEFINER
-- function increment_play_count(), so no direct UPDATE policy is needed.
DROP POLICY IF EXISTS "Allow play_count updates" ON tracks;

-- Bound the size of user-supplied text and JSON.
ALTER TABLE tracks
  ADD CONSTRAINT tracks_name_len CHECK (char_length(name) BETWEEN 1 AND 60),
  ADD CONSTRAINT tracks_author_len CHECK (char_length(author_name) BETWEEN 1 AND 30),
  ADD CONSTRAINT tracks_thumbnail_len CHECK (thumbnail_svg IS NULL OR char_length(thumbnail_svg) <= 20000),
  ADD CONSTRAINT tracks_waypoints_count CHECK (jsonb_typeof(waypoints) = 'array' AND jsonb_array_length(waypoints) BETWEEN 6 AND 400);

ALTER TABLE leaderboard_entries
  ADD CONSTRAINT leaderboard_player_len CHECK (char_length(player_name) BETWEEN 1 AND 20),
  ADD CONSTRAINT leaderboard_time_bounds CHECK (time_ms BETWEEN 5000 AND 3600000);
