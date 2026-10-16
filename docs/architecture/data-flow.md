# Data Flow Patterns

## 1. Capture → Process → Store

The general pattern for flows where the user's input must be preserved even if
the downstream processing fails:

```
User action
  ↓
Validate input on the client (size limits, format)
  ↓
POST to server with the raw input
  ↓
Server: persist input immediately (status: pending)
  ↓
Server: call expensive operation (AI, external API) — with explicit timeout
  ↓
  ├─ success  → update record, return result
  └─ timeout/quota → leave status: pending, return early
  ↓
Client: route based on result
  ├─ answered   → navigate to result screen
  └─ pending    → navigate to pending/queue screen
```

Key rule: **capture never fails**. The server saves the user's data before
calling anything external. If the external call fails, the data exists and
can be retried later.

---

## 2. Upsert with change detection (re-encounter pattern)

For resources that should be de-duplicated rather than duplicated:

```
Client sends { ownerId, normalizedKey, ...data }
  ↓
Server: findOneAndUpdate(
  { ownerId, normalizedKey },
  { $push: { history: newEntry } },
  { upsert: true, new: true }
)
  ↓
Returns { created: boolean, gapDays?: number }
  ↓
Client: if !created → show "you saved this before" notice
```

The unique index on `(ownerId, normalizedKey)` prevents duplicates at the
database layer — no "check then insert" race condition.

---

## 3. Feed assembly from multiple sources

When a list screen needs data from two non-overlapping server endpoints plus
reference data from a third:

```
useQuery source A (e.g. processed items)
useQuery source B (e.g. unprocessed items)
useQuery reference (e.g. parent records for thumbnail/label)
useQuery annotation (e.g. metadata to render underlines)
  ↓
client-side merge function (lib/feed.ts)
  → join by shared key
  → compute per-row flags (pending, claimed, liked)
  ↓
split into display list vs. notification-only list
```

Keep the merge function as a pure function in `lib/` — no hooks, no side effects.
This makes it testable independently of React Query.

---

## 4. Browser OAuth + PKCE

```
[User taps login]
  ↓
Client: generate random codeVerifier
Client: challenge = base64url(SHA256(codeVerifier))
  ↓
Client: open browser to server /auth/{provider}/start
  ?challenge={challenge}&returnUrl={app-deeplink}
  ↓
Server: store (challenge, state) temporarily
Server: 302 → provider consent screen
  ↓
Provider → server /auth/{provider}/callback
Server: exchange code for provider tokens
Server: create one-time ticket (short-lived, single-use)
Server: 302 → {returnUrl}?ticket={ticket}
  ↓
Client: browser closes, deeplink delivers ticket
Client: POST /auth/exchange { ticket, codeVerifier }
Server: verify SHA256(codeVerifier) === stored challenge
Server: issue { accessToken, refreshToken }
```

Why PKCE: the deeplink is visible to other apps on the device. The ticket alone
is useless without the `codeVerifier` that only the initiating app knows.
Tokens never travel in the deeplink.

---

## 5. Token lifecycle

```
Every authenticated request
  ↓
Attach Authorization: Bearer {accessToken}
  ↓
If 401 (expired)
  → POST /auth/refresh { refreshToken }
  → server issues new pair, revokes old refresh token
  → retry original request
  ↓
If refresh also 401
  → clear all local tokens
  → set auth status: 'out'
  → redirect to sign-in
```

Refresh tokens are stored hashed. Reuse of a revoked token (replay) triggers
revocation of all sessions for that user.

---

## 6. Implicit progress tracking

When a stat (e.g. "pages read today") can be derived from an existing action
(e.g. "update current page"), do not add a separate logging step:

```
PATCH /resource/:id { progress: newValue }
  ↓
Service: delta = newValue - previousValue
Service: upsert stat record { date: today, amount: delta }
```

An explicit "log this" step users must remember to take will be skipped.
Derive the stat automatically from the state change.
