# Technical Architecture & Implementation Plan

## 1. System Components

```text
[Telegram Channel] ──(Join / Leave / Delete)──► [Cloudflare Worker (Webhook)]
                                                          │
                                         ┌────────────────┴────────────────┐
                                         ▼                                 ▼
                                [grammY Bot Logic]               [Telegram Bot API]
                                         │                       (getChat / sendMessage)
                                         ▼
                             [Cloudflare D1 Database]
                               (SQLite at the Edge)
```

---

## 2. Database Schema Design (D1 SQLite)

```sql
-- Multi-tenant registered channels
CREATE TABLE IF NOT EXISTS channels (
    channel_id INTEGER PRIMARY KEY,
    owner_id INTEGER NOT NULL,
    title TEXT,
    username TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Member tracking with channel snapshot fields
CREATE TABLE IF NOT EXISTS members (
    channel_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    first_name TEXT,
    last_name TEXT,
    username TEXT,
    bio TEXT,
    channel_link TEXT,           -- Best resolved link (personal_chat or bio)
    channel_title TEXT,
    bio_link TEXT,               -- Dedicated private invite or bio link
    status TEXT DEFAULT 'member', -- member, left, kicked, deleted_account
    auto_detected INTEGER DEFAULT 0,
    is_deleted INTEGER DEFAULT 0,
    joined_at TEXT DEFAULT (datetime('now')),
    left_at TEXT,
    updated_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (channel_id, user_id),
    FOREIGN KEY(channel_id) REFERENCES channels(channel_id)
);

-- Historical log of profile modifications
CREATE TABLE IF NOT EXISTS profile_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    first_name TEXT,
    last_name TEXT,
    username TEXT,
    bio TEXT,
    recorded_at TEXT DEFAULT (datetime('now'))
);
```

---

## 3. Extraction & Event Routing Logic

1. **On Join Event (`ChatMemberUpdated`):**
   - Query `api.getChat(user_id)`:
     - Check `personal_chat` (native Telegram profile channel).
     - Check `bio` for Regex patterns:
       - Private invite link: `(?:https?:\/\/)?(?:t\.me|telegram\.me)\/\+([a-zA-Z0-9_-]+)`
       - Legacy invite link: `(?:https?:\/\/)?(?:t\.me|telegram\.me)\/joinchat\/([a-zA-Z0-9_-]+)`
       - Public username link: `(?:https?:\/\/)?(?:t\.me|telegram\.me)\/([a-zA-Z0-9_]{4,})`
       - Handle in bio: `@([a-zA-Z0-9_]{4,})`
   - Store in D1.
   - Send interactive join notification with Inline Keyboard button linking to the detected channel.

2. **On Leave / Deleted Account Event:**
   - Detect if `user.first_name == 'Deleted Account'` or status transitions to `left`/`kicked`.
   - Update status in D1 with `left_at = datetime('now')`.
   - Query previous records and profile history.
   - Send alert to channel owner with Inline Button `[Open / Leave Channel]` targeting their stored `channel_link`.
