# Mobile Conventions

Expo SDK · expo-router · React Query · React Context

## Folder structure (FSD)

```
src/
  app/          Routes only — no logic, only screen composition
  widgets/      One coherent screen section
  entities/     Domain objects (api · model · ui · lib per domain)
  shared/       Anything used by two or more layers
    api/        Base fetch client + token storage
    config/     Design tokens (colors, typography, spacing) — source of truth
    session/    Auth context + OAuth
    ui/         Primitive components
    lib/        Pure utility helpers
```

**Dependency rule**: dependencies flow downward only —
`app` → `widgets` → `entities` → `shared`. Never upward, never sideways.

## State management

Two concerns, two tools — never mix them:

| Concern | Tool | Reason |
|---------|------|--------|
| Server data | React Query | Caching, invalidation, loading/error states |
| Auth session | React Context | Global, gates routing, must clear the query cache on sign-out |

**Auth state shape**: `status: 'loading' | 'in' | 'out'`
Three states are required — the root layout must distinguish
"still checking the stored token" from "definitely logged out".
Two booleans allow a fourth impossible state; the union type does not.

## Entity API conventions

Each entity's `api/` segment is split into four files:

```
entities/{domain}/api/
  keys.ts              ← query key constants
  {domain}.queries.ts  ← useGet* hooks (read)
  {domain}.mutations.ts ← usePost* / usePatch* / useDelete* hooks (write)
  {domain}.api.ts      ← barrel re-export for backward compatibility
```

**Naming**: `useGet{Resource}`, `usePost{Resource}`, `usePatch{Resource}`, `useDelete{Resource}`.

**Query keys**: each entity owns one root key constant in `keys.ts`.
Derived keys are composed inline (`[...booksKey, id]`).
Cross-entity invalidations use the target entity's root key literal — no cross-entity key imports.

Full rules and an example: [`API-CONVENTIONS.md`](../../apps/mobile/src/entities/API-CONVENTIONS.md).

## Auth pattern (browser OAuth + PKCE)

```
App → open browser to server /auth/{provider}/start?challenge={hash}&returnUrl={deeplink}
    → provider consent
    → server callback: validate code, create one-time ticket
    → 302 to deeplink?ticket={ticket}
App → POST /auth/exchange { ticket, codeVerifier }
    → receive token pair
```

Tokens never travel in the deeplink — only a short-lived ticket does.
PKCE prevents ticket theft: the server checks `SHA256(codeVerifier) === challenge`.

Platform-native auth (e.g. Apple Sign In) bypasses the browser entirely and
calls the system SDK directly.

## Sign-in screen pattern

- Use `useMutation` per provider — owns `isPending`, `variables`, and `onError`.
- `variables` identifies which button is spinning; other buttons read `isPending`
  to lock themselves.
- A cancelled consent screen (`SignInCancelled`) is swallowed silently in `onError` —
  it is not a failure.
- A failed attempt (`SignInFailed`) shows an alert.
- `SessionContext` (`signIn`, `signOut`) handles token storage and query cache clearing,
  separate from the mutation's loading state.

## Design rules

- **Design tokens come only from `shared/config`** — no inline values, no new tokens on screens.
- **Serif for content-origin text only.** App copy uses the system/brand font.
  Content quotes (from books, user notes) use the serif variant.
  Never use the platform's base `<Text>` directly in screens — always go through the wrapper.
- **Third-party brand colors are fixed.** OAuth provider logos follow each company's
  guidelines and are isolated in one file — never adjusted for the app's theme.
- **Light theme only** (for this project). Background is warm paper-white, not pure white.
  Ensure text on any background meets 4.5:1 contrast; decorative/assistive text is exempt
  but must never carry meaning on its own.
- **Horizontal gutters come from one constant.** No raw pixel values in screen padding.
- **Disabled = `disabled` prop, not a style change.** Changing a button's visual
  variant to signal "not yet" makes it look like a different interactive option.
  Loading state gets a `loading` prop + spinner — never just changing the label text.
