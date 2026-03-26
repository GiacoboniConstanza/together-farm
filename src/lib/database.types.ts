export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      farms: {
        Row: {
          id: string;
          created_by: string;
          version: number;
          game_state: Json;
          corn_count: number;
          potato_count: number;
          updated_at: string;
        };
        Insert: {
          id?: string;
          created_by: string;
          version?: number;
          game_state?: Json;
          corn_count?: number;
          potato_count?: number;
          updated_at?: string;
        };
        Update: {
          id?: string;
          created_by?: string;
          version?: number;
          game_state?: Json;
          corn_count?: number;
          potato_count?: number;
          updated_at?: string;
        };
      };
      farm_members: {
        Row: { farm_id: string; user_id: string };
        Insert: { farm_id: string; user_id: string };
        Update: { farm_id?: string; user_id?: string };
      };
      invites: {
        Row: {
          id: string;
          farm_id: string;
          token_hash: string;
          expires_at: string;
          consumed_at: string | null;
        };
        Insert: {
          id?: string;
          farm_id: string;
          token_hash: string;
          expires_at: string;
          consumed_at?: string | null;
        };
        Update: {
          id?: string;
          farm_id?: string;
          token_hash?: string;
          expires_at?: string;
          consumed_at?: string | null;
        };
      };
      pets: {
        Row: {
          farm_id: string;
          name: string;
          hunger: number;
          cleanliness: number;
          energy: number;
          sleep_until: string | null;
          last_tick_at: string;
        };
        Insert: {
          farm_id: string;
          name?: string;
          hunger?: number;
          cleanliness?: number;
          energy?: number;
          sleep_until?: string | null;
          last_tick_at?: string;
        };
        Update: {
          farm_id?: string;
          name?: string;
          hunger?: number;
          cleanliness?: number;
          energy?: number;
          sleep_until?: string | null;
          last_tick_at?: string;
        };
      };
    };
    Functions: {
      create_farm: { Args: Record<string, never>; Returns: string };
      create_invite: { Args: { p_farm_id: string }; Returns: string };
      accept_invite: { Args: { p_token: string }; Returns: string };
      save_farm_state: {
        Args: {
          p_farm_id: string;
          p_expected_version: number;
          p_game_state: Json;
        };
        Returns: number;
      };
      commit_harvest: {
        Args: {
          p_farm_id: string;
          p_expected_version: number;
          p_x: number;
          p_y: number;
          p_new_game_state: Json;
          p_crop_type: string;
        };
        Returns: number;
      };
      pet_tick: { Args: { p_farm_id: string }; Returns: undefined };
      pet_feed: {
        Args: { p_farm_id: string; p_crop: "corn" | "potato" };
        Returns: undefined;
      };
      pet_bathe: { Args: { p_farm_id: string }; Returns: undefined };
      pet_sleep: { Args: { p_farm_id: string }; Returns: undefined };
    };
  };
}
