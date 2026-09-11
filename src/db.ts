import { MemberRecord, ProfileHistoryRecord } from './types';

export class MemberDatabase {
  constructor(private db: D1Database) {}

  async getMember(userId: number): Promise<MemberRecord | null> {
    const row = await this.db
      .prepare('SELECT * FROM members WHERE user_id = ?')
      .bind(userId)
      .first<MemberRecord>();
    return row || null;
  }

  async getProfileHistory(userId: number): Promise<ProfileHistoryRecord[]> {
    const { results } = await this.db
      .prepare('SELECT * FROM profile_history WHERE user_id = ? ORDER BY recorded_at DESC LIMIT 10')
      .bind(userId)
      .all<ProfileHistoryRecord>();
    return results || [];
  }

  async recordProfileHistory(
    userId: number,
    firstName: string | null,
    lastName: string | null,
    username: string | null,
    bio: string | null
  ): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO profile_history (user_id, first_name, last_name, username, bio, recorded_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`
      )
      .bind(userId, firstName, lastName, username, bio)
      .run();
  }

  async saveOrUpdateMember(data: {
    userId: number;
    firstName: string | null;
    lastName: string | null;
    username: string | null;
    bio: string | null;
    channelLink: string | null;
    channelTitle: string | null;
    autoDetected: boolean;
    status: 'member' | 'left' | 'kicked';
  }): Promise<{ isNew: boolean; changed: boolean }> {
    const existing = await this.getMember(data.userId);

    if (!existing) {
      // First time seeing this user
      await this.db
        .prepare(
          `INSERT INTO members (
            user_id, first_name, last_name, username, bio, 
            channel_link, channel_title, status, auto_detected, 
            joined_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
        )
        .bind(
          data.userId,
          data.firstName,
          data.lastName,
          data.username,
          data.bio,
          data.channelLink,
          data.channelTitle,
          data.status,
          data.autoDetected ? 1 : 0
        )
        .run();

      await this.recordProfileHistory(
        data.userId,
        data.firstName,
        data.lastName,
        data.username,
        data.bio
      );

      return { isNew: true, changed: false };
    }

    // Check if name/username/bio changed
    const hasProfileChanged =
      existing.first_name !== data.firstName ||
      existing.last_name !== data.lastName ||
      existing.username !== data.username ||
      (data.bio !== null && existing.bio !== data.bio);

    if (hasProfileChanged) {
      await this.recordProfileHistory(
        data.userId,
        data.firstName,
        data.lastName,
        data.username,
        data.bio ?? existing.bio
      );
    }

    // Keep existing channel link if new one is null and old one exists
    const finalChannelLink = data.channelLink || existing.channel_link;
    const finalChannelTitle = data.channelTitle || existing.channel_title;
    const finalBio = data.bio ?? existing.bio;

    await this.db
      .prepare(
        `UPDATE members SET 
          first_name = ?,
          last_name = ?,
          username = ?,
          bio = ?,
          channel_link = ?,
          channel_title = ?,
          status = ?,
          auto_detected = CASE WHEN ? IS NOT NULL THEN 1 ELSE auto_detected END,
          left_at = CASE WHEN ? = 'member' THEN NULL ELSE left_at END,
          updated_at = datetime('now')
        WHERE user_id = ?`
      )
      .bind(
        data.firstName,
        data.lastName,
        data.username,
        finalBio,
        finalChannelLink,
        finalChannelTitle,
        data.status,
        data.channelLink,
        data.status,
        data.userId
      )
      .run();

    return { isNew: false, changed: hasProfileChanged };
  }

  async markLeft(userId: number, firstName?: string, lastName?: string, username?: string): Promise<MemberRecord | null> {
    const existing = await this.getMember(userId);

    if (existing) {
      await this.db
        .prepare(
          `UPDATE members SET 
            status = 'left',
            first_name = COALESCE(?, first_name),
            last_name = COALESCE(?, last_name),
            username = COALESCE(?, username),
            left_at = datetime('now'),
            updated_at = datetime('now')
          WHERE user_id = ?`
        )
        .bind(firstName || null, lastName || null, username || null, userId)
        .run();

      if (firstName || username) {
        await this.recordProfileHistory(
          userId,
          firstName || existing.first_name,
          lastName || existing.last_name,
          username || existing.username,
          existing.bio
        );
      }
    }

    return existing;
  }

  async setManualChannel(userId: number, channelLink: string, channelTitle?: string): Promise<boolean> {
    const existing = await this.getMember(userId);
    if (!existing) {
      // Create stub record
      await this.db
        .prepare(
          `INSERT INTO members (user_id, channel_link, channel_title, auto_detected, status, updated_at)
           VALUES (?, ?, ?, 0, 'member', datetime('now'))`
        )
        .bind(userId, channelLink, channelTitle || null)
        .run();
      return true;
    }

    await this.db
      .prepare(
        `UPDATE members SET 
          channel_link = ?,
          channel_title = COALESCE(?, channel_title),
          auto_detected = 0,
          updated_at = datetime('now')
        WHERE user_id = ?`
      )
      .bind(channelLink, channelTitle || null, userId)
      .run();

    return true;
  }

  async getRecentLeft(limit = 10): Promise<MemberRecord[]> {
    const { results } = await this.db
      .prepare(`SELECT * FROM members WHERE status = 'left' ORDER BY left_at DESC LIMIT ?`)
      .bind(limit)
      .all<MemberRecord>();
    return results || [];
  }

  async getActiveMembers(limit = 30): Promise<MemberRecord[]> {
    const { results } = await this.db
      .prepare(`SELECT * FROM members WHERE status = 'member' ORDER BY joined_at DESC LIMIT ?`)
      .bind(limit)
      .all<MemberRecord>();
    return results || [];
  }
}
