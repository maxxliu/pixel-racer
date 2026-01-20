import type { TrackWaypoint } from '@/lib/game/TrackBuilder';

export interface Database {
  public: {
    Tables: {
      tracks: {
        Row: {
          id: string;
          name: string;
          author_name: string;
          waypoints: TrackWaypoint[];
          start_position: { x: number; z: number; rotation: number };
          thumbnail_svg: string | null;
          track_length_m: number | null;
          difficulty: 'easy' | 'medium' | 'hard' | 'expert' | null;
          turn_count: number | null;
          play_count: number;
          created_at: string;
          is_public: boolean;
        };
        Insert: {
          id?: string;
          name: string;
          author_name: string;
          waypoints: TrackWaypoint[];
          start_position: { x: number; z: number; rotation: number };
          thumbnail_svg?: string | null;
          track_length_m?: number | null;
          difficulty?: 'easy' | 'medium' | 'hard' | 'expert' | null;
          turn_count?: number | null;
          play_count?: number;
          created_at?: string;
          is_public?: boolean;
        };
        Update: {
          id?: string;
          name?: string;
          author_name?: string;
          waypoints?: TrackWaypoint[];
          start_position?: { x: number; z: number; rotation: number };
          thumbnail_svg?: string | null;
          track_length_m?: number | null;
          difficulty?: 'easy' | 'medium' | 'hard' | 'expert' | null;
          turn_count?: number | null;
          play_count?: number;
          created_at?: string;
          is_public?: boolean;
        };
      };
      leaderboard_entries: {
        Row: {
          id: string;
          track_id: string;
          player_name: string;
          time_ms: number;
          lap_times: number[] | null;
          game_mode: 'time-trial' | 'race';
          created_at: string;
        };
        Insert: {
          id?: string;
          track_id: string;
          player_name: string;
          time_ms: number;
          lap_times?: number[] | null;
          game_mode: 'time-trial' | 'race';
          created_at?: string;
        };
        Update: {
          id?: string;
          track_id?: string;
          player_name?: string;
          time_ms?: number;
          lap_times?: number[] | null;
          game_mode?: 'time-trial' | 'race';
          created_at?: string;
        };
      };
    };
    Functions: {
      increment_play_count: {
        Args: { track_uuid: string };
        Returns: void;
      };
    };
  };
}

export type Track = Database['public']['Tables']['tracks']['Row'];
export type TrackInsert = Database['public']['Tables']['tracks']['Insert'];
export type TrackUpdate = Database['public']['Tables']['tracks']['Update'];

export type LeaderboardEntry = Database['public']['Tables']['leaderboard_entries']['Row'];
export type LeaderboardEntryInsert = Database['public']['Tables']['leaderboard_entries']['Insert'];
export type LeaderboardEntryUpdate = Database['public']['Tables']['leaderboard_entries']['Update'];

export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';
