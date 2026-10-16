# Project Overview

## Monorepo structure

```
apps/
  mobile/     React Native (Expo)
  web/        Next.js (App Router)
  backend/    NestJS + MongoDB
docs/
  architecture/   conventions and data flow
site/             public marketing / policy pages (GitHub Pages)
```

Managed with **pnpm workspaces** and **Turborepo**.
Apps share no code — no cross-app imports.

## Tech stack

| Layer | Choice |
|-------|--------|
| Mobile | Expo SDK, expo-router |
| Web | Next.js App Router |
| Server state | React Query |
| Global auth state | React Context |
| Backend | NestJS |
| Database | MongoDB / Mongoose |
| AI | Swappable via provider interface (see [backend.md](backend.md)) |
| Auth | OAuth 2.0 only — no passwords |
| Error tracking | Sentry (one project per app) |

## Architecture docs

| File | Contents |
|------|----------|
| [mobile.md](mobile.md) | FSD folder structure · state management · auth · design rules |
| [backend.md](backend.md) | Module layout · invariants · AI pipeline · API conventions |
| [data-flow.md](data-flow.md) | End-to-end flows with annotated steps |

Entity API conventions:
[`apps/mobile/src/entities/API-CONVENTIONS.md`](../../apps/mobile/src/entities/API-CONVENTIONS.md)
