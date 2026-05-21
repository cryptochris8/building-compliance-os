# ADR-004: Web-Only Platform — No PWA or Native Mobile

## Status: Accepted

## Context
Building Compliance OS is a Next.js web application. The question arose of whether to also ship a Progressive Web App (PWA — a service worker for offline support, installability, and web push) or a native mobile app (React Native / Expo).

The core workflows — CSV utility-data import, Portfolio Manager sync, manual reading entry, compliance calculation, and PDF report generation/review — are desktop-oriented "desk work." The only meaningfully mobile use case, glancing at compliance status and upcoming deadlines, is already served by the responsive layout, and deadline notifications already go out by email (Inngest cron + Resend).

## Decision
Ship as a responsive web SaaS only — no service-worker PWA, no native mobile app. The existing responsive layout (Tailwind breakpoints, a dedicated mobile sidebar) is the intended mobile experience; the app works in a phone browser.

## Consequences
- No service worker, so none of the stale-cache bug class and no added deploy/versioning complexity — valuable pre-launch.
- A single web codebase; no second native codebase to maintain.
- No offline use and no native push. Offline is low-value for a fundamentally database-driven app, and deadline reminders already arrive by email.
- The app is not home-screen "installable" by default.
- Revisit a mobile investment if a field-work flow is added (e.g. photographing utility bills or capturing meter readings on-site, where offline capture is genuinely useful), or if post-launch analytics show heavy mobile usage and customer demand.

## Alternatives Considered
- **Web app manifest only (installable, no service worker):** Cheap (~1 hour) and low-risk — gives the "add to home screen" feel without caching risk. The recommended first step if installability is wanted later.
- **Full PWA (manifest + service worker):** Adds offline/push/install but introduces a real caching-bug surface for marginal benefit given the product's desk-work nature.
- **Native mobile app (React Native / Expo):** A separate codebase and a much larger investment, not justified by the usage profile.
