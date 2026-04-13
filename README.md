# StudyMesh

StudyMesh is a browser-based student group collaboration prototype for coordinating group tasks, shared resources, alerts, timetable availability, and meeting planning.

## Project Structure

* `index.html`
  Main page structure

* `styles.css`
  App styling

* `js/config.js`
  Supabase configuration and constants

* `js/state.js`
  Global shared state

* `js/api.js`
  Supabase data access, storage helpers, realtime subscriptions

* `js/auth.js`
  Authentication and group join/create flow

* `js/tasks.js`
  Task creation, update, deletion, completion, permission checks

* `js/alerts.js`
  Alert creation and acknowledgement

* `js/resources.js`
  File upload, resource creation, download handling

* `js/timetable.js`
  Availability selection and meeting recommendation logic

* `js/chat.js`
  Chat message sending logic

* `js/render.js`
  Rendering and UI refresh logic

* `js/app.js`
  App bootstrap and lifecycle wiring

## Main Improvements from the Earlier Version

Compared with the original prototype, this version includes the following changes:

* Refactored the frontend from a single large `index.html` into a modular multi-file structure
* Added real file upload to Supabase Storage instead of only storing metadata
* Added private group-based file download using signed URLs
* Added meeting recommendation based on timetable overlap
* Added realtime synchronization across browser clients for core group data
* Improved alert persistence and acknowledgement synchronization
* Added task permission checks
* Improved consistency of dashboard, timetable, task, and alert updates

## Main Features

* anonymous sign-in
* create group / join group
* shared chat
* task board
* alert notice board
* real file upload/download
* weekly availability selection
* meeting recommendation
* realtime browser sync

## Key Problems Encountered and Solutions

### 1. Single-file structure was difficult to maintain

**Problem:**
HTML, CSS, and JavaScript were originally stored in one file, which made debugging and extension difficult.

**Solution:**
The project was split into separate files by responsibility, improving readability and maintainability.

### 2. Resource uploads were not real files

**Problem:**
Earlier uploads only created metadata records and were not truly downloadable.

**Solution:**
Supabase Storage was added with a private bucket, and the `resources` table was expanded with file metadata such as storage path, MIME type, and file size. Files are now uploaded as real binaries and downloaded using signed URLs.

### 3. Group-based file visibility was required

**Problem:**
Files needed to be visible only to members of the same group.

**Solution:**
A private storage bucket and group-based access policies were configured. File paths are stored in a group-scoped format so access control can be enforced correctly.

### 4. Timetable only stored availability but gave no recommendation

**Problem:**
The original timetable view allowed users to select time blocks, but it did not help the group decide the best meeting time.

**Solution:**
Meeting recommendation logic was added based on timetable overlap. The system now ranks 2-hour slots by number of available members, weekday preference, and earlier time.

### 5. Realtime synchronization was incomplete

**Problem:**
Without realtime sync, users had to refresh manually to see updates from other group members.

**Solution:**
Realtime subscriptions were added for core collaboration data, including messages, tasks, alerts, resources, and availability blocks. This allows multiple clients in the same group to stay synchronized.

### 6. Alert visibility and acknowledgement were inconsistent

**Problem:**
Alerts could disappear too early or fail to stay synchronized across different browser clients.

**Solution:**
Alert refresh logic was improved so alerts remain visible, stay ordered by recency, and update consistently after acknowledgement and realtime events.

### 7. Task actions were too open

**Problem:**
Task edit, delete, and complete actions were previously too permissive.

**Solution:**
Permission checks were added so only the correct users can perform task actions. This reduces accidental modification of shared work.

## Running the Project

The project should be run through a local HTTP server rather than opened directly with `file://`.

Example:

`python3 -m http.server 8000`

Then open:

`http://localhost:8000`

## Backend Requirements

This project expects a Supabase backend with:

* authentication enabled
* required database tables for groups, members, tasks, alerts, messages, resources, and availability
* realtime enabled for collaboration tables
* a private storage bucket for group files
* group-based storage access policies

## Summary

StudyMesh has been improved from a basic single-file prototype into a more maintainable collaboration system with:

* modular frontend structure
* real storage-backed resources
* smarter timetable support
* browser-to-browser synchronization
* more consistent permission and UI behavior
