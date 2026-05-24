# 6. Withdraw

Pull your USDC back off the exchange to your wallet. Two-step: engine intent → on-chain settlement.

## What you're doing

Withdrawal is a **two-leg flow**:

1. **`POST /v1/withdrawals`** — submit a withdrawal intent to the engine. The engine debits your `cross_balance` immediately and freezes the amount in `reserved_withdrawals` while the on-chain settlement is in flight.
2. **withdrawal-settler picks it up** — the S2 `withdrawal-settler` service watches for new intents, signs them with the operator key, and calls `DepositPool.settleWithdrawal(...)` on-chain. USDC moves from the pool to your destination address.

End-to-end takes **~6 seconds** (engine acceptance is instant; on-chain settlement is 1-2 L2 blocks).

## Prereqs

- Logged in ([Flow 2](./02-login)) with a session that has the **`withdraw` permission** (it's set when you mint the api key — login-flow keys have it by default).
- `cross_balance ≥ amount` (you can't withdraw more than you have available — `reserved_withdrawals` doesn't count).
- You picked a `destination_address` (your wallet, an external wallet, anything that can receive ERC-20).

## Step 1 — submit a withdrawal intent

```python
import secrets

body = {
    "trading_account_id": 1779526509,
    "amount": 5000000,                   # 5 USDC × 10⁶
    "destination_address": "0xD77215d8EB6Ec20C3552D1b90264d7693F706b46",
    "idempotency_key": secrets.token_hex(8),  # 16 hex chars = 64 bits
}
code, resp = signed_request("POST", "/v1/withdrawals", body)
print(f"HTTP {code}\n{resp}")
```

| Field | Required | Notes |
|---|---|---|
| `trading_account_id` | yes | Your auth-bound account. |
| `amount` | yes | In 6-decimal USDC units. `5000000` = 5 USDC. |
| `destination_address` | yes | Any 0x-prefixed Ethereum address — USDC will land there. |
| `idempotency_key` | yes | 64-bit value (any hex). **Retry-safe** — submitting the same key twice returns the existing intent without double-debiting. |

### What success looks like

```json
{
  "status": "accepted",
  "intent_id": 1779526510,
  "amount": 5000000,
  "destination_address": "0xD77215d8EB6Ec20C3552D1b90264d7693F706b46",
  "duplicate": false
}
```

| Field | Meaning |
|---|---|
| `intent_id` | Engine-assigned id (large number above the id-floor — won't collide with historical settlements). |
| `duplicate` | `true` if this `idempotency_key` was already used; the existing intent is returned. |

After this, the engine has:

- Debited `cross_balance` by `amount`.
- Added `amount` to `reserved_withdrawals` while the settler works.

## Step 2 — watch for on-chain settlement

The settler picks up the intent within a few seconds and posts on-chain. You can watch by either:

### Option A — gateway API

```python
# Poll the engine for updated state
code, body = signed_request(
    "GET",
    "/v1/account?trading_account_id=1779526509",
)
# When `reserved_withdrawals` drops back to 0, the settler is done.
```

### Option B — `/v1/withdrawals/history`

```python
code, body = signed_request(
    "GET",
    "/v1/withdrawals/history?trading_account_id=1779526509&limit=10",
)
```

Look for your `intent_id`. The `status` field transitions:

```
pending  →  finalized   (success: USDC sent to destination)
pending  →  failed      (settler ran out of gas, RPC down, etc.)
```

### Option C — on-chain directly

```bash
POOL=0xe144d2A3DE21bc48991bDEB4ade6DdE6901bcDC6
RPC=https://sepolia-rollup.arbitrum.io/rpc

cast call $POOL "isWithdrawalSettled(uint256)(bool)" 1779526510 --rpc-url $RPC
# returns `true` once the on-chain tx confirms.
```

## What success looks like

After ~6 seconds:

- `cross_balance` is permanently reduced.
- `reserved_withdrawals` is back to its prior value (the freeze releases).
- The destination wallet holds the new USDC.
- `/v1/withdrawals/history` shows the row with `status: "finalized"` and a `tx_hash`.

```bash
# Verify the recipient got it
USDC=0xd99b55120F9ebcc38058b23E8Eb38C56A470f2cD
DEST=0xD77215d8EB6Ec20C3552D1b90264d7693F706b46

cast call $USDC "balanceOf(address)(uint256)" $DEST --rpc-url $RPC
```

## Common errors

| Status | Body | Meaning | Fix |
|---|---|---|---|
| `400` | `InsufficientBalance` | `amount > cross_balance` | Lower the amount or cancel open orders to free margin. |
| `400` | `IdempotencyKeyTooLong` / `BadAddress` | Malformed input | Use a 16-char hex `idempotency_key` and a 42-char `0x…` address. |
| `403` | `PermissionDenied` | Your key doesn't have the `withdraw` permission | Re-login (default session keys have it) — or for restricted automation keys, check the key's permission set. |
| `409` | duplicate | The `idempotency_key` was already used — `duplicate: true` returned without a re-debit | Expected behavior — your retry just got the original intent back. |

## What happens if the settler fails?

The intent stays in `status: "failed"` and the engine eventually:

- Reverses the debit (your `cross_balance` is restored).
- Removes the `reserved_withdrawals` freeze.

You can retry by submitting a new withdrawal with a **fresh `idempotency_key`**. Reusing the old key would return the failed intent (idempotent), not create a new one.

## End of flow

That's the complete user lifecycle: mint → log in → deposit → trade → withdraw. You can repeat any step independently.
