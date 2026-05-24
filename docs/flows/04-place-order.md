# 4. Place an order

Submit a limit or market order to the engine. Signed HMAC request, response is immediate.

## What you're doing

`POST /v1/orders` is the single entry point for all order types. The body shape is the same; the `type` + `time_in_force` + `price` fields determine what happens:

| Goal | `type` | `time_in_force` | `price` | What happens |
|---|---|---|---|---|
| Resting limit (will sit on the book) | `Limit` | `GTC` | required | Rests in the book at your price. Filled when someone crosses it. |
| Aggressive limit (fill or kill) | `Limit` | `IOC` or `FOK` | required | Tries to fill immediately at your price or better. `IOC` cancels the unfilled remainder; `FOK` cancels the whole order if it can't fully fill. |
| Market buy/sell | `Market` | `IOC` | omit | Crosses the book at any price. |
| Maker-only (won't cross) | `Limit` | `GTC` | required | + `post_only: true` — rejected if it would cross. |

## Prereqs

- Logged in ([Flow 2](./02-login)) with non-expired session creds.
- Deposited ([Flow 3](./03-deposit)) — your `cross_balance` must cover the order's margin reservation.
- You know which market you want to trade. Get the list with `curl https://gateway.testnet.vistapex.io/v1/markets | jq '.markets[] | {market_id, name, min_lots, tick_size, lot_size}'`.

## Step 1 — place a resting limit Buy

The most common order shape. This sits on the book until either someone crosses it or you cancel.

```python
# Using the signer from Flow 2:
body = {
    "trading_account_id": 1779526509,
    "market_id": 1,           # BTC-USD
    "side": "Buy",
    "type": "Limit",
    "time_in_force": "GTC",
    "price": 740000,          # in per-market tick units; see /v1/markets[i].tick_size
    "size": 10,               # in lots; see /v1/markets[i].lot_size
    "post_only": false,
    "reduce_only": false,
}
code, resp = signed_request("POST", "/v1/orders", body)
print(f"HTTP {code}\n{resp}")
```

## What success looks like

```json
{
  "status": "accepted",
  "order_id": "79228162514264337593543950347",
  "market_id": 1,
  "filled_size": 0,
  "avg_fill_price": 0
}
```

| Field | Meaning |
|---|---|
| `status` | `"accepted"` = the order was placed (resting or matched). |
| `order_id` | Globally unique id. Use it to cancel later. **It's a string in JSON** (the id is a 128-bit number that doesn't fit JavaScript's `Number`). |
| `filled_size` | Matched immediately (only > 0 for IOC/FOK/Market or self-crossing limits). |
| `avg_fill_price` | VWAP of the immediate match. `0` if no immediate fills. |

## Step 2 — handle the response

A successful HTTP 200 doesn't always mean "resting on the book":

- `filled_size == 0` AND `status == "accepted"` → order is resting; wait for a fill via WS or `/v1/orders/history`.
- `filled_size == size` AND `status == "accepted"` → fully matched on entry; the order_id is the matched fill record.
- `filled_size < size` AND `time_in_force == "GTC"` AND `status == "accepted"` → partially filled, remainder is resting.

## Common errors

| Status | Body | Meaning | Fix |
|---|---|---|---|
| `400` | `PriceDeviationExceedsTolerance` | Your price is too far from the mark (default 5%) | Quote a price within `mark ± 5%`. Check `/v1/markets/{id}/ticker` for the current mark. |
| `400` | `PostOnlyCross` | `post_only=true` but the order would have crossed | Drop `post_only` if you want it to match; otherwise quote further from the spread. |
| `400` | `FOK_NotFillable` | FOK couldn't fully fill at your price | Lower the size, or use `IOC` to take whatever's available. |
| `400` | `InsufficientBalance` | `cross_balance - pending_margin < required_margin` | Deposit more, cancel some open orders, or reduce size. |
| `400` | `ReduceOnlyAutoCancel` | `reduce_only=true` but you have no position to reduce | Drop `reduce_only`. |
| `400` | `MinLots` / `SizeNotMultipleOfLot` | Size below `min_lots` or not a multiple of `lot_size` | Check `/v1/markets`. |

::: tip Rejection rows are informative
Rejected orders are stored in `/v1/orders/history` with the **real** submitted shape (price, size, side, type, tif). Render them like `"Your Sell @ 500000 size 25 was rejected: PriceDeviationExceedsTolerance"` — actionable for the user.
:::

## Cancel an open order

```python
order_id = "79228162514264337593543950347"
code, resp = signed_request(
    "DELETE",
    f"/v1/orders/{order_id}?trading_account_id=1779526509&market_id=1",
)
```

Returns `{"status":"accepted","order_id":"...","market_id":1}` on success.

## Bulk reprice — `cancel-and-place`

`POST /v1/orders/cancel-and-place` is atomic: all cancels run first, then all places. If any step fails the whole batch is rejected and engine state is unchanged.

```python
body = {
    "trading_account_id": 1779526509,
    "market_id": 1,
    "cancels": ["79228162514264337593543950347"],
    "new_orders": [
        {"side": "Buy", "type": "Limit", "time_in_force": "GTC", "price": 745000, "size": 10},
    ],
}
signed_request("POST", "/v1/orders/cancel-and-place", body)
```

## Next

→ [View your orders](./05-view-orders)
