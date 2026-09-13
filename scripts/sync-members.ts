import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions';
import * as input from 'input';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const SESSION_FILE = path.join(__dirname, '..', '.telegram_session');

function extractChannelFromBio(bio?: string): { link: string; type: string } | null {
  if (!bio) return null;

  const privateMatch = bio.match(/(?:https?:\/\/)?(?:t\.me|telegram\.me)\/\+([a-zA-Z0-9_-]+)/i);
  if (privateMatch) {
    const raw = privateMatch[0];
    return { link: raw.startsWith('http') ? raw : `https://${raw}`, type: 'private_invite' };
  }

  const legacyMatch = bio.match(/(?:https?:\/\/)?(?:t\.me|telegram\.me)\/joinchat\/([a-zA-Z0-9_-]+)/i);
  if (legacyMatch) {
    const raw = legacyMatch[0];
    return { link: raw.startsWith('http') ? raw : `https://${raw}`, type: 'legacy_invite' };
  }

  const publicMatch = bio.match(/(?:https?:\/\/)?(?:t\.me|telegram\.me)\/([a-zA-Z0-9_]{4,})/i);
  if (publicMatch) {
    const raw = publicMatch[0];
    return { link: raw.startsWith('http') ? raw : `https://${raw}`, type: 'public_link' };
  }

  const atMatch = bio.match(/@([a-zA-Z0-9_]{4,})/);
  if (atMatch) {
    return { link: `https://t.me/${atMatch[1]}`, type: 'bio_handle' };
  }

  return null;
}

function escapeSql(str: string | null | undefined): string {
  if (str === null || str === undefined) return 'NULL';
  return `'${str.replace(/'/g, "''")}'`;
}

async function main() {
  console.log('=== Telegram Channel Historical Member Sync ===\n');

  let savedSession = '';
  if (fs.existsSync(SESSION_FILE)) {
    savedSession = fs.readFileSync(SESSION_FILE, 'utf-8').trim();
  }

  let apiId = parseInt(process.env.TELEGRAM_API_ID || '', 10);
  let apiHash = process.env.TELEGRAM_API_HASH || '';

  if (!apiId || !apiHash) {
    console.log('You can get API ID & Hash from https://my.telegram.org (under API development tools).');
    const inputApiId = await input.text('Enter Telegram API ID: ');
    apiId = parseInt(inputApiId, 10);
    apiHash = await input.text('Enter Telegram API Hash: ');
  }

  const session = new StringSession(savedSession);
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => await input.text('Enter your phone number (with country code, e.g. +989...): '),
    password: async () => await input.password('Enter your 2FA password (if enabled): '),
    phoneCode: async () => await input.text('Enter the code you received on Telegram: '),
    onError: (err) => console.error(err),
  });

  console.log('\nLogged in successfully as Telegram User.');
  fs.writeFileSync(SESSION_FILE, client.session.save() as any, 'utf-8');

  const channelInput = await input.text('Enter Channel username or link (e.g. @mychannel or https://t.me/mychannel): ');
  const cleanChannel = channelInput.replace('https://t.me/', '').replace('@', '').trim();

  console.log(`\nResolving channel: ${cleanChannel}...`);
  const channelEntity: any = await client.getEntity(cleanChannel);
  const channelId = parseInt(channelEntity.id.toString(), 10);
  const channelTitle = channelEntity.title || cleanChannel;

  console.log(`Channel found: ${channelTitle} (ID: ${channelId})`);
  console.log('Fetching participants list...');

  const participants = await client.getParticipants(channelEntity, {
    limit: 500,
  });

  console.log(`Found ${participants.length} participants. Scanning profiles and attached channels...\n`);

  const sqlStatements: string[] = [];
  const me: any = await client.getMe();
  const ownerId = parseInt(me.id.toString(), 10);

  // Register channel in D1
  sqlStatements.push(
    `INSERT INTO channels (channel_id, owner_id, title, username, updated_at) VALUES (${channelId}, ${ownerId}, ${escapeSql(
      channelTitle
    )}, ${escapeSql(cleanChannel)}, datetime('now')) ON CONFLICT(channel_id) DO UPDATE SET owner_id = excluded.owner_id, title = excluded.title, updated_at = datetime('now');`
  );

  let detectedCount = 0;

  for (let i = 0; i < participants.length; i++) {
    const user = participants[i];
    const userId = parseInt(user.id.toString(), 10);
    const firstName = user.firstName || null;
    const lastName = user.lastName || null;
    const username = user.username || null;
    let bio: string | null = null;
    let channelLink: string | null = null;
    let channelTitleExt: string | null = null;
    let bioLink: string | null = null;
    let autoDetected = 0;

    try {
      const fullUserResult: any = await client.invoke(
        new Api.users.GetFullUser({
          id: user,
        })
      );

      const fullUser = fullUserResult.fullUser;
      bio = fullUser?.about || null;

      // Check attached personal channel
      if (fullUser?.personalChannelId) {
        const pcId = fullUser.personalChannelId.toString();
        // Check chats in response
        const foundChat = fullUserResult.chats?.find((c: any) => c.id.toString() === pcId);
        channelTitleExt = foundChat?.title || null;
        channelLink = foundChat?.username ? `https://t.me/${foundChat.username}` : `Channel ID: ${pcId}`;
        autoDetected = 1;
      }

      if (bio) {
        const extracted = extractChannelFromBio(bio);
        if (extracted) {
          bioLink = extracted.link;
          if (!channelLink) {
            channelLink = extracted.link;
            autoDetected = 1;
          }
        }
      }
    } catch (err) {
      // Ignored for privacy restricted profiles
    }

    if (channelLink) detectedCount++;

    const isDeleted = user.deleted ? 1 : 0;
    const status = isDeleted ? 'deleted_account' : 'member';

    sqlStatements.push(
      `INSERT INTO members (
        channel_id, user_id, first_name, last_name, username, bio,
        channel_link, channel_title, bio_link, status, auto_detected, is_deleted,
        joined_at, updated_at
      ) VALUES (
        ${channelId}, ${userId}, ${escapeSql(firstName)}, ${escapeSql(lastName)}, ${escapeSql(username)}, ${escapeSql(bio)},
        ${escapeSql(channelLink)}, ${escapeSql(channelTitleExt)}, ${escapeSql(bioLink)}, ${escapeSql(status)}, ${autoDetected}, ${isDeleted},
        datetime('now'), datetime('now')
      ) ON CONFLICT(channel_id, user_id) DO UPDATE SET
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        username = excluded.username,
        bio = excluded.bio,
        channel_link = COALESCE(members.channel_link, excluded.channel_link),
        channel_title = COALESCE(members.channel_title, excluded.channel_title),
        bio_link = COALESCE(members.bio_link, excluded.bio_link),
        status = excluded.status,
        is_deleted = excluded.is_deleted,
        updated_at = datetime('now');`
    );

    const displayName = `${firstName || ''} ${lastName || ''}`.trim() || 'Unknown';
    console.log(
      `[${i + 1}/${participants.length}] ${displayName} (@${username || 'none'}) -> ${
        channelLink ? `Channel: ${channelLink}` : 'No channel detected'
      }`
    );
  }

  const sqlFilePath = path.join(__dirname, '..', 'sync_import.sql');
  fs.writeFileSync(sqlFilePath, sqlStatements.join('\n'), 'utf-8');

  console.log(`\nGenerated SQL migration with ${sqlStatements.length} records (${detectedCount} channels detected).`);
  console.log('Importing into remote Cloudflare D1 database (traitor-db)...');

  try {
    execSync('npx wrangler d1 execute traitor-db --remote --file=./sync_import.sql', {
      stdio: 'inherit',
    });
    console.log('\nAll historical members and channels successfully imported to Cloudflare D1!');
  } catch (err) {
    console.error('Failed to execute D1 migration automatically. You can run manually:\nnpx wrangler d1 execute traitor-db --remote --file=./sync_import.sql');
  }

  await client.disconnect();
}

main().catch(console.error);
