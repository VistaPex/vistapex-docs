# Manage your profile

Read who you are, bind a wallet address, and set a default trading account when you have multiple.

## What you're doing

Three endpoints under `/v1/me`:

| Endpoint | Use |
|---|---|
| `GET /v1/me` | Read your identity bundle — Privy DID, user_id, list of trading accounts, default TA, bound wallet address. |
| `PUT /v1/me/wallet` | Bind a wallet address to your identity (requires a signed proof). |
| `PATCH /v1/me/default_trading_account` | Pick which trading account is the default for endpoints that don't take an explicit `trading_account_id`. |

All three are HMAC-signed (your session credentials from [Flow 2](./02-login)).

## 1. Who am I?

The most useful call on the profile surface — one shot returns everything about your identity:

```python
code, body = signed_request("GET", "/v1/me")
```

### Response

```json
{
  "user_id": 1779526509,
  "privy_did": "did:privy:cmpi1n68i00ld0cl5o2u3kqw3",
  "default_trading_account_id": 1779526509,
  "trading_accounts": [
    {
      "trading_account_id": 1779526509,
      "created_at_ms": 1779531500000,
      "is_default": true
    }
  ],
  "wallet_address": "0xD77215d8EB6Ec20C3552D1b90264d7693F706b46",
  "fee_tier": 0
}
```

| Field | Meaning |
|---|---|
| `user_id` | Your top-level identity — survives across multiple trading accounts. |
| `privy_did` | The Privy DID issuing your JWTs. Should match the `sub` claim. |
| `default_trading_account_id` | The TA used when an endpoint expects a `trading_account_id` and you don't provide one. |
| `trading_accounts[]` | Every TA owned by this `user_id`. Most users have exactly one; advanced users can have separate accounts per strategy. |
| `wallet_address` | The on-chain wallet you've bound (used for default deposit/withdrawal destination). `null` if unbound. |
| `fee_tier` | Account-level fee tier (driven by 30d volume). |

::: tip Why two ids?
`user_id` is the identity. `trading_account_id` is the account state (balance, positions, orders). One user, many trading accounts — useful if you want to keep separate risk pools or strategies. Most users have one of each, and the numbers happen to match.
:::

## 2. Bind a wallet address

The first time you connect a Privy account via the embedded wallet flow, the frontend usually binds your EVM address automatically. You can also bind explicitly:

```python
import time

body = {
    "wallet_address": "0xD77215d8EB6Ec20C3552D1b90264d7693F706b46",
    "signature": "0xabc...",   # EIP-191 signature of the bind message
    "message": f"VistaPex wallet bind: {USER_ID} {NONCE}",
}
code, resp = signed_request("PUT", "/v1/me/wallet", body)
```

The signature proves you control the wallet address — without it the engine would let anyone claim any address.

### The bind message

Format: `"VistaPex wallet bind: <user_id> <nonce>"` — a single line of text. The wallet signs this via `personal_sign` (EIP-191). The engine recovers the signer address from the signature and compares to `wallet_address`.

`<nonce>` is any unique-per-bind string — most frontends use `Date.now().toString()`.

### Once bound

- The bound address shows in `GET /v1/me.wallet_address`.
- `/v1/lookup/by_address?address=0x...` (public, no auth) returns the bound `trading_account_id`. Useful for portfolio trackers that want to look up a user by their public address.
- Re-binding the SAME address is a no-op.
- Binding a DIFFERENT address replaces the existing binding (one wallet per user).

## 3. Pick your default trading account

Only relevant if you have more than one trading account:

```python
body = {"trading_account_id": 1779526510}
code, resp = signed_request("PATCH", "/v1/me/default_trading_account", body)
```

After this, any endpoint that accepts an implicit `trading_account_id` (rare — most explicitly require it) uses `1779526510`.

### Response

```json
{
  "default_trading_account_id": 1779526510
}
```

The TA must be one of yours — the engine rejects a TA you don't own with `403`.

## How to know if you have multiple trading accounts

The default is one per Privy account. You only end up with multiple if you've gone through an explicit "create new trading account" flow (admin-gated; not common). For 99% of users `trading_accounts[]` has exactly one entry.

## Common errors

| Status | Body | Meaning | Fix |
|---|---|---|---|
| `400 invalid signature` | `{"code":1012,...}` | The wallet signature doesn't recover to `wallet_address` | Re-sign with the right wallet; double-check the bind message string is byte-identical. |
| `400 wallet already bound to different user` | `{"code":1012,...}` | The address you're trying to bind is already on another user_id | Only one user per address. Pick a different address, or have the other user unbind first. |
| `400 invalid_default_ta` | `{"code":1012,...}` | The TA you tried to set as default isn't one of yours | Pass a `trading_account_id` from `GET /v1/me.trading_accounts[]`. |
| `401 invalid credentials` | `{"code":1010,...}` | Session expired / signature mismatch | Re-login. |

## Where to next

- → [View your orders](./05-view-orders) — your account state once profile is set up.
- → [Deposit](./03-deposit) — bound wallet address is the default `destination_address` on withdrawals.
