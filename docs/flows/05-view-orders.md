# 5. View your orders

Inspect your account, open orders, history, positions, and fills.

## What you're doing

There are two surfaces for orders:

| Surface | Source | When to use |
|---|---|---|
| `GET /v1/account` | Live engine in-memory state | "What do I have RIGHT NOW?" — current positions, open orders, balance. |
| `GET /v1/orders/history` | Postgres projection (read-api) | "Show me my past orders" — full lifecycle including filled, cancelled, rejected. |

Both are signed requests; both are scoped to the auth-bound trading account.

## Prereqs

- Logged in ([Flow 2](./02-login)) with a non-expired session.

## A. Live state — `GET /v1/account`

The most useful "what's my state" call. Returns everything in one shot:

```python
code, body = signed_request("GET", "/v1/account?trading_account_id=1779526509")
```

### What success looks like

```json
{
  "trading_account_id": 1779526509,
  "cross_balance": 5989560,
  "reserved_withdrawals": 0,
  "isolated_balances": {},
  "positions": [
    {
      "market_id": 1,
      "size": 0,
      "average_entry_price": 0,
      "is_long": true,
      "leverage": 50,
      "is_isolated": false,
      "realized_pnl": 0
    }
  ],
  "open_orders": [
    {
      "order_id": "79228162514264337593543950347",
      "market_id": 1,
      "side": "Buy",
      "price": 740000,
      "size": 10,
      "remaining_size": 10,
      "time_in_force": "GTC",
      "is_post_only": true,
      "is_reduce_only": false,
      "placed_at_ms": 1779554537518
    }
  ],
  "fee_tier": 0,
  "volume_30d": 29836100,
  "is_frozen": false
}
```

### Fields you'll care about

| Field | Meaning |
|---|---|
| `cross_balance` | Cross-margin USDC available (in 6-decimal units). |
| `reserved_withdrawals` | Frozen for in-flight withdrawal intents. Subtract from `cross_balance` to see "available to trade." |
| `positions[]` | One entry per market you've ever traded. `size: 0` means flat. |
| `open_orders[]` | Live resting orders. `remaining_size` = unfilled portion. |
| `volume_30d` | Rolling 30-day notional volume (for fee tier promotion). |
| `is_frozen` | If `true`, you can't place orders (admin action — contact support). |

## B. Order history — `GET /v1/orders/history`

Full lifecycle including past rejections. Paginated cursor-style.

```python
# Most recent 50 orders for this account
code, body = signed_request(
    "GET",
    "/v1/orders/history?trading_account_id=1779526509&limit=50",
)
```

### Filters

| Query param | Values |
|---|---|
| `market_id` | Narrow to a single market. |
| `status` | `open` \| `partially_filled` \| `filled` \| `cancelled` \| `rejected`. **Default: all statuses including rejected.** |
| `limit` | 1..200 (default 50). |
| `before` | Cursor — return rows with `global_seq < before`. |

### What success looks like

```json
{
  "orders": [
    {
      "global_seq": 1482862,
      "order_id": "79228162514264337593543950439",
      "market_id": 1,
      "side": 1,
      "price": 500000,
      "size": 25,
      "is_post_only": false,
      "is_reduce_only": false,
      "status": "rejected",
      "cancel_reason": "PriceDeviationExceedsTolerance",
      "placed_at": 1779598900000,
      "closed_at": 1779598900000,
      "order_type": "limit",
      "time_in_force": "gtc",
      "filled_size": 0
    },
    {
      "global_seq": 41680,
      "order_id": "79228162514264337593543950343",
      "market_id": 1,
      "side": 0,
      "price": 747394,
      "size": 10,
      "is_post_only": false,
      "is_reduce_only": false,
      "status": "filled",
      "cancel_reason": null,
      "placed_at": 1779531800000,
      "closed_at": 1779531870000,
      "order_type": "limit",
      "time_in_force": "gtc",
      "filled_size": 10
    }
  ],
  "next_cursor": 41680
}
```

### Reading rejected rows

Rejected orders carry the **original submitted shape**: `side`, `price`, `size`, `order_type`, `time_in_force` are the values you sent. Render them like "Sell @ price 500000 size 25 rejected: PriceDeviationExceedsTolerance" — actionable for whoever's debugging.

**Exception:** rows where `order_type == "unknown"` are cancel-path rejections (e.g. an attempt to cancel an unknown order id) where the engine had no submitted shape to capture. Render those as "Details unavailable" — the wire shape was never set.

| `order_type` | Meaning |
|---|---|
| `"limit"` or `"market"` | Real values from the submission — show them. |
| `"unknown"` | Placeholder; the original submission shape is unavailable. Render generically. |

### Status field — read both `status` and `filled_size`

The order lifecycle is:

```
open → partially_filled → filled
   ↘                    ↗
     cancelled (any time)
```

Plus terminal `rejected` for orders that never made it onto the book.

A `partially_filled` row has `filled_size > 0` and `filled_size < size`. A `filled` row has `filled_size == size`.

## C. Trade history — `GET /v1/trades/history`

Your fills, account-scoped. Counterparty `account_id` is **not** exposed (privacy):

```python
code, body = signed_request(
    "GET",
    "/v1/trades/history?trading_account_id=1779526509&limit=50",
)
```

Returns:

```json
{
  "trades": [
    {
      "global_seq": 41679,
      "market_id": 1,
      "price": 747394,
      "size": 10,
      "side": "maker",
      "is_buy": false,
      "fee": 5219,
      "timestamp": 1779531870000
    }
  ],
  "next_cursor": null
}
```

| Field | Meaning |
|---|---|
| `side` | `"maker"` or `"taker"` — your role in this fill. |
| `is_buy` | Whether YOU bought (true) or sold (false), regardless of side. |
| `fee` | Your fee on this fill (maker_fee if maker, taker_fee if taker). |

## D. Public market data — no auth needed

```bash
# All markets + their config
curl https://gateway.testnet.vistapex.io/v1/markets | jq .

# L2 orderbook (price-level depth, public)
curl https://gateway.testnet.vistapex.io/v1/markets/1/orderbook | jq .

# Recent trades on a market (no account context)
curl 'https://gateway.testnet.vistapex.io/v1/trades?market_id=1&limit=20' | jq .

# Klines (candles) for a market
curl 'https://gateway.testnet.vistapex.io/v1/klines?market_id=1&interval=1m&limit=100' | jq .
```

## E. Real-time updates — WebSocket

For live order/fill/position updates without polling:

```
wss://gateway.testnet.vistapex.io/v1/ws
```

After connecting, authenticate (same HMAC scheme as REST, send an `auth` frame), then subscribe to channels: `fills`, `positions`, `orderbook`, `trades`, etc.

## Next

→ [Withdraw](./06-withdraw)
