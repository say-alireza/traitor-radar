<!--
Sync Impact Report:
- Initial Constitution for Traitor Radar (Loyalty & Sub-for-Sub Tracking Bot)
- Tech Stack: Cloudflare Workers, Cloudflare D1, grammY, TypeScript
- Governance: Strict adherence to immutable user IDs, zero-loss channel capture, and multi-tenancy
-->

# Traitor Radar Engineering Constitution

## Core Principles

### 1. Immutable User Identification (Non-Negotiable)
- All tracking, lookups, and relational joins MUST use Telegram's immutable numeric `user_id`.
- Usernames (`@handle`), first names, last names, and bio texts are mutable metadata. They MUST NEVER be used as primary keys or unique identifiers.
- A user who deletes their username, changes their name, or wipes their bio MUST still resolve to the exact same database entity.

### 2. Zero-Loss Channel Capture (Snapshot on Entry)
- When a user joins, the system MUST immediately snapshot both:
  1. Attached profile channel (`personal_chat` via `getChat`)
  2. Any public handle or private invite link (`t.me/+...`, `t.me/joinchat/...`, `@...`) extracted from `bio`.
- Once captured, this channel reference MUST persist even if the user subsequently removes the channel from their profile or wipes their bio before leaving.

### 3. Account Deletion & Ghost Account Detection
- The system MUST detect and handle deleted accounts (`new_chat_member` status changes, "Deleted Account" name flags).
- When an account deletion is detected, it MUST trigger a departure alert containing the last known linked channel so the channel owner does not remain subscribed to an abandoned channel.

### 4. Zero-Cost Serverless Multi-Tenancy
- The architecture MUST remain 100% compliant with Cloudflare Workers and Cloudflare D1 Free Tier quotas.
- Data MUST be strictly isolated per channel (`channel_id` + `owner_id`). No cross-channel notification leakage is permitted.

### 5. Actionable Notification Design
- Departure alerts MUST provide direct actionable links (e.g., inline buttons or hyperlinked channel URLs) allowing the channel owner to navigate to and leave the target channel in one tap.
- Copy MUST remain clean, structured, and free of decorative emoji clutter.

## Technical Standards

- **Language & Runtime:** TypeScript (Strict Mode) on Cloudflare Workers Module Format.
- **Database:** Cloudflare D1 using prepared statements for 100% of queries.
- **Bot Framework:** grammY with `cloudflare-mod` webhook adapter.
- **Error Handling:** All external Telegram API calls (`getChat`, `sendMessage`) MUST be wrapped in defensive try/catch blocks to ensure worker execution never crashes on API rate limits or privacy restrictions.
