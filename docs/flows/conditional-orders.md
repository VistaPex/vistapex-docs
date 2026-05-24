# Conditional orders (TP / SL)

Attach a take-profit and/or stop-loss to any order. When the parent order fills, two trigger orders are automatically armed against the resulting position — they close (or reduce) the position when price crosses the level.

## What you're doing

Every `POST /v1/orders` body accepts two optional fields:

| Field | Effect |
|---|---|
| `tp_price` | Take-profit trigger price. Fires a reduce-only opposing market order when the mark price crosses it in the profit direction. |
| `sl_price` | Stop-loss trigger price. Fires a reduce-only opposing market order when the mark price crosses it in the loss direction. |

You can set one, both, or neither. Both values are in the same **per-market tick units** as the parent order's `price` (check `tick_size` in `GET /v1/markets`).

::: tip One submission, three orders
You send ONE place-order call. The engine handles the rest:

1. The parent order goes into the book / matches immediately.
2. If/when the parent gets a fill, the TP and SL trigger orders are armed silently — they don't sit in the orderbook, they sit in the trigger trees.
3. When mark price crosses a trigger level, that side fires a reduce-only opposing market order against the position. The other side is auto-cancelled.
:::

## Prereqs

- Logged in ([Flow 2](./02-login)).
- Deposited enough to cover the parent order's margin reservation ([Flow 3](./03-deposit)).
- You know whether your parent order is Buy (long) or Sell (short) — TP/SL direction depends on it.

## Direction rules — get these right

If the parent fills will create a **LONG** position (Buy filled at entry price `E`):

- `tp_price` MUST be **above** `E` (you profit when price goes up).
- `sl_price` MUST be **below** `E` (you stop the loss when price goes down).

If the parent fills will create a **SHORT** position (Sell filled at entry `E`):

- `tp_price` MUST be **below** `E` (you profit when price goes down).
- `sl_price` MUST be **above** `E` (you stop the loss when price goes up).

The engine rejects placements that have the directions wrong (e.g. a Buy with `tp_price < entry`) with a clear error.

## Step 1 — place a Buy with TP/SL bracket

```python
# Using the signer from Flow 2:
body = {
    "trading_account_id": 1779526509,
    "market_id": 1,            # BTC-USD
    "side": "Buy",
    "type": "Limit",
    "time_in_force": "GTC",
    "price": 740000,           # entry — limit Buy
    "size": 10,
    "post_only": false,
    "reduce_only": false,
    "tp_price": 760000,        # +~2.7% from entry — closes the long
    "sl_price": 730000,        # -~1.3% from entry — caps the loss
}
code, resp = signed_request("POST", "/v1/orders", body)
print(f"HTTP {code}\n{resp}")
```

### What success looks like

```json
{
  "status": "accepted",
  "order_id": "79228162514264337593543950501",
  "market_id": 1,
  "filled_size": 0,
  "avg_fill_price": 0
}
```

The response shape is identical to a regular place. The TP/SL state isn't on the response — it lives in the trigger trees and surfaces via `/v1/account.positions[].conditional_orders` once the parent fills.

## Step 2 — verify the conditionals after the parent fills

After the parent gets filled (manually crossed by another order, or via IOC entry), query your account:

```python
code, body = signed_request("GET", "/v1/account?trading_account_id=1779526509")
```

Look for the new position's `conditional_orders`:

```json
{
  "positions": [
    {
      "market_id": 1,
      "size": 10,
      "average_entry_price": 740000,
      "is_long": true,
      "conditional_orders": [
        {
          "kind": "TakeProfit",
          "trigger_price": 760000,
          "size": 10
        },
        {
          "kind": "StopLoss",
          "trigger_price": 730000,
          "size": 10
        }
      ]
    }
  ]
}
```

If the array is empty, either the parent hasn't filled yet, OR the parent has already closed (TP/SL only exist while the position is open).

## Step 3 — what happens at trigger

When mark price crosses a trigger:

- The corresponding side fires a **reduce-only market order** sized to the current position (not necessarily the original `tp_price`/`sl_price` size — it follows position size as the position shrinks via other fills).
- The other side is **auto-cancelled** as the position closes.
- You see normal `Trade` events in `/v1/trades/history` for the trigger-fill.

## Aggressive entry + bracket (most common shape)

If you want to enter immediately at the market and bracket the entry, use a market order with `tp_price`/`sl_price`:

```python
body = {
    "trading_account_id": 1779526509,
    "market_id": 1,
    "side": "Buy",
    "type": "Market",
    "time_in_force": "IOC",
    "size": 10,
    "tp_price": 765000,
    "sl_price": 728000,
    # NO price field for market orders
}
```

The market order crosses immediately, the position opens, the bracket is armed in the same atomic commit.

## Modify or cancel a bracket

Currently brackets are **immutable after placement** — to change a TP or SL, close the position (or use `reduce_only` orders manually) and re-open with new values, OR cancel the parent before fill if it's still resting.

There's no `PATCH /v1/orders/:id/tp_price` endpoint.

## Common errors

| Status | Body | Meaning | Fix |
|---|---|---|---|
| `400` | `TpDirectionInvalid` | TP is on the wrong side of entry for the parent's direction | For Buy: `tp_price > price`. For Sell: `tp_price < price`. |
| `400` | `SlDirectionInvalid` | SL is on the wrong side of entry | For Buy: `sl_price < price`. For Sell: `sl_price > price`. |
| `400` | `TpSlOnNonReducingOrder` | You set TP/SL but the parent is `reduce_only` (which closes, not opens, a position) | Drop `tp_price`/`sl_price` for reduce-only orders. |
| `400` | `TooManyConditionalOrdersForAccount` | You already have 10 conditional orders on this `(account, market)` (engine limit) | Cancel some open positions or close out. |

## How brackets behave under partial fills

If your parent is a limit order that partially fills (e.g. size=10, only 7 fill before you cancel the rest):

- TP/SL trigger sizes track the **filled portion** (7), not the original 10.
- When triggered, the reduce-only market order is sized to the current position.

If you cancel the parent after a partial fill, the bracket on the filled-portion stays armed against the position. Cancelling the parent does NOT cancel the bracket — close the position to clear it.

## Where to go next

- → [View your orders](./05-view-orders) — `conditional_orders[]` on positions is where they show up.
- → [Place a regular order](./04-place-order) — the foundation this builds on.
