import type { TrackWaypoint, StartPosition } from '@/lib/game/types';

export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';
export type GameModeName = 'time-trial' | 'race';

type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type TrackRow = {
  id: string;
  name: string;
  author_name: string;
  waypoints: TrackWaypoint[];
  start_position: StartPosition;
  thumbnail_svg: string | null;
  track_length_m: number | null;
  difficulty: Difficulty | null;
  turn_count: number | null;
  play_count: number;
  created_at: string;
  is_public: boolean;
};

type LeaderboardRow = {
  id: string;
  track_id: string;
  player_name: string;
  time_ms: number;
  lap_times: number[] | null;
  game_mode: GameModeName;
  created_at: string;
};

export interface Database {
  public: {
    Tables: {
      tracks: {
        Row: TrackRow;
        Insert: Omit<TrackRow, 'id' | 'created_at' | 'play_count'> & { id?: string; created_at?: string; play_count?: number };
        Update: Partial<TrackRow>;
        Relationships: [];
      };
      leaderboard_entries: {
        Row: LeaderboardRow;
        Insert: Omit<LeaderboardRow, 'id' | 'created_at'> & { id?: string; created_at?: string };
        Update: Partial<LeaderboardRow>;
        Relationships: [
          {
            foreignKeyName: 'leaderboard_entries_track_id_fkey';
            columns: ['track_id'];
            isOneToOne: false;
            referencedRelation: 'tracks';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      increment_play_count: {
        Args: { track_uuid: string };
        Returns: undefined;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}

export type { Json };
export type Track = TrackRow;
export type TrackInsert = Database['public']['Tables']['tracks']['Insert'];
export type LeaderboardEntry = LeaderboardRow;

/** Row shape returned by the list endpoint (no waypoints). */
export type TrackSummary = Pick<Track, 'id' | 'name' | 'author_name' | 'thumbnail_svg' | 'track_length_m' | 'difficulty' | 'turn_count' | 'play_count' | 'created_at'>;
