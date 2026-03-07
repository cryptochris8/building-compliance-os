# API Documentation

All API routes require authentication via Supabase session cookies unless otherwise noted.

## Routes

### 1. GET /api/compliance/portfolio

Get portfolio compliance summary for the authenticated user's organization.

- **Auth**: Required
- **Query Params**: `year` (optional, defaults to current year)
- **Response**: `200` with portfolio summary object including building counts, emissions totals, and per-building compliance data
- **Errors**: `401` (unauthorized), `404` (no organization), `500` (server error)

### 2. GET /api/compliance/[buildingId]

Get compliance data for a specific building.

- **Auth**: Required (building access verified)
- **Query Params**: `year` (optional, returns latest if not specified)
- **Response**: `200` with compliance year record (emissions, limit, penalty, status, completeness)
- **Errors**: `401`, `404`, `500`

### 3. POST /api/compliance/[buildingId]

Recalculate compliance for the current year.

- **Auth**: Required (building access verified)
- **Request Body**: None
- **Response**: `200` with recalculated compliance result
- **Errors**: `401`, `500`

### 4. GET /api/reports/[buildingId]

Generate and download a PDF compliance report.

- **Auth**: Required (building access verified)
- **Query Params**: `year` (optional, defaults to current year)
- **Rate Limit**: 10 requests/minute per building
- **Response**: `200` with `application/pdf` file attachment
- **Errors**: `401`, `404`, `429` (rate limited), `500`

### 5. POST /api/reports/bulk

Get download URLs for multiple building reports.

- **Auth**: Required (authorized building IDs filtered)
- **Request Body**:
  ```json
  {
    "buildingIds": ["uuid", "uuid"],
    "year": 2024
  }
  ```
- **Response**: `200` with array of report URLs
- **Errors**: `400`, `401`, `500`

### 6. POST /api/buildings/[id]/import

Upload a CSV file for bulk reading import.

- **Auth**: Required (building access verified)
- **Rate Limit**: 5 imports/minute per building
- **Request Body**: Multipart form data with `file` field (CSV, max 10MB)
- **Response**: `200` with import job record (id, status, rowsTotal)
- **Note**: Processing is handled asynchronously via Inngest background job
- **Errors**: `400` (invalid file), `401`, `429`, `500`

### 7. GET /api/import-jobs/[id]

Check status of a CSV import job.

- **Auth**: Required (org-scoped)
- **Response**: `200` with job record (status, rowsImported, rowsFailed, errorLog)
- **Errors**: `401`, `404`, `500`

### 8. GET /api/billing

Get subscription status or billing portal URL.

- **Auth**: Required
- **Query Params**: `action=portal` for Stripe billing portal redirect
- **Response (default)**: `200` with subscription tier, status, trial info
- **Response (portal)**: `200` with `{ url: "..." }` Stripe portal URL

### 9. POST /api/billing

Create a Stripe checkout session.

- **Auth**: Required
- **Rate Limit**: 5 checkout attempts/minute per org
- **Request Body**:
  ```json
  {
    "priceId": "price_xxx"
  }
  ```
- **Response**: `200` with `{ url: "..." }` Stripe checkout URL
- **Errors**: `400`, `401`, `429`, `500`

### 10. POST /api/webhooks/stripe

Handle Stripe webhook events.

- **Auth**: Stripe signature verification via `stripe-signature` header
- **Rate Limit**: 100 calls/minute per IP
- **Events handled**:
  - `checkout.session.completed` - Creates subscription
  - `customer.subscription.updated` - Updates subscription status
  - `customer.subscription.deleted` - Cancels subscription
  - `invoice.payment_failed` - Marks as past due
- **Response**: `200` with `{ received: true }`

### 11. GET|POST|PUT /api/inngest

Inngest function handler endpoint for background job processing (CSV imports, etc.).

- **Auth**: Managed by Inngest internally
- **Purpose**: Serves as webhook endpoint for Inngest event queue

## Common Error Responses

All error responses follow the format:
```json
{
  "error": "Error message description"
}
```

## Rate Limiting

Rate limits use an in-memory sliding window algorithm. Exceeding the limit returns `429 Too Many Requests`.
