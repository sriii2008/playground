# Playground IDE — Firestore Zero-Trust Security Specification

## 1. Data Invariants & Master Relationship Mapping

1. **One Gmail / Email = One Account (`UserAccount`)**:
   - Every user authenticates via Google Sign-In (`request.auth.token.email_verified == true`), producing a canonical Firebase `request.auth.uid`.
   - `/users/{userId}` can ONLY be created/accessed where `userId == request.auth.uid` and `data.ownerId == request.auth.uid`.
   - Listing `/users` is permanently forbidden (`allow list: if false;`) so no user or visitor can enumerate accounts.
2. **One Unique Username = One Account (`UsernameClaim` + Atomic Sync)**:
   - `/usernames/{usernameLower}` only permits `create` when the document does not already exist, `update` and `delete` are permanently `false`, and `list` is `false` (blocking username enumeration).
   - **Pillar 7 Atomicity**: Creating `/users/{userId}` requires `existsAfter(/databases/$(database)/documents/usernames/$(incoming().usernameLower))` with `ownerId == request.auth.uid`, and creating `/usernames/{usernameLower}` requires `existsAfter(/databases/$(database)/documents/users/$(request.auth.uid))` with `usernameLower == usernameLower`. Thus 1 UID <-> 1 Username is bijectively locked in a single atomic batch.
3. **PII Split-Collection Isolation (`PrivateUserProfile`)**:
   - PII (`email`, `dob`, `age`, `fullName`, social URLs, resume metadata) lives exclusively inside `/users/{userId}/private/profile`, never in `/usernames` or `/users/{userId}`.
   - Only the verified owner whose parent `/users/{userId}` Master Gate validates `ownerId == request.auth.uid` can `get`, `create`, or `update` `/users/{userId}/private/profile`.
4. **Master Gate Subcollection Ownership (`projects`, `certificates`, `reminders`, `history`)**:
   - Every subcollection document (`ProjectDoc`, `CertificateDoc`, `ReminderDoc`, `HistoryLogDoc`) enforces `data.ownerId == request.auth.uid` AND checks the parent `/users/{userId}` Master Gate on single-document reads/writes (`get()` / `getAfter()`).
   - Every `allow list` rule evaluates `request.auth.uid == userId && resource.data.ownerId == request.auth.uid` without `get()`/`exists()` calls (preventing O(n) read amplification and blocking unauthorized query scraping).
   - Creating a `ReminderDoc` with a non-empty `projectId` requires `exists()` or `existsAfter()` on `/users/{userId}/projects/{projectId}` (Pillar 4.11 Global Consistency Invariant).
5. **Temporal & Immutable Integrity**:
   - `createdAt` must equal `request.time` on `create` and remain strictly `incoming().createdAt == existing().createdAt` on `update`.
   - `updatedAt` must equal `request.time` on both `create` and `update`.
   - `ownerId`, `id`, `username`, and `usernameLower` are strictly immutable across all updates.

---

## 2. The "Dirty Dozen" Adversarial Payloads

| # | Attack Vector | Target Path & Operation | Malicious Payload / Context | Expected Outcome |
|---|---|---|---|---|
| 1 | **Identity Spoofing** | `create /users/uid_alice/projects/proj_1` (as `uid_alice`) | `{ ownerId: "uid_victim", id: "proj_1", ... }` | `PERMISSION_DENIED` (`ownerId != request.auth.uid`) |
| 2 | **Unverified Email Spoof** | `create /users/uid_alice` (`email_verified: false`) | Valid `UserAccount` payload with unverified token | `PERMISSION_DENIED` (`request.auth.token.email_verified != true`) |
| 3 | **Cross-User PII Leak** | `get /users/uid_victim/private/profile` (as `uid_attacker`) | Authenticated non-owner reading PII | `PERMISSION_DENIED` (`request.auth.uid != userId`) |
| 4 | **Account / Username Enumeration** | `list /usernames` or `list /users` (as `uid_attacker`) | Attempting to list registered workspaces | `PERMISSION_DENIED` (`allow list: if false`) |
| 5 | **Duplicate Username Hijack** | `update /usernames/srinidhi` (as `uid_attacker`) | `{ ownerId: "uid_attacker", username: "srinidhi" }` | `PERMISSION_DENIED` (`allow update: if false` & `create` blocked when doc exists) |
| 6 | **Orphaned Username Claim (Sync Break)** | `create /usernames/ghosthandle` without `/users/{uid}` batch | `{ ownerId: "uid_alice", username: "ghosthandle", createdAt: request.time }` | `PERMISSION_DENIED` (`existsAfter(/users/uid_alice)` fails) |
| 7 | **Shadow / Ghost Field Injection** | `create /users/uid_alice/projects/proj_1` | Valid project fields + `{ isAdmin: true }` | `PERMISSION_DENIED` (`keys().hasOnly(...)` rejects ghost key) |
| 8 | **Update-Gap Value Poisoning** | `update /users/uid_alice` (`theme` action) | `{ ...existing, theme: "neon_hack_1mb...", updatedAt: request.time }` | `PERMISSION_DENIED` (`isValidUserAccount` blocks invalid enum/size) |
| 9 | **ID Poisoning / DoW Path** | `create /users/uid_alice/projects/bad$id!spaces` | Valid project body at poisoned path ID | `PERMISSION_DENIED` (`isValidId(projectId)` regex guard fails) |
| 10 | **Unbounded Array / Element Type Poisoning** | `create /users/uid_alice/projects/proj_1` | `techStack` with 35 items or `[12345]` non-string | `PERMISSION_DENIED` (`techStack.size() <= 30 && techStack[0] is string`) |
| 11 | **Orphaned Foreign Key Reference** | `create /users/uid_alice/reminders/rem_1` | `projectId: "non_existent_proj_999"` | `PERMISSION_DENIED` (`exists(/users/uid_alice/projects/non_existent_proj_999)` fails) |
| 12 | **Forged Client Timestamp / Immutable Tamper** | `update /users/uid_alice/projects/proj_1` | Modifying `createdAt` or passing stale `updatedAt != request.time` | `PERMISSION_DENIED` (`createdAt` immutability + `request.time` gate) |

---

## 3. Red Team Audit Matrix (Phase 5)

- `/users/{userId}`:
  - Shadow Update: Blocked (`hasOnly(['theme', 'updatedAt'])` + `isValidUserAccount(incoming())`).
  - Email Spoofing: Blocked (`isVerified()` required on read & write).
  - PII Blanket Test: Pass (no PII stored here; `get` restricted to `request.auth.uid == userId`; `list` is `false`).
  - Identity / Immutable Tamper: `ownerId`, `username`, `usernameLower`, `createdAt` locked via `affectedKeys().hasOnly(['theme', 'updatedAt'])` AND explicit equality checks.
- `/usernames/{usernameLower}`:
  - Enumeration: `allow list: if false`.
  - Hijack / Overwrite: `allow update, delete: if false`; `create` only succeeds if doc doesn't exist AND `existsAfter` matches `/users/$(request.auth.uid)`.
- `/users/{userId}/private/{docId}`:
  - PII Blanket Test: Strictly restricted to `request.auth.uid == userId && docId == 'profile'` + Master Gate `isMasterUserOwner(userId)`.
  - Value Poisoning: Wrapped in `isValidPrivateProfile(incoming())` on every `update`.
- `/users/{userId}/projects/{projectId}`, `/certificates/{certId}`, `/reminders/{reminderId}`, `/history/{logId}`:
  - Query Trust Test: `allow list` explicitly checks `request.auth.uid == userId && resource.data.ownerId == request.auth.uid` with zero `get()`/`exists()` calls.
  - Resource / Array Poisoning: Every string has `.size() <= MAX`, every ID passes `isValidId()`, every array has `.size() <= MAX` and index-0 structural validation.
