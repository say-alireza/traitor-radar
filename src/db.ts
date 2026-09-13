import { ChannelRecord, MemberRecord, ProfileHistoryRecord } from './types';

export class MemberDatabase {
  constructor(private db: D1Database) {}

  // Channel Operations
  async registerChannel(
    channelId: number,
    ownerId: number,
    title: string | null,
    username: string | null
  ): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO channels (channel_id, owner_id, title, username, created_at, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
         ON CONFLICT(channel_id) DO UPDATE SET
           owner_id = excluded.owner_id,
           title = excluded.title,
           username = excluded.username,
           updated_at = datetime('now')`
      )
      .bind(channelId, ownerId, title, username)
      .run();
  }

  async getChannel(channelId: number): Promise<ChannelRecord | null> {
    const row = await this.db
      .prepare('SELECT * FROM channels WHERE channel_id = ?')
      .bind(channelId)
      .first<ChannelRecord>();
    return row || null;
  }

  async getChannelsByOwner(ownerId: number): Promise<ChannelRecord[]> {
    const { results } = await this.db
      .prepare('SELECT * FROM channels WHERE owner_id = ? ORDER BY created_at DESC')
      .bind(ownerId)
      .all<ChannelRecord>();
    return results || [];
  }

  // Member Operations
  async getMember(channelId: number, userId: number): Promise<MemberRecord | null> {
    const row = await this.db
      .prepare('SELECT * FROM members WHERE channel_id = ? AND user_id = ?')
      .bind(channelId, userId)
      .first<MemberRecord>();
    return row || null;
  }

  async getMemberAcrossChannels(userId: number): Promise<MemberRecord[]> {
    const { results } = await this.db
      .prepare('SELECT * FROM members WHERE user_id = ? ORDER BY updated_at DESC')
      .bind(userId)
      .all<MemberRecord>();
    return results || [];
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
    channelId: number;
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
    const existing = await this.getMember(data.channelId, data.userId);

    if (!existing) {
      await this.db
        .prepare(
          `INSERT INTO members (
            channel_id, user_id, first_name, last_name, username, bio, 
            channel_link, channel_title, status, auto_detected, 
            joined_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
        )
        .bind(
          data.channelId,
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
        WHERE channel_id = ? AND user_id = ?`
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
        data.channelId,
        data.userId
      )
      .run();

    return { isNew: false, changed: hasProfileChanged };
  }

  async markLeft(
    channelId: number,
    userId: number,
    firstName?: string,
    lastName?: string,
    username?: string
  ): Promise<MemberRecord | null> {
    const existing = await this.getMember(channelId, userId);

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
          WHERE channel_id = ? AND user_id = ?`
        )
        .bind(firstName || null, lastName || null, username || null, channelId, userId)
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

  async setManualChannel(
    channelId: number,
    userId: number,
    channelLink: string,
    channelTitle?: string
  ): Promise<boolean> {
    const existing = await this.getMember(channelId, userId);
    if (!existing) {
      await this.db
        .prepare(
          `INSERT INTO members (channel_id, user_id, channel_link, channel_title, auto_detected, status, updated_at)
           VALUES (?, ?, ?, ?, 0, 'member', datetime('now'))`
        )
        .bind(channelId, userId, channelLink, channelTitle || null)
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
        WHERE channel_id = ? AND user_id = ?`
      )
      .bind(channelLink, channelTitle || null, channelId, userId)
      .run();

    return true;
  }

  async getRecentLeftByOwner(ownerId: number, limit = 15): Promise<MemberRecord[]> {
    const { results } = await this.db
      .prepare(
        `SELECT m.* FROM members m
         JOIN channels c ON m.channel_id = c.channel_id
         WHERE c.owner_id = ? AND m.status = 'left'
         ORDER BY m.left_at DESC LIMIT ?`
      )
      .bind(ownerId, limit)
      .all<MemberRecord>();
    return results || [];
  }

  async getActiveMembersByOwner(ownerId: number, limit = 30): Promise<MemberRecord[]> {
    const { results } = await this.db
      .prepare(
        `SELECT m.* FROM members m
         JOIN channels c ON m.channel_id = c.channel_id
         WHERE c.owner_id = ? AND m.status = 'member'
         ORDER BY m.joined_at DESC LIMIT ?`
      )
      .bind(ownerId, limit)
      .all<MemberRecord>();
    return results || [];
  }
}
