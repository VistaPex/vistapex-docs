# Create a long-lived API key

For backend services, trading bots, automated workflows — anything that needs an API key that outlasts a session and can be locked down to a specific scope.

## What you're doing

Session keys (the ones you get from [`POST /v1/auth/login`](./02-login)) are short-lived (~1 h), full-permission credentials. Great for an interactive UI; terrible for a service that runs for weeks.

Long-lived API keys solve this with three differences:

| | Session key (login) | Long-lived API key |
|---|---|---|
| Lifetime | ~1 hour | Up to whatever `expires_at_ms` you pick (or no expiry — `null`). |
| Permissions | Always all three (`read`, `manage_orders`, `withdraw`) | Pick any subset. |
| Constraints | None | Restrict to specific `market_ids`, max `order_size`, withdrawal-address allowlist, etc. |
| Revocation | DIY (delete or log out) | DIY, plus tied to a label/name for audit trails. |

Both kinds sign requests the same way (HMAC-SHA256 over the canonical payload — see [auth & signing](../reference/auth-signing)).

## Prereqs

- A live session ([Flow 2](./02-login)) — you mint long-lived keys with your session credentials.
- A clear idea of what the new key needs to do (so you can scope it tightly).

::: warning Principle of least privilege
A leaked read-only key is a much smaller problem than a leaked full-permission key. Always scope down. Never give a bot `withdraw` permission unless it absolutely must withdraw.
:::

## 1. Mint a read-only key for analytics

The most common case. A backend service that pulls trade history for reporting:

```python
body = {
    "name": "analytics-prod-reports",
    "permissions": {
        "read": true,
        "manage_orders": false,
        "withdraw": false
    },
    "expires_at_ms": 1782192000000   # ~30 days from now (unix ms). Use null for no expiry.
}
code, resp = signed_request("POST", "/v1/api_keys", body)
print(f"HTTP {code}\n{resp}")
```

### Response

```json
{
  "api_key_id": "k_b41c9d29d3039bda6fdcbed61a87e08e",
  "api_secret": "5a5ed7468a9565739e4f550693bad1f07c0135a7481a94ed31b1821faed8d88",
  "name": "analytics-prod-reports",
  "permissions": { "read": true, "manage_orders": false, "withdraw": false },
  "expires_at_ms": 1782192000000,
  "created_at_ms": 1779600000000
}
```

::: danger The api_secret appears ONCE
Right here on this response. The server never shows it again — there's no "show me my secret" endpoint. **Store it immediately** in a secret manager (1Password, AWS Secrets Manager, HashiCorp Vault, etc.) and don't paste it in chat.
:::

## 2. Mint a trading-only key for a market-making bot

Restricted to specific markets, with a max order size to limit blast radius:

```python
body = {
    "name": "mm-bot-btc-eth",
    "permissions": {
        "read": true,
        "manage_orders": true,
        "withdraw": false        # never let a trading bot withdraw
    },
    "constraints": {
        "allowed_markets": [1, 2],   # BTC-USD and ETH-USD only
        "max_order_size": 100        # in lots; bot cannot place orders > 100 lots
    },
    "expires_at_ms": null            # no auto-expiry — DIY revoke when bot is decommissioned
}
code, resp = signed_request("POST", "/v1/api_keys", body)
```

If the bot tries to:

- Place on market 3 → rejected with `403 market not permitted for this key`.
- Place size 150 → rejected with `403 order size exceeds key limit`.
- Call `POST /v1/withdrawals` → rejected with `403 permission denied`.

## 3. List your existing keys

```python
code, resp = signed_request("GET", "/v1/api_keys")
```

### Response

```json
{
  "api_keys": [
    {
      "api_key_id": "k_b41c9d29d3039bda6fdcbed61a87e08e",
      "name": "analytics-prod-reports",
      "permissions": { "read": true, "manage_orders": false, "withdraw": false },
      "constraints": null,
      "created_at_ms": 1779600000000,
      "expires_at_ms": 1782192000000,
      "active": true
    },
    {
      "api_key_id": "k_a1b2c3d4...",
      "name": "mm-bot-btc-eth",
      "permissions": { "read": true, "manage_orders": true, "withdraw": false },
      "constraints": { "allowed_markets": [1, 2], "max_order_size": 100 },
      "created_at_ms": 1779580000000,
      "expires_at_ms": null,
      "active": true
    }
  ]
}
```

`api_secret` is never on this response (same as sessions — listing exposes only public ids). If you've lost a secret, the only path is **revoke + mint a new one**.

## 4. Revoke a key

When the bot is decommissioned, the key rotates, or you suspect a leak:

```python
KEY_ID = "k_a1b2c3d4..."
code, resp = signed_request("DELETE", f"/v1/api_keys/{KEY_ID}")
```

After this:

- Any request signed with the revoked `api_secret` returns `401 invalid credentials`.
- The key entry stays in the list (with `active: false`) as an audit record. You can't reuse the same `api_key_id`.

## Choosing `expires_at_ms`

| Use case | Suggested expiry |
|---|---|
| One-off backfill / data export | 24 hours from now |
| Recurring weekly cron | 30 days, with calendar reminder to rotate |
| Long-running trading bot | `null` (no expiry), rotate manually every 90 days |
| Personal scripts / experiments | 7 days max — easier to forget than to remember |

The shorter the better. Rotation is cheap; cleanup after a leak is not.

## Common errors

| Status | Body | Meaning | Fix |
|---|---|---|---|
| `400 invalid permissions` | `{"code":1012,...}` | You sent a permission flag you don't have (a session key can only mint keys with ≤ its own permissions) | Drop the permission you don't have, or login with a key that does. |
| `400 constraints invalid` | `{"code":1012,...}` | `allowed_markets` contains an unknown id, or `max_order_size <= 0` | Verify against `GET /v1/markets`. |
| `403 cannot mint withdraw key` | `{"code":1011,...}` | Some deployments require an additional capability to mint keys with `withdraw: true` — typically only the embedded-wallet flow can | Drop `withdraw` from the new key, or do the withdraw flow via the parent session directly. |
| `429 rate limit` | `{"code":1006,...}` | Minting/revoking too fast | Batch your operations; cap at ~1 mint/s. |

## Security checklist before going live

- [ ] `withdraw: false` unless absolutely required.
- [ ] `allowed_markets` populated when the bot only trades certain markets.
- [ ] `max_order_size` set to a realistic upper bound (not `null`).
- [ ] `expires_at_ms` set, unless this is a permanent service.
- [ ] `name` descriptive enough that future-you can identify it during audit.
- [ ] `api_secret` stored in a secret manager, NOT in source code or `.env` files committed to git.
- [ ] You have a documented procedure to rotate this key when the person who minted it leaves.

## Where to next

- → [Refresh / revoke sessions](./sessions) — for session-key management (the short-lived ones).
- → [Auth & request signing](../reference/auth-signing) — the HMAC scheme both key kinds share.
