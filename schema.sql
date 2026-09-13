-- Channels table: maps each channel to its owner (the admin who added the bot)
CREATE TABLE IF NOT EXISTS channels (
    channel_id INTEGER PRIMARY KEY,
    owner_id INTEGER NOT NULL,
    title TEXT,
    username TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Members table: tracks members per channel
CREATE TABLE IF NOT EXISTS members (
    channel_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    first_name TEXT,
    last_name TEXT,
    username TEXT,
    bio TEXT,
    channel_link TEXT,
    channel_title TEXT,
    status TEXT DEFAULT 'member',
    auto_detected INTEGER DEFAULT 0,
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

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_channels_owner_id ON channels(owner_id);
CREATE INDEX IF NOT EXISTS idx_members_user_id ON members(user_id);
CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);
CREATE INDEX IF NOT EXISTS idx_profile_history_user_id ON profile_history(user_id);
