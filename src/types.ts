export interface Env {
  DB: D1Database;
  BOT_TOKEN: string;
  ADMIN_ID?: string; // Optional super-admin
  SECRET_TOKEN?: string;
}

export interface ChannelRecord {
  channel_id: number;
  owner_id: number;
  title: string | null;
  username: string | null;
  created_at: string;
  updated_at: string;
}

export interface MemberRecord {
  channel_id: number;
  user_id: number;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  bio: string | null;
  channel_link: string | null;
  channel_title: string | null;
  status: 'member' | 'left' | 'kicked';
  auto_detected: number;
  joined_at: string;
  left_at: string | null;
  updated_at: string;
}

export interface ProfileHistoryRecord {
  id: number;
  user_id: number;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  bio: string | null;
  recorded_at: string;
}
