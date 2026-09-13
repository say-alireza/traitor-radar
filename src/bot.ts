import { Bot, InlineKeyboard, Keyboard } from 'grammy';
import { Env, Language } from './types';
import { MemberDatabase } from './db';
import { messages } from './i18n';

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

function getMainMenuKeyboard(lang: Language): Keyboard {
  const t = messages[lang];
  return new Keyboard()
    .text(t.btn_active_members)
    .text(t.btn_departures)
    .row()
    .text(t.btn_user_info)
    .text(t.btn_help)
    .row()
    .text(t.btn_language)
    .resized()
    .persistent();
}

function getLanguageInlineKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🇮🇷 فارسی', 'set_lang_fa')
    .text('🇬🇧 English', 'set_lang_en');
}

export function createBot(env: Env) {
  const bot = new Bot(env.BOT_TOKEN);
  const db = new MemberDatabase(env.DB);

  // Command: /start
  bot.command('start', async (ctx) => {
    if (ctx.chat.type !== 'private') return;

    const lang = await db.getUserLanguage(ctx.from!.id);
    const t = messages[lang];
    const userChannels = await db.getChannelsByOwner(ctx.from!.id);
    const channelList = userChannels.length
      ? userChannels.map((c) => `- ${c.title || 'Untitled'} (ID: ${c.channel_id})`).join('\n')
      : `- ${t.no_channels}`;

    await ctx.reply(t.start_welcome(channelList), {
      reply_markup: getMainMenuKeyboard(lang),
    });
  });

  // Command: /help or Help button
  const handleHelp = async (ctx: any) => {
    if (ctx.chat?.type !== 'private') return;
    const lang = await db.getUserLanguage(ctx.from.id);
    await ctx.reply(messages[lang].help_text, {
      reply_markup: getMainMenuKeyboard(lang),
    });
  };
  bot.command('help', handleHelp);
  bot.hears(['❓ راهنما', '❓ Help'], handleHelp);

  // Command: /lang or Language button
  const handleLanguagePrompt = async (ctx: any) => {
    if (ctx.chat?.type !== 'private') return;
    const lang = await db.getUserLanguage(ctx.from.id);
    await ctx.reply(messages[lang].select_language, {
      reply_markup: getLanguageInlineKeyboard(),
    });
  };
  bot.command('lang', handleLanguagePrompt);
  bot.command('language', handleLanguagePrompt);
  bot.hears(['🌐 زبان / Language', '🌐 Language / زبان'], handleLanguagePrompt);

  // Callback query: Language selection
  bot.callbackQuery(/^set_lang_(fa|en)$/, async (ctx) => {
    const selectedLang = ctx.match[1] as Language;
    await db.setUserLanguage(ctx.from.id, selectedLang);
    const t = messages[selectedLang];

    await ctx.answerCallbackQuery({ text: t.language_set });
    await ctx.editMessageText(t.language_set);
    await ctx.reply(t.start_welcome(''), {
      reply_markup: getMainMenuKeyboard(selectedLang),
    });
  });

  // Command: /list or Active Members button
  const handleList = async (ctx: any) => {
    if (ctx.chat?.type !== 'private') return;
    const lang = await db.getUserLanguage(ctx.from.id);
    const t = messages[lang];

    const active = await db.getActiveMembersByOwner(ctx.from.id, 25);
    if (active.length === 0) {
      return ctx.reply(t.no_active_members, {
        reply_markup: getMainMenuKeyboard(lang),
      });
    }

    const titleHeader = lang === 'fa' ? 'اعضای فعال کانال:' : 'Active Tracked Members:';
    const lines = active.map((m, idx) => {
      const name = `${m.first_name || ''} ${m.last_name || ''}`.trim() || 'Unknown';
      const username = m.username ? `@${m.username}` : 'no-username';
      const channel = m.channel_link ? m.channel_link : (lang === 'fa' ? 'بدون کانال متصل' : 'No channel linked');
      return `${idx + 1}. ${name} (${username}) [ID: ${m.user_id}]\n   Channel: ${channel}`;
    });

    await ctx.reply(`${titleHeader}\n\n${lines.join('\n\n')}`, {
      reply_markup: getMainMenuKeyboard(lang),
    });
  };
  bot.command('list', handleList);
  bot.hears(['📋 اعضای فعال', '📋 Active Members'], handleList);

  // Command: /left or Departures button
  const handleLeft = async (ctx: any) => {
    if (ctx.chat?.type !== 'private') return;
    const lang = await db.getUserLanguage(ctx.from.id);
    const t = messages[lang];

    const departures = await db.getRecentDeparturesByOwner(ctx.from.id, 15);
    if (departures.length === 0) {
      return ctx.reply(t.no_departures, {
        reply_markup: getMainMenuKeyboard(lang),
      });
    }

    const titleHeader = lang === 'fa' ? 'خروجیهای اخیر:' : 'Recent Departures:';
    const lines = departures.map((m, idx) => {
      const name = `${m.first_name || ''} ${m.last_name || ''}`.trim() || 'Unknown';
      const username = m.username ? `@${m.username}` : 'no-username';
      const channel = m.channel_link || m.bio_link || (lang === 'fa' ? 'بدون لینک' : 'No link');
      const statusLabel = m.status === 'deleted_account'
        ? (lang === 'fa' ? '[اکانت حذفشده]' : '[DELETED ACCOUNT]')
        : (lang === 'fa' ? '[خروج]' : '[LEFT]');
      return `${idx + 1}. ${name} (${username}) ${statusLabel} [ID: ${m.user_id}]\n   Channel: ${channel}\n   Time: ${m.left_at}`;
    });

    await ctx.reply(`${titleHeader}\n\n${lines.join('\n\n')}`, {
      reply_markup: getMainMenuKeyboard(lang),
    });
  };
  bot.command('left', handleLeft);
  bot.hears(['🚪 خروجیها', '🚪 Departures'], handleLeft);

  // Button: User info prompt
  bot.hears(['ℹ️ استعلام کاربر', 'ℹ️ User Info'], async (ctx) => {
    if (ctx.chat?.type !== 'private' || !ctx.from) return;
    const lang = await db.getUserLanguage(ctx.from.id);
    await ctx.reply(messages[lang].info_prompt, {
      reply_markup: getMainMenuKeyboard(lang),
    });
  });

  // Command: /pair <user_id> <channel_link>
  bot.command('pair', async (ctx) => {
    if (ctx.chat?.type !== 'private' || !ctx.from) return;
    const lang = await db.getUserLanguage(ctx.from.id);
    const t = messages[lang];

    const parts = (ctx.match || '').trim().split(/\s+/);
    if (parts.length < 2) {
      return ctx.reply(t.pair_prompt, {
        reply_markup: getMainMenuKeyboard(lang),
      });
    }

    const targetUserId = parseInt(parts[0], 10);
    const channelLink = parts[1];

    if (isNaN(targetUserId)) {
      return ctx.reply(lang === 'fa' ? 'شناسه عددی نامعتبر است.' : 'Invalid numeric user ID.');
    }

    const userChannels = await db.getChannelsByOwner(ctx.from.id);
    if (userChannels.length === 0) {
      return ctx.reply(t.no_channels, {
        reply_markup: getMainMenuKeyboard(lang),
      });
    }

    const primaryChannel = userChannels[0];
    await db.setManualChannel(primaryChannel.channel_id, targetUserId, channelLink);
    await ctx.reply(
      lang === 'fa'
        ? `کانال برای شناسه ${targetUserId} با موفقیت ثبت شد:\n${channelLink}`
        : `Channel linked successfully for User ID ${targetUserId}:\n${channelLink}`,
      { reply_markup: getMainMenuKeyboard(lang) }
    );
  });

  // Command: /info <user_id>
  bot.command('info', async (ctx) => {
    if (ctx.chat?.type !== 'private' || !ctx.from) return;
    const lang = await db.getUserLanguage(ctx.from.id);
    const t = messages[lang];

    const query = (ctx.match || '').trim();
    const targetUserId = parseInt(query, 10);

    if (isNaN(targetUserId)) {
      return ctx.reply(t.info_prompt, {
        reply_markup: getMainMenuKeyboard(lang),
      });
    }

    const records = await db.getMemberAcrossChannels(targetUserId);
    const history = await db.getProfileHistory(targetUserId);

    if (records.length === 0 && history.length === 0) {
      return ctx.reply(
        lang === 'fa'
          ? `هیچ رکوردی برای شناسه ${targetUserId} یافت نشد.`
          : `No records found for User ID ${targetUserId}.`
      );
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
      ? new InlineKeyboard().url(t.btn_open_channel, member.channel_link)
      : undefined;

    await ctx.reply(message, { reply_markup: keyboard });
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

      const lang = await db.getUserLanguage(from.id);
      const t = messages[lang];

      try {
        await ctx.api.sendMessage(from.id, t.channel_connected(channelTitle, chat.id), {
          reply_markup: getMainMenuKeyboard(lang),
        });
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
        const lang = await db.getUserLanguage(ownerId);
        const t = messages[lang];
        const name = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Unknown';
        const channelName = channelRecord?.title || 'Channel';

        const alertText = t.member_joined(
          channelName,
          name,
          user.username || 'none',
          user.id,
          channelLink || bioLink || undefined
        );

        const keyboard = channelLink && channelLink.startsWith('http')
          ? new InlineKeyboard().url(t.btn_open_channel, channelLink)
          : undefined;

        try {
          await ctx.api.sendMessage(ownerId, alertText, { reply_markup: keyboard });
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
        const lang = await db.getUserLanguage(ownerId);
        const t = messages[lang];
        const channelName = channelRecord?.title || 'Channel';
        const targetChannel = oldRecord?.channel_link || oldRecord?.bio_link || (lang === 'fa' ? 'بدون کانال ثبتشده' : 'No channel linked');

        const pastNames = history
          .map((h) => `${h.first_name || ''} ${h.last_name || ''} (@${h.username || 'none'})`.trim())
          .filter((n, idx, arr) => arr.indexOf(n) === idx && n !== '')
          .slice(0, 3)
          .join(' -> ');

        let alertText = '';
        if (isDeletedAccount) {
          alertText = t.account_deleted(channelName, user.id, targetChannel, pastNames);
        } else {
          const currentName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Unknown';
          alertText = t.member_left(channelName, currentName, user.username || 'none', user.id, targetChannel, pastNames);
        }

        const keyboard = targetChannel.startsWith('http')
          ? new InlineKeyboard().url(t.btn_leave_channel, targetChannel)
          : undefined;

        try {
          await ctx.api.sendMessage(ownerId, alertText, { reply_markup: keyboard });
        } catch (err) {
          console.error('Failed to send departure alert to owner:', err);
        }
      }
    }
  });

  return bot;
}
