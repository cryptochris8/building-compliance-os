# ADR-001: Multi-Tenant Organization Scoping

## Status: Accepted

## Context
Building Compliance OS is a SaaS product where multiple organizations manage their own buildings. Data isolation between tenants is critical for security and compliance.

## Decision
All data is scoped through `organization_id` foreign keys. Authorization is enforced at two layers:
1. **Application layer:** `assertBuildingAccess()` verifies the building belongs to the authenticated user's organization before any operation.
2. **Database layer:** PostgreSQL Row Level Security (RLS) policies on all tables filter by `get_user_org_id()`, providing defense-in-depth.

## Consequences
- Every query is automatically scoped to the user's org (via RLS) even if application code has a bug.
- Service role operations bypass RLS, so server-side code must still check org ownership.
- Adding cross-org features (e.g., benchmarking) would require explicit RLS policy changes.
