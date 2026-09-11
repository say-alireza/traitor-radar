import { Bot, Context } from 'grammy';
import { Env } from './types';
import { MemberDatabase } from './db';

function extractChannelFromBio(bio?: string): { link: string; type: string } | null {
  if (!bio) return null;

  // Check for t.me link (public username or joinchat/invite)
  const linkMatch = bio.match(/(?:https?:\/\/)?(?:t\.me|telegram\.me)\/([a-zA-Z0-9_+]+)/i);
  if (linkMatch) {
    const raw = linkMatch[0];
    const fullLink = raw.startsWith('http') ? raw : `https://${raw}`;
    return { link: fullLink, type: 'bio_link' };
  }

  // Check for @channel tag in bio
  const atMatch = bio.match(/@([a-zA-Z0-9_]{4,})/);
  if (atMatch) {
    return { link: `https://t.me/${atMatch[1]}`, type: 'bio_handle' };
  }

  return null;
}

export function createBot(env: Env) {
  const bot = new Bot(env.BOT_TOKEN);
  const db = new MemberDatabase(env.DB);
  const adminId = parseInt(env.ADMIN_ID || '0', 10);

  // Middleware: restrict command execution to admin
  const adminOnly = (ctx: Context, next: () => Promise<void>) => {
    if (adminId && ctx.from?.id !== adminId) {
      return ctx.reply('Access denied.');
    }
    return next();
  };

  // Command: /start
  bot.command('start', adminOnly, async (ctx) => {
    const text = [
      'Traitor Radar is active.',
      '',
      'Available commands:',
      '/pair <user_id> <channel_link> - Link a channel to a user ID',
      '/info <user_id> - View detailed user history and linked channel',
      '/left - List recent members who left',
      '/list - List active members',
    ].join('\n');
    await ctx.reply(text);
  });

  // Command: /pair <user_id> <channel_link>
  bot.command('pair', adminOnly, async (ctx) => {
    const parts = (ctx.match || '').trim().split(/\s+/);
    if (parts.length < 2) {
      return ctx.reply('Usage: /pair <user_id> <channel_link>');
    }

    const targetUserId = parseInt(parts[0], 10);
    const channelLink = parts[1];

    if (isNaN(targetUserId)) {
      return ctx.reply('Invalid user ID.');
    }

    await db.setManualChannel(targetUserId, channelLink);
    await ctx.reply(`Channel linked successfully for User ID ${targetUserId}:\n${channelLink}`);
  });

  // Command: /info <user_id>
  bot.command('info', adminOnly, async (ctx) => {
    const query = (ctx.match || '').trim();
    const targetUserId = parseInt(query, 10);

    if (isNaN(targetUserId)) {
      return ctx.reply('Usage: /info <user_id>');
    }

    const member = await db.getMember(targetUserId);
    if (!member) {
      return ctx.reply(`No records found for User ID ${targetUserId}.`);
    }

    const history = await db.getProfileHistory(targetUserId);
    const historyLines = history
      .map((h) => `- ${h.first_name || ''} ${h.last_name || ''} (@${h.username || 'none'}) [${h.recorded_at}]`)
      .join('\n');

    const message = [
      `User Report: ${member.user_id}`,
      `Current Name: ${member.first_name || ''} ${member.last_name || ''}`.trim(),
      `Current Username: @${member.username || 'none'}`,
      `Status: ${member.status}`,
      `Linked Channel: ${member.channel_link || 'Not linked'}`,
      `Channel Title: ${member.channel_title || 'N/A'}`,
      `Detection Method: ${member.auto_detected ? 'Automatic' : 'Manual'}`,
      `Joined: ${member.joined_at}`,
      member.left_at ? `Left: ${member.left_at}` : '',
      '',
      'Recorded Name History:',
      historyLines || '- No past records',
    ]
      .filter((line) => line !== '')
      .join('\n');

    await ctx.reply(message);
  });

  // Command: /left
  bot.command('left', adminOnly, async (ctx) => {
    const leftMembers = await db.getRecentLeft(15);
    if (leftMembers.length === 0) {
      return ctx.reply('No recent departures recorded.');
    }

    const lines = leftMembers.map((m, idx) => {
      const name = `${m.first_name || ''} ${m.last_name || ''}`.trim() || 'Unknown';
      const username = m.username ? `@${m.username}` : 'no-username';
      const channel = m.channel_link || 'no-channel-linked';
      return `${idx + 1}. ${name} (${username}) [ID: ${m.user_id}]\n   Channel: ${channel}\n   Left at: ${m.left_at}`;
    });

    await ctx.reply(`Recent Departures:\n\n${lines.join('\n\n')}`);
  });

  // Command: /list
  bot.command('list', adminOnly, async (ctx) => {
    const active = await db.getActiveMembers(25);
    if (active.length === 0) {
      return ctx.reply('No active tracked members in database.');
    }

    const lines = active.map((m, idx) => {
      const name = `${m.first_name || ''} ${m.last_name || ''}`.trim() || 'Unknown';
      const username = m.username ? `@${m.username}` : 'no-username';
      const channel = m.channel_link ? m.channel_link : 'No channel linked';
      return `${idx + 1}. ${name} (${username}) [ID: ${m.user_id}]\n   Channel: ${channel}`;
    });

    await ctx.reply(`Active Tracked Members:\n\n${lines.join('\n\n')}`);
  });

  // Chat member status change handler
  bot.on('chat_member', async (ctx) => {
    const update = ctx.chatMember;
    const oldStatus = update.old_chat_member.status;
    const newStatus = update.new_chat_member.status;
    const user = update.new_chat_member.user;

    const isJoin =
      (oldStatus === 'left' || oldStatus === 'kicked') &&
      (newStatus === 'member' || newStatus === 'administrator' || newStatus === 'creator');

    const isLeave =
      (oldStatus === 'member' || oldStatus === 'administrator') &&
      (newStatus === 'left' || newStatus === 'kicked');

    if (isJoin) {
      let channelLink: string | null = null;
      let channelTitle: string | null = null;
      let bio: string | null = null;
      let autoDetected = false;

      try {
        // Fetch full profile info from Telegram API
        const fullChat = await ctx.api.getChat(user.id);
        bio = 'bio' in fullChat && typeof fullChat.bio === 'string' ? fullChat.bio : null;

        // Check for attached personal_chat (Telegram native feature)
        if ('personal_chat' in fullChat && fullChat.personal_chat) {
          const pc = fullChat.personal_chat as { id: number; title?: string; username?: string };
          channelTitle = pc.title || null;
          channelLink = pc.username ? `https://t.me/${pc.username}` : `Channel ID: ${pc.id}`;
          autoDetected = true;
        } else if (bio) {
          const extracted = extractChannelFromBio(bio);
          if (extracted) {
            channelLink = extracted.link;
            autoDetected = true;
          }
        }
      } catch (err) {
        console.error(`Failed to get full chat info for ${user.id}:`, err);
      }

      await db.saveOrUpdateMember({
        userId: user.id,
        firstName: user.first_name || null,
        lastName: user.last_name || null,
        username: user.username || null,
        bio,
        channelLink,
        channelTitle,
        autoDetected,
        status: 'member',
      });

      if (adminId) {
        const name = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Unknown';
        const lines = [
          'Member Joined:',
          `Name: ${name}`,
          `Username: @${user.username || 'none'}`,
          `User ID: ${user.id}`,
          channelLink
            ? `Detected Channel: ${channelLink} (${autoDetected ? 'Auto-detected' : 'Manual'})`
            : 'Detected Channel: None found',
          !channelLink ? `Link manually with: /pair ${user.id} <channel_link>` : '',
        ]
          .filter(Boolean)
          .join('\n');

        try {
          await ctx.api.sendMessage(adminId, lines);
        } catch (err) {
          console.error('Failed to send admin notification:', err);
        }
      }
    } else if (isLeave) {
      const oldRecord = await db.markLeft(user.id, user.first_name, user.last_name, user.username);
      const history = await db.getProfileHistory(user.id);

      if (adminId) {
        const currentName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Unknown';
        const pastNames = history
          .map((h) => `${h.first_name || ''} ${h.last_name || ''} (@${h.username || 'none'})`.trim())
          .filter((n, idx, arr) => arr.indexOf(n) === idx && n !== '')
          .slice(0, 3)
          .join(' -> ');

        const lines = [
          'ALERT: Member Left Channel',
          `Current Name: ${currentName}`,
          `Current Username: @${user.username || 'none'}`,
          `User ID: ${user.id}`,
          `Linked Channel: ${oldRecord?.channel_link || 'No channel linked'}`,
          oldRecord?.channel_title ? `Channel Title: ${oldRecord.channel_title}` : '',
          pastNames ? `Known Names: ${pastNames}` : '',
        ]
          .filter(Boolean)
          .join('\n');

        try {
          await ctx.api.sendMessage(adminId, lines);
        } catch (err) {
          console.error('Failed to send admin notification:', err);
        }
      }
    }
  });

  return bot;
}
