-- Members table: keeps track of all channel subscribers and their associated channel
CREATE TABLE IF NOT EXISTS members (
    user_id INTEGER PRIMARY KEY,
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
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Profile history: tracks name and username changes across time
CREATE TABLE IF NOT EXISTS profile_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    first_name TEXT,
    last_name TEXT,
    username TEXT,
    bio TEXT,
    recorded_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES members(user_id)
);

-- Indexes for quick lookups
CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);
CREATE INDEX IF NOT EXISTS idx_members_username ON members(username);
CREATE INDEX IF NOT EXISTS idx_profile_history_user_id ON profile_history(user_id);
