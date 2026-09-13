-- Users table: stores user preferences such as interface language
CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY,
    language TEXT DEFAULT 'fa',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Channels table: maps each channel to its owner
CREATE TABLE IF NOT EXISTS channels (
    channel_id INTEGER PRIMARY KEY,
    owner_id INTEGER NOT NULL,
    title TEXT,
    username TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Members table: tracks members per channel with full snapshot fields
CREATE TABLE IF NOT EXISTS members (
    channel_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    first_name TEXT,
    last_name TEXT,
    username TEXT,
    bio TEXT,
    channel_link TEXT,           -- Best resolved link (personal_chat or bio)
    channel_title TEXT,
    bio_link TEXT,               -- Stored private/invite link from bio
    status TEXT DEFAULT 'member', -- member, left, kicked, deleted_account
    auto_detected INTEGER DEFAULT 0,
    is_deleted INTEGER DEFAULT 0,
    joined_at TEXT DEFAULT (datetime('now')),
    left_at TEXT,
    updated_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (channel_id, user_id),
    FOREIGN KEY(channel_id) REFERENCES channels(channel_id)
);

-- Profile history: tracks global changes for any user_id
CREATE TABLE IF NOT EXISTS profile_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    first_name TEXT,
    last_name TEXT,
    username TEXT,
    bio TEXT,
    recorded_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for fast query execution
CREATE INDEX IF NOT EXISTS idx_channels_owner_id ON channels(owner_id);
CREATE INDEX IF NOT EXISTS idx_members_user_id ON members(user_id);
CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);
CREATE INDEX IF NOT EXISTS idx_profile_history_user_id ON profile_history(user_id);
