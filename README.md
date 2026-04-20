# StudyMesh

## Overview
StudyMesh is a browser-based study group workspace built on Supabase. It lets group members coordinate in one place with shared chat, tasks, alerts, resources, and weekly availability.

The current app is session/auth-based and uses polling to keep group data in sync across clients.

## Features
- **Authentication and group membership**
  - Anonymous or credential-based sign-in via Supabase Auth
  - Create a group or join an existing group by code
  - Session recovery on reload for returning users
- **Group collaboration tools**
  - Shared chat
  - Task board with ownership/permission checks
  - Alert board with acknowledgement flow
  - Resource upload/download backed by Supabase Storage
  - Weekly availability selection
  - Meeting recommendation from overlap ranking
- **Cross-client synchronization**
  - Periodic polling refresh for messages, alerts, tasks, resources, availability, members, and encryption state

## Security / Architecture Notes
- **Access model**
  - Supabase Auth session identifies the current user
  - Group-scoped data model (memberships map users to groups)
  - Storage access is group-scoped using private bucket paths/policies
- **Encryption model (high level)**
  - Chat supports end-to-end encrypted message payloads
  - Per-user key material is managed in browser storage
  - Group key envelopes are managed for member-level encrypted access
- **Architecture (high level)**
  - Static frontend (`index.html`, `styles.css`, modular JS)
  - Supabase backend for auth, Postgres data, and file storage
  - Polling-based synchronization (no websocket realtime requirement)

## Tech Stack
- HTML, CSS, vanilla JavaScript modules
- Supabase (Auth, Postgres, Storage)
- Web Crypto API (for E2EE flows)

## Running Locally
1. Open this project folder in your terminal.
2. Start a local static server:
   ```bash
   python3 -m http.server 8000
   ```
3. Open:
   ```
   http://localhost:8000
   ```

> Run over `http://localhost` (not `file://`) so auth/storage browser flows work correctly.

## Deployment
No dedicated deployment URL is documented in this repository. If you deploy StudyMesh, host it as a static web app and provide Supabase project configuration in `js/config.js`.

## Current Limitations
- Polling introduces sync delay based on interval settings (not instant push updates).
- Client-side key storage is practical for MVP usage but not a hardened key-management system.
- The app depends on a correctly configured Supabase project schema and policies.

## Repository Structure
- `index.html` — app shell and UI markup
- `styles.css` — styles
- `js/config.js` — Supabase client setup and constants
- `js/state.js` — shared in-memory app state
- `js/auth.js` — auth/session and group entry flows
- `js/api.js` — data/storage APIs and polling synchronization
- `js/chat.js`, `js/tasks.js`, `js/alerts.js`, `js/resources.js`, `js/timetable.js` — feature logic
- `js/e2ee.js` — encryption key and envelope flows for encrypted chat
- `js/render.js` — UI render/update routines
- `js/app.js` — startup/bootstrap orchestration
