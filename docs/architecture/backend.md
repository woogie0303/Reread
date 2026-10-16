# Backend Conventions

NestJS · MongoDB / Mongoose

## Module layout

```
src/
  common/     Guards · current-user decorator · validation pipe · rate-limit
  auth/       Token issuance · OAuth strategies
  {domain}/   One module per domain entity
    {domain}.controller.ts
    {domain}.service.ts
    {domain}.schema.ts
    dto/
```

Each module owns its own schema, service, and controller.
Cross-module dependencies go through the module's public service — never direct schema access.

## Ownership rule

Every query filters by **both** document ID and owner ID:

```ts
this.model.findOne({ _id: id, readerId: currentReader._id })
```

A request for another user's document returns **404**, not 403 —
existence is not revealed. Guards verify identity only; services verify ownership.

## Unique-index upsert pattern

When saving a record that should be de-duplicated:

1. Define a unique compound index on the collection (e.g. `(ownerId, normalizedTerm)`).
2. Use `findOneAndUpdate` with `upsert: true` — never a separate "check then insert".
3. Return `{ created: boolean }` so the caller can distinguish first-save from update.

This eliminates race conditions and keeps re-encounter logic in the database layer.

## Cascade delete order

When deleting a user account (or any parent document with children):

1. Delete all child documents first.
2. Delete the parent last.

If the process is interrupted, the parent still exists and the operation can be retried
safely. A parent deleted first leaves orphaned children with no recovery path.
Every new collection that stores user-owned data must be registered in the
account-deletion service.

## Validation messages

All DTO validation messages must be in the **user-facing language** of the app.
Platform-default English messages must not reach the client.
Original messages go to the server log; translated messages go in the response.

## Rate limiting

Key by **authenticated user ID** (from a verified token) when available, by IP otherwise.
IP-only keying fails for shared mobile networks and misconfigured proxies.
Never read the user ID from an unverified header or body field.

Store is in-process memory by default; switch to Redis for multi-instance deployments.

## AI model interface

AI calls go through an interface, not a concrete SDK call:

```ts
interface AskModel {
  ask(input: Input[]): Promise<Output[]>;
  cost(usage: TokenUsage): number;
}
```

The active provider is chosen by an environment variable.
Adding a new provider = implement the interface + register in the factory.
Prompt structure and response schema are shared across providers — providers
must not diverge on what they accept or return.

**Timeouts**: set an explicit timeout shorter than the client's timeout so the server
responds before the client gives up. On timeout, the request becomes a pending/deferred
state — not an error.

**Structured output**: validate responses with a schema (e.g. zod) regardless of
whether the model enforces it natively. On parse failure, retry once; on second failure,
mark the request as deferred.

## Capture-never-fails pattern

For any operation where the user's input is valuable even without a full backend response:

1. Persist the user's data immediately (status: `pending`).
2. Attempt the expensive operation (AI call, external API) asynchronously.
3. On success, update the record.
4. On timeout or quota exhaustion, leave it `pending` — the user can resolve it later.

`pending` is a state, not an error. Expose it as a surface in the UI.

## Quota pattern (cost-based, not count-based)

Avoid resetting a counter to zero on a schedule — a failed reset leaves the quota
permanently wrong. Instead:

- Track cumulative cost (in dollars or tokens) from the start of the billing period.
- Compute "remaining" as `budget - sum(costs this period)` at query time.
- The app displays a ratio and a boolean (`canAsk: remaining > 0`), not the raw cost.

## API route conventions

- `GET /resource` — list, supports filter params
- `GET /resource/:id` — single item
- `POST /resource` — create
- `PATCH /resource/:id` — partial update
- `DELETE /resource/:id` — delete (cascades documented in comments)
- Nested actions: `POST /resource/:id/action-name`

Cascade behavior (what else gets deleted) must be documented on the endpoint.
DELETE is idempotent — a 404 on a non-existent resource is acceptable.
