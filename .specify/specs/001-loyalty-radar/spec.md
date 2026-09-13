# Feature Specification: Sub-for-Sub Channel Loyalty Radar

## 1. Problem Statement & User Journey

In Telegram daily channel culture, a mutual subscription tradition exists: when User A subscribes to User B's channel, User B subscribes back. 

However, channel owners face three common adversarial scenarios:
1. **Stealth Departure:** A user changes their display name/username, removes the channel link from their profile/bio, and leaves User B's channel. User B remains subscribed to their channel unknowingly.
2. **Account Deletion (Ghost Channel):** A user deletes their Telegram account. Their channel remains live, leaving User B subscribed to a ghost user's channel.
3. **Private vs Public Channel Links:** Some users link public channels to their profile (`personal_chat`), while others place private invite links (`t.me/+...`) in their bio.

**Goal:** Build a serverless tracking system on Cloudflare Workers + D1 that snapshots channel links upon entry, tracks users via permanent numeric IDs, detects departures and deleted accounts, and provides instant alerts with direct links to leave unwanted channels.

---

## 2. User Stories & Acceptance Criteria

### US-1: Channel Snapshot on Join
- **As a** channel owner,
- **I want** the bot to automatically inspect new subscribers and save both their attached profile channel and any private/public links in their bio,
- **So that** I have a permanent record of their channel even if they delete or modify it later.
- **Acceptance Criteria:**
  - On `chat_member` join event, invoke `getChat(user_id)`.
  - Extract `personal_chat` (id, title, username).
  - Extract bio invite links (`https://t.me/+...`, `t.me/joinchat/...`, `@handle`).
  - Store both in D1 database under `(channel_id, user_id)`.
  - Send private notification to channel owner with user name, username, numeric ID, and detected channel.

### US-2: Stealth Departure Detection & Alert
- **As a** channel owner,
- **I want** to be alerted immediately when someone leaves my channel, showing their linked channel and past name history,
- **So that** I can leave their channel immediately.
- **Acceptance Criteria:**
  - On `chat_member` leave event (`member -> left/kicked`), locate record by immutable `user_id`.
  - Fetch stored `channel_link` even if currently wiped from their profile.
  - Send alert message containing:
    - User's current display name and username.
    - Historical names/usernames (if changed).
    - Linked channel URL with an **Inline Button** `[Open / Leave Channel]`.

### US-3: Deleted Account Detection
- **As a** channel owner,
- **I want** to know when an account that subscribed to my channel is deleted,
- **So that** I can clean up and leave their remaining channel.
- **Acceptance Criteria:**
  - If `chat_member` update indicates account deletion or `user.first_name == 'Deleted Account'`, mark member status as `deleted_account`.
  - Trigger alert to owner explicitly flagging `Account Deleted` along with their previously linked channel.

### US-4: Interactive Channel Management UI
- **As a** channel owner,
- **I want** to list active tracked members, recent departures, and manually pair/override channel links,
- **So that** I can manage private links or review my reciprocity status at any time.
- **Acceptance Criteria:**
  - `/list` displays active members with pagination / compact summary.
  - `/left` displays the latest departures with inline URLs to each channel.
  - `/pair <user_id> <link>` updates or sets the channel link manually.
  - `/info <user_id>` returns full diagnostic history for a specific ID.
