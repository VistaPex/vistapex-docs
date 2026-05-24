# Error code catalog

Every error response from the gateway looks the same:

```json
{
  "code": 1012,
  "message": "PriceDeviationExceedsTolerance"
}
```

This page is the consolidated reference for every numeric `code` you might see. Per-endpoint quirks are noted under each row.

## At-a-glance table

| `code` | HTTP | Category | Meaning |
|---|---|---|---|
| `1006` | `429` | Rate limit | Too many requests in a short window. |
| `1010` | `401` | Auth | Credentials missing, malformed, expired, or revoked. |
| `1011` | `403` | Auth | Authenticated, but the key isn't allowed to do this. |
| `1012` | `400` | Request | Bad input — missing field, wrong type, business-rule rejection. |
| `1013` | `404` | Request | Resource not found (order, market, account). |
| `1014` | `500` | Server | Internal error from the proxy or downstream service. |
| `1015` | `503` | Server | Upstream temporarily unavailable (Privy JWKS, read-api proxy, etc.). |

## 1006 — rate limited (`HTTP 429`)

You're calling too fast. The gateway enforces per-IP and per-key rate limits.

| Endpoint | Limit (typical) |
|---|---|
| `POST /v1/auth/login` | ~10 / min per IP |
| `POST /v1/orders` | ~50 / second per key |
| `POST /v1/withdrawals` | ~1 / 5 s per key |
| Public market data (`/v1/markets/*`, `/v1/trades`, `/v1/klines`) | Several hundred / min per IP |

**Fix:** back off (jittered exponential, starting at ~1 s). For high-frequency reads, switch to the WebSocket equivalents — they're push-only and don't consume request budget.

## 1010 — invalid credentials (`HTTP 401`)

The most common error after rate limits. Returned when:

- `x-api-key` header is missing or doesn't match any active key.
- `x-signature` doesn't recompute over the canonical payload.
- `x-timestamp` is more than ±60 s off from server time (replay protection).
- The key has been revoked or has expired (past `expires_at_ms`).
- `Authorization: Bearer <jwt>` is missing/invalid on `POST /v1/auth/login`.

The message string is deliberately generic (`"invalid credentials"`) so the same code covers all the failure modes — there's no oracle that tells an attacker which specific check failed.

**Fix:** check, in order:

1. Are you signing the right canonical payload? See [auth & signing](./auth-signing) for the format.
2. Is your `x-timestamp` in **milliseconds** (not seconds)?
3. Did you `hex_decode` the `api_secret` before using it as the HMAC key?
4. Is your system clock within ±60 s of UTC?
5. Has the session expired? Re-login.

## 1011 — permission denied (`HTTP 403`)

You're authenticated, but the key you signed with doesn't have the permission this endpoint requires, or fails a constraint.

Common scenarios:

| Triggered by | Meaning |
|---|---|
| `POST /v1/orders` with a read-only key | Key needs `manage_orders` permission. |
| `POST /v1/withdrawals` without `withdraw` permission | Mint a key with `withdraw: true` (or use a session key). |
| `POST /v1/orders` for market 3 with `allowed_markets: [1, 2]` | Constraint violation. |
| `POST /v1/orders` with `size: 200` and `max_order_size: 100` | Constraint violation. |

**Fix:** mint a new key with the right permission/constraint set, OR use a session key (which has all three permissions and no constraints).

See [Create a long-lived API key](../flows/api-keys) for the permission + constraint model.

## 1012 — bad request (`HTTP 400`)

A catch-all for "your request is wrong somehow." The `message` field disambiguates. Categories:

### Schema validation

- `"missing field: trading_account_id"` — required field absent.
- `"invalid type: expected u64, got string"` — wrong shape.
- `"order body exceeds 4 KiB"` — body too big.

### Business-rule rejections (engine-level)

The most useful messages. Each one identifies a specific rejection from the matching engine:

| Message | Meaning | Fix |
|---|---|---|
| `PriceDeviationExceedsTolerance` | Order price is more than `max_price_deviation_bps` from mark | Quote within `mark ± 5%`. |
| `MinLots` / `SizeNotMultipleOfLot` | Size below market's `min_lots` or not a multiple of `lot_size` | Check `GET /v1/markets`. |
| `InsufficientBalance` | `cross_balance − pending_margin < required_margin` | Deposit more or cancel open orders. |
| `PostOnlyCross` | `post_only=true` but order would have crossed | Drop `post_only` or quote further from spread. |
| `FOK_NotFillable` | FOK couldn't fully fill at your price | Use IOC, or lower size. |
| `IOCRemainder` | IOC couldn't fill at all (informational on the cancel event) | — |
| `ReduceOnlyAutoCancel` | `reduce_only=true` but no position to reduce | Drop `reduce_only`. |
| `TpDirectionInvalid` / `SlDirectionInvalid` | TP/SL on the wrong side for the parent's direction | See [Conditional orders](../flows/conditional-orders) for the direction rules. |
| `TpSlOnNonReducingOrder` | TP/SL on a `reduce_only` parent (which closes, not opens) | Drop `tp_price`/`sl_price`. |
| `TooManyConditionalOrdersForAccount` | 10 conditional orders/(account, market) limit reached | Close existing positions to clear. |
| `OrderNotFound` (on cancel) | The `order_id` you're cancelling doesn't exist or isn't active | Verify via `GET /v1/account.open_orders`. |
| `OrderNotOwned` (on cancel) | The `order_id` belongs to a different account | You can only cancel your own orders. |
| `VersionConflict` (on cancel) | Transient — account state mutated mid-cancel | Retry. |
| `InvalidMarket` | The `market_id` doesn't exist or is paused | Check `GET /v1/markets`. |
| `PriceStaleHalt` / `PriceStaleDegrade` | Oracle price is stale, engine refused | Retry shortly; if persistent, market may be halted. |

### Auth-flow specifics

- `"trading_account_id is required"` on read endpoints — pass `?trading_account_id=...` in the query string.
- `"login body exceeds 1 KiB"` on `POST /v1/auth/login` — the body must be tiny; this is a DoS guard.
- `"idempotency_key_too_long"` on `POST /v1/withdrawals` — keys are bounded to 64 bits.

## 1013 — not found (`HTTP 404`)

| Endpoint | When |
|---|---|
| `GET /v1/markets/:id/...` | Unknown `market_id`. |
| `DELETE /v1/orders/:id` | Order id is malformed (404 ≠ "wasn't active" — that's `1012 OrderNotFound`). |
| `DELETE /v1/auth/sessions/:api_key_id` | Session id doesn't exist or isn't yours. |
| `DELETE /v1/api_keys/:id` | API key doesn't exist or isn't yours. |

**Fix:** verify the id from the relevant list endpoint (`GET /v1/markets`, `GET /v1/auth/sessions`, `GET /v1/api_keys`).

## 1014 — internal error (`HTTP 500`)

Something broke inside the gateway or a downstream service. Not your fault.

| Where | When |
|---|---|
| Proxied history endpoints (`/v1/orders/history`, `/v1/trades/history`, etc.) | The read-api service errored on its end. Treat as transient. |
| Other endpoints | Bug or partial outage — should be rare. |

**Fix:** retry with exponential backoff. If you see this consistently for more than a minute, the deployment has a real problem — check the public status page.

## 1015 — service unavailable (`HTTP 503`)

A specific upstream is temporarily down. The message disambiguates:

| Message | Cause |
|---|---|
| `"privy auth temporarily unavailable"` | Privy JWKS fetch failed AND no cached copy. **Only on `POST /v1/auth/login`**. Affects login but not existing sessions. |
| `"read-api transport failure"` | The proxied read-api connection failed (timeout / TLS / connect / breaker open). Affects history endpoints. |
| `"wal writer closed"` | Engine WAL writer task exited. Catastrophic — operator must intervene. Existing sessions can read but not write. |

**Fix:** retry with backoff. If the message specifies a known upstream, the cause is upstream — your code's fine.

## How `429` rate-limit responses surface

`429` responses also include standard headers:

```
HTTP/1.1 429 Too Many Requests
Retry-After: 30
x-ratelimit-limit: 50
x-ratelimit-remaining: 0
x-ratelimit-reset: 1779604000

{"code":1006,"message":"rate limit exceeded"}
```

Honor `Retry-After` for the simplest backoff. Or watch `x-ratelimit-remaining` proactively and slow down before you hit zero.

## Programmatic error handling — recommended pattern

```python
import time, json
from urllib.error import HTTPError

def signed_request_with_retry(method, path, body=None, max_retries=3):
    delay = 0.1
    for attempt in range(max_retries):
        code, body_text = signed_request(method, path, body)
        if code < 400:
            return code, body_text

        err = json.loads(body_text)
        # Don't retry permanent failures
        if err["code"] in (1010, 1011, 1012, 1013):
            return code, body_text

        # Backoff for transient failures
        if code == 429:
            # Honor Retry-After if you've extracted it from headers
            time.sleep(delay)
        elif code in (500, 503):
            time.sleep(delay)
        else:
            return code, body_text

        delay = min(delay * 2, 30)
    return code, body_text
```

Don't blind-retry on `1010/1011/1012/1013` — those are deterministic; the same call will fail the same way forever. Retry only `429 / 1014 / 1015`.
