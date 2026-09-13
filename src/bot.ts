import { Bot, InlineKeyboard } from 'grammy';
import { Env } from './types';
import { MemberDatabase } from './db';

function extractChannelFromBio(bio?: string): { link: string; type: string } | null {
  if (!bio) return null;

  // 1. Private invite link (modern: t.me/+...)
  const privateMatch = bio.match(/(?:https?:\/\/)?(?:t\.me|telegram\.me)\/\+([a-zA-Z0-9_-]+)/i);
  if (privateMatch) {
    const raw = privateMatch[0];
    return { link: raw.startsWith('http') ? raw : `https://${raw}`, type: 'private_invite' };
  }

  // 2. Legacy private invite link (t.me/joinchat/...)
  const legacyMatch = bio.match(/(?:https?:\/\/)?(?:t\.me|telegram\.me)\/joinchat\/([a-zA-Z0-9_-]+)/i);
  if (legacyMatch) {
    const raw = legacyMatch[0];
    return { link: raw.startsWith('http') ? raw : `https://${raw}`, type: 'legacy_invite' };
  }

  // 3. Public channel URL (t.me/channel_name)
  const publicMatch = bio.match(/(?:https?:\/\/)?(?:t\.me|telegram\.me)\/([a-zA-Z0-9_]{4,})/i);
  if (publicMatch) {
    const raw = publicMatch[0];
    return { link: raw.startsWith('http') ? raw : `https://${raw}`, type: 'public_link' };
  }

  // 4. Handle in bio (@channel_name)
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
      'Features:',
      '- Automatic public profile channel detection',
      '- Bio private invite link snapshotting',
      '- Stealth departure & deleted account tracking',
      '',
      'Connected Channels:',
      channelList,
      '',
      'Commands:',
      '/pair <user_id> <channel_link> - Manually link a channel to a user ID',
      '/info <user_id> - View detailed history & linked channel',
      '/left - List recent departures and ghost accounts',
      '/list - List active members',
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
      return ctx.reply('You do not have any connected channels. Add the bot to your channel first.');
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
      `Status: ${member?.status || 'unknown'}${member?.is_deleted ? ' (Deleted Account)' : ''}`,
      `Linked Channel: ${member?.channel_link || 'Not linked'}`,
      `Bio Link: ${member?.bio_link || 'None'}`,
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

    const keyboard = member?.channel_link && member.channel_link.startsWith('http')
      ? new InlineKeyboard().url('Open Channel', member.channel_link)
      : undefined;

    await ctx.reply(message, { reply_markup: keyboard });
  });

  // Command: /left
  bot.command('left', async (ctx) => {
    if (ctx.chat.type !== 'private') return;

    const departures = await db.getRecentDeparturesByOwner(ctx.from!.id, 15);
    if (departures.length === 0) {
      return ctx.reply('No recent departures recorded for your channels.');
    }

    const lines = departures.map((m, idx) => {
      const name = `${m.first_name || ''} ${m.last_name || ''}`.trim() || 'Unknown';
      const username = m.username ? `@${m.username}` : 'no-username';
      const channel = m.channel_link || 'no-channel-linked';
      const statusLabel = m.status === 'deleted_account' ? '[DELETED ACCOUNT]' : '[LEFT]';
      return `${idx + 1}. ${name} (${username}) ${statusLabel} [ID: ${m.user_id}]\n   Channel: ${channel}\n   Time: ${m.left_at}`;
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

  // Bot added to a channel handler
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
          `Channel Connected!\nTitle: ${channelTitle}\nID: ${chat.id}\n\nAll member joins, leaves, and deleted accounts will now be reported directly to you.`
        );
      } catch (err) {
        console.error('Failed to notify owner on channel addition:', err);
      }
    }
  });

  // Channel member status change handler
  bot.on('chat_member', async (ctx) => {
    const update = ctx.chatMember;
    const channelId = update.chat.id;
    const oldStatus = update.old_chat_member.status;
    const newStatus = update.new_chat_member.status;
    const user = update.new_chat_member.user;

    const channelRecord = await db.getChannel(channelId);
    const ownerId = channelRecord?.owner_id;

    const isDeletedAccount =
      user.first_name === 'Deleted Account' ||
      (user as any).is_deleted === true;

    const isJoin =
      (oldStatus === 'left' || oldStatus === 'kicked') &&
      (newStatus === 'member' || newStatus === 'administrator' || newStatus === 'creator');

    const isLeave =
      (oldStatus === 'member' || oldStatus === 'administrator') &&
      (newStatus === 'left' || newStatus === 'kicked');

    if (isJoin) {
      let channelLink: string | null = null;
      let channelTitle: string | null = null;
      let bioLink: string | null = null;
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
        }

        if (bio) {
          const extracted = extractChannelFromBio(bio);
          if (extracted) {
            bioLink = extracted.link;
            if (!channelLink) {
              channelLink = extracted.link;
              autoDetected = true;
            }
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
        bioLink,
        autoDetected,
        isDeleted: isDeletedAccount,
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
          bioLink && bioLink !== channelLink ? `Bio Invite Link: ${bioLink}` : '',
          !channelLink ? `Link manually with: /pair ${user.id} <channel_link>` : '',
        ]
          .filter(Boolean)
          .join('\n');

        const keyboard = channelLink && channelLink.startsWith('http')
          ? new InlineKeyboard().url('Open Channel', channelLink)
          : undefined;

        try {
          await ctx.api.sendMessage(ownerId, lines, { reply_markup: keyboard });
        } catch (err) {
          console.error('Failed to send join notification to owner:', err);
        }
      }
    } else if (isLeave || isDeletedAccount) {
      const oldRecord = await db.markLeftOrDeleted(
        channelId,
        user.id,
        user.first_name,
        user.last_name,
        user.username,
        isDeletedAccount
      );
      const history = await db.getProfileHistory(user.id);

      if (ownerId) {
        const currentName = isDeletedAccount
          ? 'Deleted Account'
          : `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Unknown';

        const pastNames = history
          .map((h) => `${h.first_name || ''} ${h.last_name || ''} (@${h.username || 'none'})`.trim())
          .filter((n, idx, arr) => arr.indexOf(n) === idx && n !== '')
          .slice(0, 3)
          .join(' -> ');

        const alertTitle = isDeletedAccount
          ? `ALERT: Account Deleted [${channelRecord?.title || 'Channel'}]`
          : `ALERT: Member Left [${channelRecord?.title || 'Channel'}]`;

        const targetChannel = oldRecord?.channel_link || oldRecord?.bio_link || 'No channel linked';

        const lines = [
          alertTitle,
          `Current Name: ${currentName}`,
          `Current Username: @${user.username || 'none'}`,
          `User ID: ${user.id}`,
          `Linked Channel: ${targetChannel}`,
          oldRecord?.channel_title ? `Channel Title: ${oldRecord.channel_title}` : '',
          pastNames ? `Known Names: ${pastNames}` : '',
        ]
          .filter(Boolean)
          .join('\n');

        const keyboard = targetChannel.startsWith('http')
          ? new InlineKeyboard().url('Leave / Open Channel', targetChannel)
          : undefined;

        try {
          await ctx.api.sendMessage(ownerId, lines, { reply_markup: keyboard });
        } catch (err) {
          console.error('Failed to send departure alert to owner:', err);
        }
      }
    }
  });

  return bot;
}
