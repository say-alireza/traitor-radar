export type Lang = 'fa' | 'en';

export const messages = {
  fa: {
    start_welcome: (channels: string) =>
      `به رادار وفاداری خوش آمدید.\n\nاین ربات ورود، خروج و اکانتهای حذفشده در کانال شما را مانیتور کرده و لینک کانال افراد را برای لفت متقابل نگهداری میکند.\n\nکانالهای متصل شما:\n${channels}`,
    help_text:
      `راهنمای استفاده از رادار:\n\n` +
      `۱. افزودن ربات به کانال:\n` +
      `ربات را به عنوان ادمین به کانال روزمرگی خود اد کنید. کانال به صورت خودکار به اکانت شما متصل میشود.\n\n` +
      `۲. نحوه عملکرد:\n` +
      `- هنگام عضویت فرد: ربات کانال متصل به پروفایل یا لینک بیو را ثبت میکند.\n` +
      `- هنگام لفت دادن یا حذف اکانت: ربات با ارسال دکمه مستقیم کانال او، به شما هشدار میدهد.\n\n` +
      `۳. دستورات و دکمهها:\n` +
      `- اعضای فعال: نمایش لیست اعضای ثبتشده\n` +
      `- خروجیها: نمایش آخرین افراد خارجشده و اکانتهای دیلیتی\n` +
      `- استعلام کاربر: /info <user_id>\n` +
      `- اتصال دستی: /pair <user_id> <لینک_کانال>`,
    select_language: 'لطفاً زبان مورد نظر خود را انتخاب کنید:\nPlease select your preferred language:',
    language_set: 'زبان با موفقیت روی فارسی تنظیم شد.',
    btn_active_members: '📋 اعضای فعال',
    btn_departures: '🚪 خروجیها',
    btn_user_info: 'ℹ️ استعلام کاربر',
    btn_help: '❓ راهنما',
    btn_language: '🌐 زبان / Language',
    btn_open_channel: '🔗 ورود به کانال',
    btn_leave_channel: '🚪 خروج از کانال',
    info_prompt: 'برای استعلام کاربر، دستور را به شکل زیر بفرستید:\n/info 123456789',
    pair_prompt: 'برای اتصال دستی کانال به کاربر، دستور را به این شکل بفرستید:\n/pair 123456789 https://t.me/channel',
    no_channels: 'هنوز کانالی به ربات متصل نشده است. ربات را به عنوان ادمین به کانال خود اد کنید.',
    no_active_members: 'هیچ عضو فعالی در دیتابیس ثبت نشده است.',
    no_departures: 'هیچ خروجی اخیری ثبت نشده است.',
    channel_connected: (title: string, id: number) =>
      `کانال با موفقیت متصل شد.\nعنوان: ${title}\nشناسه: ${id}\n\nاز این لحظه ورود و خروج اعضا به شما گزارش داده میشود.`,
    member_joined: (channel: string, name: string, username: string, id: number, targetChannel?: string) =>
      `عضویت جدید [${channel}]:\nنام: ${name}\nیوزرنیم: @${username}\nشناسه: ${id}\n` +
      (targetChannel ? `کانال متصل: ${targetChannel}` : 'کانال متصل: یافت نشد (قابل ثبت با /pair)'),
    member_left: (channel: string, name: string, username: string, id: number, targetChannel: string, pastNames?: string) =>
      `هشدار خروج [${channel}]:\nنام: ${name}\nیوزرنیم: @${username}\nشناسه: ${id}\nکانال: ${targetChannel}` +
      (pastNames ? `\nنامهای پیشین: ${pastNames}` : ''),
    account_deleted: (channel: string, id: number, targetChannel: string, pastNames?: string) =>
      `هشدار حذف اکانت [${channel}]:\nوضعیت: اکانت دیلیت شده\nشناسه: ${id}\nکانال متصل: ${targetChannel}` +
      (pastNames ? `\nنامهای پیشین: ${pastNames}` : ''),
  },
  en: {
    start_welcome: (channels: string) =>
      `Welcome to Traitor Radar.\n\nThis bot monitors joins, leaves, and deleted accounts in your channels, keeping track of members' channels for reciprocal unsubscription.\n\nYour connected channels:\n${channels}`,
    help_text:
      `Traitor Radar Help Guide:\n\n` +
      `1. Connect your channel:\n` +
      `Add this bot as an Administrator to your Telegram channel. It will automatically link to your account.\n\n` +
      `2. How it works:\n` +
      `- On join: Snapshots attached profile channel or bio invite links.\n` +
      `- On leave / delete: Sends an instant alert with a one-tap button to leave their channel.\n\n` +
      `3. Commands:\n` +
      `- Active Members: List currently tracked subscribers\n` +
      `- Departures: List recent unsubscriptions and ghost accounts\n` +
      `- User Info: /info <user_id>\n` +
      `- Manual Link: /pair <user_id> <channel_link>`,
    select_language: 'Please select your preferred language:\nلطفاً زبان مورد نظر را انتخاب کنید:',
    language_set: 'Language successfully updated to English.',
    btn_active_members: '📋 Active Members',
    btn_departures: '🚪 Departures',
    btn_user_info: 'ℹ️ User Info',
    btn_help: '❓ Help',
    btn_language: '🌐 Language / زبان',
    btn_open_channel: '🔗 Open Channel',
    btn_leave_channel: '🚪 Leave Channel',
    info_prompt: 'To look up a user, send the command with their ID:\n/info 123456789',
    pair_prompt: 'To manually pair a channel, send:\n/pair 123456789 https://t.me/channel',
    no_channels: 'No channels connected yet. Add the bot as an Administrator to your channel.',
    no_active_members: 'No active tracked members in your channels.',
    no_departures: 'No recent departures recorded.',
    channel_connected: (title: string, id: number) =>
      `Channel Connected!\nTitle: ${title}\nID: ${id}\n\nAll joins and departures will now be reported to you.`,
    member_joined: (channel: string, name: string, username: string, id: number, targetChannel?: string) =>
      `Member Joined [${channel}]:\nName: ${name}\nUsername: @${username}\nUser ID: ${id}\n` +
      (targetChannel ? `Linked Channel: ${targetChannel}` : 'Linked Channel: None found (link with /pair)'),
    member_left: (channel: string, name: string, username: string, id: number, targetChannel: string, pastNames?: string) =>
      `ALERT: Member Left [${channel}]\nName: ${name}\nUsername: @${username}\nUser ID: ${id}\nLinked Channel: ${targetChannel}` +
      (pastNames ? `\nPast Names: ${pastNames}` : ''),
    account_deleted: (channel: string, id: number, targetChannel: string, pastNames?: string) =>
      `ALERT: Account Deleted [${channel}]\nStatus: Deleted Account\nUser ID: ${id}\nLinked Channel: ${targetChannel}` +
      (pastNames ? `\nPast Names: ${pastNames}` : ''),
  },
};
