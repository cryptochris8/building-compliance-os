# Security Audit Report - Building Compliance OS

**Audit Date:** 2026-03-07
**Auditor:** Security Auditor Agent (Claude Opus 4.6)
**Scope:** Full application security review
**Codebase Version:** Commit `002b06c` (master)
**Overall Grade: B-**

---

## Executive Summary

Building Compliance OS has made significant security improvements since the prior audit, including IDOR protection via `assertBuildingAccess()`, AES-256-GCM encryption for PM credentials, Stripe webhook signature verification, rate limiting on key endpoints, and parameterized queries via Drizzle ORM. However, several medium-severity issues remain that must be addressed before production deployment. The most critical remaining issues are residual IDOR vulnerabilities in update/delete operations, open redirect vectors in the auth callback, missing Content-Security-Policy header, and the absence of RBAC enforcement despite having role infrastructure in the schema.

---

## Table of Contents

1. [Findings Summary](#findings-summary)
2. [Detailed Findings](#detailed-findings)
3. [Verification of Previously Fixed Issues](#verification-of-previously-fixed-issues)
4. [Configuration Security Review](#configuration-security-review)
5. [Dependency Analysis](#dependency-analysis)
6. [Recommendations Summary](#recommendations-summary)

---

## Findings Summary

| # | Finding | Severity | OWASP Category | Status |
|---|---------|----------|----------------|--------|
| S-01 | Residual IDOR in update/delete operations | **HIGH** | A01 - Broken Access Control | NEW |
| S-02 | Open redirect in auth callback | **MEDIUM** | A01 - Broken Access Control | NEW |
| S-03 | Open redirect in login page | **MEDIUM** | A01 - Broken Access Control | NEW |
| S-04 | Missing Content-Security-Policy header | **MEDIUM** | A05 - Security Misconfiguration | NEW |
| S-05 | No RBAC enforcement (roles exist but unused) | **MEDIUM** | A01 - Broken Access Control | NEW |
| S-06 | In-memory rate limiter not suitable for production | **MEDIUM** | A04 - Insecure Design | NEW |
| S-07 | Inngest endpoint lacks signing key verification | **MEDIUM** | A07 - Auth Failures | NEW |
| S-08 | Pre-auth rate limiting applies to buildingId not user | **LOW** | A04 - Insecure Design | NEW |
| S-09 | Error messages leak internal details | **LOW** | A04 - Insecure Design | NEW |
| S-10 | Missing CORS configuration | **LOW** | A05 - Security Misconfiguration | NEW |
| S-11 | No input length limits on text fields | **LOW** | A03 - Injection | NEW |
| S-12 | Document deletion does not verify document-to-building relationship | **LOW** | A01 - Broken Access Control | NEW |
| S-13 | Weak password policy | **LOW** | A07 - Auth Failures | NEW |
| S-14 | Email HTML injection potential | **LOW** | A03 - Injection | NEW |

---

## Detailed Findings

### S-01: Residual IDOR in Update/Delete Operations (HIGH)

**OWASP:** A01 - Broken Access Control
**Files Affected:**
- `D:\building-compliance-os\src\app\actions\readings.ts` (lines 87-126, 128-159)
- `D:\building-compliance-os\src\app\actions\deductions.ts` (lines 92-124, 126-151)
- `D:\building-compliance-os\src\app\actions\documents.ts` (lines 74-97)

**Description:**
While `assertBuildingAccess()` correctly verifies the user owns the *building*, the update and delete functions do not verify that the target record (reading/deduction/document) actually belongs to the specified building. An attacker who owns Building A could supply their own `buildingId` (which passes the access check) but provide a reading/deduction/document `id` belonging to a different organization's Building B.

**Evidence (readings.ts, updateReading):**
```typescript
// Line 96: Verifies building ownership
const access = await assertBuildingAccess(data.buildingId);
if (!access) return { error: 'Building not found or access denied' };

// Line 108-116: Updates by ID only - does NOT verify reading.buildingId === data.buildingId
const [reading] = await db.update(utilityReadings).set({
  utilityAccountId: data.utilityAccountId,
  // ...
}).where(eq(utilityReadings.id, id)).returning();
```

The same pattern exists in `deleteReading`, `updateDeduction`, `deleteDeduction`, and `deleteDocument`. The WHERE clause uses only the record's primary key ID, without a compound condition that also checks `buildingId`.

**Impact:** An authenticated user could modify or delete another organization's utility readings, deductions, or documents by supplying their own valid buildingId alongside a target record's UUID.

**Remediation:** Add compound WHERE clauses:
```typescript
.where(and(eq(utilityReadings.id, id), eq(utilityReadings.buildingId, data.buildingId)))
```

---

### S-02: Open Redirect in Auth Callback (MEDIUM)

**OWASP:** A01 - Broken Access Control
**File:** `D:\building-compliance-os\src\app\auth\callback\route.ts` (lines 7-13)

**Description:**
The `next` query parameter is used directly in a redirect without validation:

```typescript
const next = searchParams.get("next") ?? "/dashboard";
// ...
return NextResponse.redirect(`${origin}${next}`);
```

While the redirect is constructed using `origin` (which limits to the same host), an attacker could craft a URL like:
- `/auth/callback?code=xxx&next=//evil.com` - some browsers interpret `//` as a protocol-relative URL
- `/auth/callback?code=xxx&next=/\evil.com` - backslash-based bypass in some environments

**Impact:** Could be used in phishing attacks to redirect authenticated users to malicious sites after login.

**Remediation:** Validate that `next` starts with `/` and does not contain `//`, `\`, or other potentially dangerous characters. Use a whitelist of allowed redirect paths or sanitize the input.

---

### S-03: Open Redirect in Login Page (MEDIUM)

**OWASP:** A01 - Broken Access Control
**File:** `D:\building-compliance-os\src\app\(auth)\login\page.tsx` (lines 15, 33)

**Description:**
The login page reads a `redirect` search parameter and passes it directly to `router.push()`:

```typescript
const redirect = searchParams.get("redirect") || "/dashboard";
// ...
router.push(redirect);
```

While `router.push()` in Next.js client-side navigation typically handles only same-origin routes, the `redirect` parameter originates from the middleware (`middleware.ts`, line 64-65) which sets it from the pathname. However, the login page does not validate the `redirect` value. An attacker could craft a URL like `/login?redirect=https://evil.com` or use JavaScript URI schemes on older browsers.

**Impact:** Low-to-medium. Client-side `router.push` mitigates full URL redirects, but the pattern is unsafe as a practice.

**Remediation:** Validate that the redirect value starts with `/` and is a path-only string.

---

### S-04: Missing Content-Security-Policy Header (MEDIUM)

**OWASP:** A05 - Security Misconfiguration
**File:** `D:\building-compliance-os\next.config.ts`

**Description:**
The application sets 6 security headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, X-DNS-Prefetch-Control, Strict-Transport-Security) but is missing a Content-Security-Policy (CSP) header. CSP is the most effective defense against XSS attacks.

**Impact:** Without CSP, if any XSS vulnerability exists (or is introduced), an attacker can execute arbitrary JavaScript, exfiltrate data, or perform actions on behalf of users with no browser-level mitigation.

**Remediation:** Add a Content-Security-Policy header. Start with a restrictive policy:
```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://*.supabase.co https://*.sentry.io https://*.stripe.com; frame-src https://*.stripe.com;
```
Refine and tighten after testing.

---

### S-05: No RBAC Enforcement (MEDIUM)

**OWASP:** A01 - Broken Access Control
**Files Affected:** All server actions and API routes

**Description:**
The database schema defines a `user_role` enum with values `['owner', 'admin', 'member']` and the `users` table has a `role` column. However, no code anywhere in the application checks user roles. All authenticated users within an organization have identical permissions -- a `member` can lock/unlock compliance years, delete documents, modify billing, disconnect Portfolio Manager, and perform all administrative actions.

**Evidence:**
A grep for `role.*owner`, `role.*admin`, `checkRole`, `requireRole` across the entire `src/` directory returns zero enforcement hits -- only the type definition and schema declaration.

**Impact:** Any user invited to an organization (even as a `member`) can perform destructive administrative actions including disconnecting integrations, modifying billing, and locking/unlocking compliance years.

**Remediation:** Implement role-based access control checks in server actions. Critical actions (billing, PM connection management, lock/unlock, delete operations) should require `owner` or `admin` role.

---

### S-06: In-Memory Rate Limiter Not Production-Ready (MEDIUM)

**OWASP:** A04 - Insecure Design
**File:** `D:\building-compliance-os\src\lib\rate-limit.ts`

**Description:**
The rate limiter uses an in-memory `Map` to track request counts. This has several issues:

1. **No persistence across deployments**: On Vercel or any serverless platform, each function invocation or container gets its own memory space. Rate limits reset on every cold start and are not shared across instances.
2. **Memory leak potential**: While there is a cleanup mechanism and eviction for excess tokens, the `setInterval` cleanup runs indefinitely and the `uniqueTokenPerInterval` cap of 500 may be insufficient under load.
3. **Bypass via distributed requests**: Multiple serverless instances do not share state, so rate limits can be trivially bypassed.

**Impact:** Rate limiting is effectively non-functional in a serverless deployment, leaving all endpoints vulnerable to brute-force attacks, credential stuffing, and resource exhaustion.

**Remediation:** Replace with a distributed rate limiter backed by Redis (e.g., `@upstash/ratelimit`) or use Vercel Edge Config / KV for rate limiting state.

---

### S-07: Inngest Endpoint May Lack Signing Key Verification (MEDIUM)

**OWASP:** A07 - Identification and Authentication Failures
**File:** `D:\building-compliance-os\src\app\api\inngest\route.ts`

**Description:**
The Inngest route is served via `serve()` from the Inngest SDK and exposes GET, POST, and PUT handlers. Inngest uses a signing key (`INNGEST_SIGNING_KEY`) to verify that incoming requests are from Inngest's infrastructure, not from unauthorized sources. However:

1. The `INNGEST_SIGNING_KEY` is listed in `.env.example` but there is no verification in code that it is set.
2. The Inngest SDK's `serve()` function does validate the signing key if configured, but if `INNGEST_SIGNING_KEY` is not set in the environment, the SDK may accept unsigned requests (behavior depends on SDK version and environment detection).
3. The Inngest endpoint is not listed in `PUBLIC_ROUTES` in middleware, but it is also not behind authentication -- it bypasses auth because it is under `/api/inngest` which the middleware matcher allows through.

**Impact:** If the signing key is not configured or not enforced, an attacker could invoke background jobs directly (e.g., triggering CSV imports with arbitrary data).

**Remediation:** Ensure `INNGEST_SIGNING_KEY` is always set in production. Add a runtime check or configure the Inngest serve function with `signingKey` explicitly.

---

### S-08: Pre-Auth Rate Limiting on Building ID (LOW)

**OWASP:** A04 - Insecure Design
**File:** `D:\building-compliance-os\src\app\api\buildings\[id]\import\route.ts` (line 17)

**Description:**
The import endpoint rate-limits by building ID *before* authenticating the user:

```typescript
const { success } = apiLimiter.check(5, 'import:' + buildingId);
if (!success) { ... }

// Auth check happens AFTER
const access = await assertBuildingAccess(buildingId);
```

This means an unauthenticated attacker can exhaust the rate limit for any building ID, causing denial of service for legitimate users of that building.

**Impact:** An attacker can prevent legitimate CSV imports by repeatedly hitting the endpoint with a known building UUID.

**Remediation:** Move the rate limit check after authentication, or rate-limit by user/org ID instead of building ID.

---

### S-09: Error Messages Leak Internal Details (LOW)

**OWASP:** A04 - Insecure Design
**Files Affected:** All API routes and server actions

**Description:**
Multiple error handlers expose raw error messages to the client:

```typescript
const message = error instanceof Error ? error.message : "Import failed";
return NextResponse.json({ error: message }, { status: 500 });
```

Internal error messages from database drivers, Stripe SDK, or other libraries may leak sensitive information such as table names, connection strings, or internal state.

**Impact:** Information disclosure that aids attacker reconnaissance.

**Remediation:** Log detailed errors server-side (to Sentry, which is configured) and return generic error messages to clients in production. Use a pattern like:
```typescript
const isProduction = process.env.NODE_ENV === 'production';
return { error: isProduction ? 'An error occurred' : error.message };
```

---

### S-10: Missing CORS Configuration (LOW)

**OWASP:** A05 - Security Misconfiguration
**File:** `D:\building-compliance-os\next.config.ts`

**Description:**
No explicit CORS configuration exists. Next.js API routes do not set CORS headers by default, which means browser-based cross-origin requests will fail (a secure default). However, there is no explicit CORS policy to ensure this remains the case.

**Impact:** Low risk currently since the default is restrictive. However, if CORS headers are later added without a proper policy, it could expose APIs to cross-origin attacks.

**Remediation:** Explicitly configure CORS for the webhook endpoint (which may receive cross-origin requests from Stripe) and ensure all other routes remain same-origin only.

---

### S-11: No Input Length Limits on Text Fields (LOW)

**OWASP:** A03 - Injection
**Files Affected:**
- `D:\building-compliance-os\src\app\actions\compliance-workflow.ts` (addComplianceNote: `content` parameter)
- `D:\building-compliance-os\src\app\actions\deductions.ts` (description field)
- `D:\building-compliance-os\src\app\actions\readings.ts` (Zod schema exists but no `.max()`)

**Description:**
Several server actions accept text input without maximum length validation. The `addComplianceNote` function accepts arbitrary-length `content`, and the `unlockComplianceYear` function accepts an arbitrary-length `reason` string. While Zod validation is used in some places, maximum lengths are not enforced.

**Impact:** Potential for database bloat or denial of service via extremely large payloads.

**Remediation:** Add `.max()` constraints to all Zod string validators and add length checks to functions that don't use Zod.

---

### S-12: Document Deletion Does Not Verify Document-Building Relationship (LOW)

**OWASP:** A01 - Broken Access Control
**File:** `D:\building-compliance-os\src\app\actions\documents.ts` (lines 74-97)

**Description:**
The `deleteDocument` function verifies building access but then deletes the document by ID without checking that the document actually belongs to the specified building:

```typescript
const access = await assertBuildingAccess(buildingId);  // Checks building ownership
// ...
const [doc] = await db.select({ filePath: documents.filePath }).from(documents).where(eq(documents.id, id));
// Does NOT check doc.buildingId === buildingId
await db.delete(documents).where(eq(documents.id, id));
```

**Impact:** Same as S-01 -- a user who owns any building could delete documents from other organizations' buildings.

**Remediation:** Add `eq(documents.buildingId, buildingId)` to the WHERE clause.

---

### S-13: Weak Password Policy (LOW)

**OWASP:** A07 - Identification and Authentication Failures
**File:** `D:\building-compliance-os\src\app\(auth)\signup\page.tsx` (line 107)

**Description:**
The signup form only enforces `minLength={6}` on the password field via HTML attribute. There is no server-side password complexity enforcement -- Supabase has its own defaults (minimum 6 characters by default) but there are no requirements for uppercase, numbers, or special characters.

**Impact:** Users can create accounts with weak passwords like `123456` or `aaaaaa`.

**Remediation:** Configure Supabase Auth password requirements or add server-side validation before calling `signUp()`. Recommend minimum 8 characters with complexity requirements.

---

### S-14: Email HTML Injection Potential (LOW)

**OWASP:** A03 - Injection
**Files:**
- `D:\building-compliance-os\src\lib\reports\delivery.ts` (lines 21-32)
- `D:\building-compliance-os\src\lib\notifications\deadline-reminders.ts` (lines 106-119)

**Description:**
Building names and other user-controlled values are interpolated directly into HTML email content without escaping:

```typescript
const html = [
  "<p>Please find attached the compliance report for " + options.buildingName + " for the year " + options.year + ".</p>",
  // ...
].join("\n");
```

If a building name contains HTML like `<script>alert(1)</script>` or `<img src=x onerror=...>`, it would be injected into the email HTML body.

**Impact:** HTML injection in emails could be used for phishing (e.g., injecting fake login forms) or in email clients that render HTML with limited sandboxing.

**Remediation:** HTML-encode all user-controlled values before inserting into email templates.

---

## Verification of Previously Fixed Issues

### P0 Issues (Previously Reported - VERIFIED)

| Issue | Status | Verification Notes |
|-------|--------|-------------------|
| IDOR everywhere | **PARTIALLY FIXED** | `assertBuildingAccess()` and `filterAuthorizedBuildingIds()` are implemented and used on all endpoints and server actions. However, residual IDOR remains in update/delete operations (see S-01). |
| Plaintext PM passwords | **FIXED** | AES-256-GCM encryption via `encrypt()` / `decrypt()` in `src/lib/auth/encryption.ts`. Key validation enforces 32-byte hex key. IV is random per encryption. Auth tag is verified on decryption. Implementation is cryptographically sound. |
| SQL injection | **FIXED** | All database queries use Drizzle ORM's parameterized query builder. The reports route now uses `sql` template literals with parameter binding (e.g., `sql\`${utilityReadings.periodStart} >= ${yearStart}\``). No string concatenation in SQL. |
| No DB transactions | **FIXED** | Multi-step writes in webhook handler, deduction CRUD, and compliance workflow all use `db.transaction()`. |
| No connection pooling | **FIXED** | Postgres client configured with `max: 10`, `idle_timeout: 20`, `connect_timeout: 30`. |

### P1 Issues (Previously Reported - VERIFIED)

| Issue | Status | Notes |
|-------|--------|-------|
| N+1 queries | **FIXED** | Batch queries with `inArray()` used throughout. |
| Missing DB indexes | **FIXED** | 11 indexes on FK columns verified in schema. |
| No security headers | **FIXED** | 6 headers present. Missing CSP (see S-04). |
| No rate limiting | **PARTIALLY FIXED** | Rate limiting exists but is in-memory only (see S-06). |
| Silent error swallowing | **FIXED** | Error logging with `console.error` throughout. Sentry configured. |

---

## Configuration Security Review

### Security Headers (next.config.ts)

| Header | Value | Assessment |
|--------|-------|------------|
| X-Frame-Options | DENY | Good - prevents clickjacking |
| X-Content-Type-Options | nosniff | Good - prevents MIME sniffing |
| Referrer-Policy | strict-origin-when-cross-origin | Good |
| Permissions-Policy | camera=(), microphone=(), geolocation=(), interest-cohort=() | Good |
| X-DNS-Prefetch-Control | on | Acceptable |
| Strict-Transport-Security | max-age=63072000; includeSubDomains; preload | Good - 2 year max-age with preload |
| Content-Security-Policy | **MISSING** | **Should be added** (see S-04) |

### Authentication Architecture

- **Auth Provider:** Supabase Auth (JWT-based, industry standard)
- **Session Management:** Cookie-based via `@supabase/ssr`, refreshed in middleware
- **Auth Verification:** Uses `supabase.auth.getUser()` which validates JWT server-side (not just `getSession()` which only checks locally -- this is correct)
- **Middleware Protection:** All non-public routes require authentication. Public routes are explicitly whitelisted.

### Middleware Review (`src/middleware.ts`)

**Positive:**
- Authentication enforced at middleware level for all non-public routes
- Uses `getUser()` (server-side JWT verification) rather than `getSession()` (client-side only)
- Proper cookie handling for session refresh

**Concerns:**
- Line 28: `pathname.includes(".")` bypasses auth for any path containing a dot. This is intended to skip static files but could potentially be exploited if an API route ever includes a dot in its path.
- All webhook routes under `/api/webhooks` are bypassed (line 27). This is correct for Stripe webhooks but should be reviewed if new webhook endpoints are added.

### Encryption Review (`src/lib/auth/encryption.ts`)

- **Algorithm:** AES-256-GCM (authenticated encryption -- good)
- **IV:** 12 bytes, randomly generated per encryption (correct for GCM)
- **Key Management:** Read from `ENCRYPTION_KEY` env var, validated as 32 bytes
- **Format:** `iv:ciphertext:authTag` (clear, parseable)
- **Assessment:** Implementation is cryptographically sound. No key rotation mechanism exists, but acceptable for current scale.

### Stripe Webhook Security (`src/app/api/webhooks/stripe/route.ts`)

- **Signature Verification:** Uses `stripe.webhooks.constructEvent()` with signing secret -- correct
- **Error Handling:** Returns 400 on signature verification failure -- correct
- **Transactions:** All database mutations within webhook handlers use `db.transaction()` -- correct
- **Assessment:** Well-implemented webhook security

### XML Parser Security (`src/lib/portfolio-manager/xml-parser.ts`)

- **No XXE Risk:** The parser uses regex-based extraction, not a DOM/SAX parser. It does not process DTDs, entities, or external references. This is actually more secure than using a full XML parser (though less capable).
- **Assessment:** No XXE vulnerability. The regex-based approach is safe for the structured PM API responses.

---

## Dependency Analysis

### package.json Review

| Package | Version | Notes |
|---------|---------|-------|
| next | 16.1.6 | Latest major version |
| react | 19.2.3 | Latest major version |
| @supabase/ssr | ^0.9.0 | Current |
| @supabase/supabase-js | ^2.98.0 | Current |
| stripe | ^20.4.0 | Current |
| drizzle-orm | ^0.45.1 | Current |
| zod | ^4.3.6 | Current |
| @sentry/nextjs | ^10.42.0 | Current |
| inngest | ^3.52.5 | Current |
| postgres | ^3.4.8 | Current |

**Assessment:** All dependencies appear to be recent versions. No known CVEs identified in the listed package versions at time of audit. Recommend running `npm audit` regularly in CI pipeline (CI workflow exists in `.github/workflows/ci.yml`).

**Recommendation:** Add `npm audit --audit-level=high` to the CI pipeline to catch vulnerable dependencies automatically.

---

## Recommendations Summary

### Priority 1 (Must Fix Before Production)

1. **Fix residual IDOR (S-01):** Add compound WHERE clauses to all update/delete operations to verify resource-building ownership.
2. **Fix open redirect in auth callback (S-02):** Validate the `next` parameter to ensure it's a relative path.
3. **Add Content-Security-Policy (S-04):** Implement a CSP header to mitigate XSS.
4. **Replace in-memory rate limiter (S-06):** Use Redis-backed rate limiting for serverless environments.

### Priority 2 (Should Fix Soon)

5. **Implement RBAC (S-05):** Enforce role-based access control for administrative operations.
6. **Verify Inngest signing key (S-07):** Ensure the signing key is required and validated in production.
7. **Fix pre-auth rate limiting order (S-08):** Rate-limit after authentication, using user/org identity.
8. **Sanitize error messages (S-09):** Return generic errors in production, log details to Sentry.

### Priority 3 (Should Fix)

9. **Validate redirect in login page (S-03).**
10. **Add CORS configuration (S-10).**
11. **Add input length limits (S-11).**
12. **Fix document deletion authorization (S-12).**
13. **Strengthen password policy (S-13).**
14. **HTML-encode email content (S-14).**

---

## Positive Security Findings

The following security practices are well-implemented:

1. **Authentication:** Server-side JWT verification via `getUser()` (not just client-side session checks)
2. **Middleware protection:** Comprehensive auth enforcement at the middleware layer
3. **Parameterized queries:** 100% of database queries use Drizzle ORM's query builder -- no SQL injection risk
4. **Stripe webhook verification:** Proper signature validation with `constructEvent()`
5. **File upload validation:** Size limits (10MB), extension checks (.csv only), header validation
6. **Encryption:** Proper AES-256-GCM with random IVs for PM credential storage
7. **Secret management:** All secrets via environment variables, `.env*` in `.gitignore`
8. **Transaction integrity:** Multi-step writes wrapped in database transactions
9. **Zod validation:** Input validation schemas on server actions that handle user data
10. **Error monitoring:** Sentry configured for client, server, and edge runtimes
11. **Security headers:** 6 of 7 recommended headers present (missing CSP)
12. **Building-level access control:** `assertBuildingAccess()` used consistently across all API routes and server actions
13. **No XSS vectors:** No use of `dangerouslySetInnerHTML`, `eval()`, or `innerHTML` in the codebase
14. **No hardcoded secrets:** Grep for API keys, passwords, and tokens returned zero false positives
15. **Background job processing:** CSV imports delegated to Inngest for non-blocking execution

---

*Report generated by Security Auditor Agent on 2026-03-07*
