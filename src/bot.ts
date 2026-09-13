import { Bot } from 'grammy';
import { Env } from './types';
import { MemberDatabase } from './db';

function extractChannelFromBio(bio?: string): { link: string; type: string } | null {
  if (!bio) return null;

  const linkMatch = bio.match(/(?:https?:\/\/)?(?:t\.me|telegram\.me)\/([a-zA-Z0-9_+]+)/i);
  if (linkMatch) {
    const raw = linkMatch[0];
    const fullLink = raw.startsWith('http') ? raw : `https://${raw}`;
    return { link: fullLink, type: 'bio_link' };
  }

  const atMatch = bio.match(/@([a-zA-Z0-9_]{4,})/);
  if (atMatch) {
    return { link: `https://t.me/${atMatch[1]}`, type: 'bio_handle' };
  }

  return null;
}

export function createBot(env: Env) {
  const bot = new Bot(env.BOT_TOKEN);
  const db = new MemberDatabase(env.DB);

  // Command: /start
  bot.command('start', async (ctx) => {
    if (ctx.chat.type !== 'private') return;

    const userChannels = await db.getChannelsByOwner(ctx.from!.id);
    const channelList = userChannels.length
      ? userChannels.map((c) => `- ${c.title || 'Untitled'} (ID: ${c.channel_id})`).join('\n')
      : '- No channels connected yet.';

    const text = [
      'Traitor Radar is active.',
      '',
      'How to use:',
      '1. Add this bot as an Administrator to your Telegram channel.',
      '2. The bot will automatically link your channel to your account.',
      '3. You will receive instant alerts when someone joins or leaves.',
      '',
      'Your Connected Channels:',
      channelList,
      '',
      'Commands:',
      '/pair <user_id> <channel_link> - Manually link a channel to a user ID',
      '/info <user_id> - View detailed user history',
      '/left - List recent members who left your channels',
      '/list - List active members in your channels',
    ].join('\n');

    await ctx.reply(text);
  });

  // Command: /pair <user_id> <channel_link>
  bot.command('pair', async (ctx) => {
    if (ctx.chat.type !== 'private') return;

    const parts = (ctx.match || '').trim().split(/\s+/);
    if (parts.length < 2) {
      return ctx.reply('Usage: /pair <user_id> <channel_link>');
    }

    const targetUserId = parseInt(parts[0], 10);
    const channelLink = parts[1];

    if (isNaN(targetUserId)) {
      return ctx.reply('Invalid user ID.');
    }

    const userChannels = await db.getChannelsByOwner(ctx.from!.id);
    if (userChannels.length === 0) {
      return ctx.reply('You do not have any connected channels yet. Add the bot to your channel first.');
    }

    const primaryChannel = userChannels[0];
    await db.setManualChannel(primaryChannel.channel_id, targetUserId, channelLink);
    await ctx.reply(`Channel linked successfully for User ID ${targetUserId}:\n${channelLink}`);
  });

  // Command: /info <user_id>
  bot.command('info', async (ctx) => {
    if (ctx.chat.type !== 'private') return;

    const query = (ctx.match || '').trim();
    const targetUserId = parseInt(query, 10);

    if (isNaN(targetUserId)) {
      return ctx.reply('Usage: /info <user_id>');
    }

    const records = await db.getMemberAcrossChannels(targetUserId);
    const history = await db.getProfileHistory(targetUserId);

    if (records.length === 0 && history.length === 0) {
      return ctx.reply(`No records found for User ID ${targetUserId}.`);
    }

    const member = records[0];
    const historyLines = history
      .map((h) => `- ${h.first_name || ''} ${h.last_name || ''} (@${h.username || 'none'}) [${h.recorded_at}]`)
      .join('\n');

    const message = [
      `User Report: ${targetUserId}`,
      `Current Name: ${member?.first_name || ''} ${member?.last_name || ''}`.trim(),
      `Current Username: @${member?.username || 'none'}`,
      `Status: ${member?.status || 'unknown'}`,
      `Linked Channel: ${member?.channel_link || 'Not linked'}`,
      `Channel Title: ${member?.channel_title || 'N/A'}`,
      `Detection: ${member?.auto_detected ? 'Automatic' : 'Manual'}`,
      member?.joined_at ? `Joined: ${member.joined_at}` : '',
      member?.left_at ? `Left: ${member.left_at}` : '',
      '',
      'Recorded Name History:',
      historyLines || '- No past records',
    ]
      .filter((line) => line !== '')
      .join('\n');

    await ctx.reply(message);
  });

  // Command: /left
  bot.command('left', async (ctx) => {
    if (ctx.chat.type !== 'private') return;

    const leftMembers = await db.getRecentLeftByOwner(ctx.from!.id, 15);
    if (leftMembers.length === 0) {
      return ctx.reply('No recent departures recorded for your channels.');
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
  bot.command('list', async (ctx) => {
    if (ctx.chat.type !== 'private') return;

    const active = await db.getActiveMembersByOwner(ctx.from!.id, 25);
    if (active.length === 0) {
      return ctx.reply('No active tracked members in your channels.');
    }

    const lines = active.map((m, idx) => {
      const name = `${m.first_name || ''} ${m.last_name || ''}`.trim() || 'Unknown';
      const username = m.username ? `@${m.username}` : 'no-username';
      const channel = m.channel_link ? m.channel_link : 'No channel linked';
      return `${idx + 1}. ${name} (${username}) [ID: ${m.user_id}]\n   Channel: ${channel}`;
    });

    await ctx.reply(`Active Tracked Members:\n\n${lines.join('\n\n')}`);
  });

  // Bot added to a channel handler (multi-tenant registration)
  bot.on('my_chat_member', async (ctx) => {
    const update = ctx.myChatMember;
    const chat = update.chat;
    const from = update.from;
    const newStatus = update.new_chat_member.status;

    if (chat.type === 'channel' && (newStatus === 'administrator' || newStatus === 'creator')) {
      const channelTitle = chat.title || 'Untitled Channel';
      const channelUsername = chat.username || null;

      await db.registerChannel(chat.id, from.id, channelTitle, channelUsername);

      try {
        await ctx.api.sendMessage(
          from.id,
          `Channel Connected!\nTitle: ${channelTitle}\nID: ${chat.id}\n\nAll member joins and leaves will now be reported directly to you.`
        );
      } catch (err) {
        console.error('Failed to notify owner on channel addition:', err);
      }
    }
  });

  // Channel member join/leave event handler
  bot.on('chat_member', async (ctx) => {
    const update = ctx.chatMember;
    const channelId = update.chat.id;
    const oldStatus = update.old_chat_member.status;
    const newStatus = update.new_chat_member.status;
    const user = update.new_chat_member.user;

    // Retrieve channel owner from D1
    const channelRecord = await db.getChannel(channelId);
    const ownerId = channelRecord?.owner_id;

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
        const fullChat = await ctx.api.getChat(user.id);
        bio = 'bio' in fullChat && typeof fullChat.bio === 'string' ? fullChat.bio : null;

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
        channelId,
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

      if (ownerId) {
        const name = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Unknown';
        const lines = [
          `Member Joined [${channelRecord?.title || 'Channel'}]:`,
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
          await ctx.api.sendMessage(ownerId, lines);
        } catch (err) {
          console.error('Failed to send join notification to owner:', err);
        }
      }
    } else if (isLeave) {
      const oldRecord = await db.markLeft(
        channelId,
        user.id,
        user.first_name,
        user.last_name,
        user.username
      );
      const history = await db.getProfileHistory(user.id);

      if (ownerId) {
        const currentName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Unknown';
        const pastNames = history
          .map((h) => `${h.first_name || ''} ${h.last_name || ''} (@${h.username || 'none'})`.trim())
          .filter((n, idx, arr) => arr.indexOf(n) === idx && n !== '')
          .slice(0, 3)
          .join(' -> ');

        const lines = [
          `ALERT: Member Left [${channelRecord?.title || 'Channel'}]`,
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
          await ctx.api.sendMessage(ownerId, lines);
        } catch (err) {
          console.error('Failed to send leave notification to owner:', err);
        }
      }
    }
  });

  return bot;
}
