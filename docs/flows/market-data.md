# Public market data

Read prices, market config, orderbook depth, recent trades, and candles. **No authentication required** for any of these endpoints — `curl` straight from a browser.

## What you're doing

Five public endpoints give you everything a price chart / market list / order entry form needs:

| Endpoint | What it returns |
|---|---|
| `GET /v1/markets` | List of all live markets + their config (tick_size, lot_size, leverage tiers, mark price). |
| `GET /v1/markets/:id/ticker` | Current snapshot for one market: mark, index, funding rate, 24h volume, etc. |
| `GET /v1/markets/:id/orderbook` | L2 depth (aggregated by price level). |
| `GET /v1/trades?market_id=:id` | Recent trades on a market (public, no counterparty). |
| `GET /v1/klines?market_id=:id&interval=...` | OHLCV candles for charting. |

All return JSON. All cacheable for ~1 s on the client (they refresh frequently server-side).

::: tip Public means rate-limited, not unlimited
There's a generous per-IP rate limit on public endpoints (typically several hundred req/min). For high-frequency reads (every 100ms tick), use the WebSocket equivalents instead — same data, push-driven, no per-request cost.
:::

## 1. List all markets — `GET /v1/markets`

The first call any market-list UI makes.

```bash
GATEWAY=https://gateway.testnet.vistapex.io
curl -sS "$GATEWAY/v1/markets" | jq '.markets[] | {market_id, name, mark_price, tick_size, lot_size, min_lots}'
```

### Response shape

```json
{
  "markets": [
    {
      "market_id": 1,
      "name": "BTC-USD",
      "min_lots": 10,
      "tick_size": 1,
      "lot_size": 1000,
      "leverage_tiers": [
        { "max_value": 10000000000, "max_leverage": 50 },
        { "max_value": 20000000000, "max_leverage": 40 }
      ],
      "max_oi_per_side": 300000,
      "max_price_deviation_bps": 500,
      "mode": "Active",
      "maintenance_margin_ratio": 2,
      "backstop_margin_ratio": 3,
      "oracle_precision": 1,
      "quote_unit_multiplier": 1
    },
    ...
  ]
}
```

| Field | Use it for |
|---|---|
| `market_id` | The numeric handle every other endpoint takes. |
| `name` | Display label (`BTC-USD`, `ETH-USD`, etc.). |
| `tick_size` | Minimum price increment. A `tick_size: 1` market accepts integer prices; `tick_size: 5` requires multiples of 5. |
| `lot_size` | Minimum size unit. Order sizes must be multiples of this. |
| `min_lots` | Minimum order size in lots. Smaller submissions are rejected. |
| `mode` | `Active` (trading enabled) / `PostOnly` / `Halted` / etc. |
| `max_price_deviation_bps` | How far from mark the engine accepts orders. `500` = 5%. Submit further and you get `PriceDeviationExceedsTolerance`. |
| `leverage_tiers[]` | Notional-tiered max leverage. Bigger positions get less leverage. |

### Use this to size your orders

Concrete BTC-USD example from above: `tick_size: 1, lot_size: 1000, min_lots: 10`. So a valid order is:

- `price`: any positive integer (matches `tick_size: 1`)
- `size`: any multiple of 10 ≥ 10 (matches `lot_size: 1000, min_lots: 10`)

For SOL-USD (`tick_size: 5, lot_size: 500000, min_lots: 10`): `price` must be a multiple of 5.

## 2. Single-market ticker — `GET /v1/markets/:id/ticker`

Snapshot: mark, index, funding rate, 24h volume. The one call a market detail page wants on render.

```bash
curl -sS "$GATEWAY/v1/markets/1/ticker" | jq .
```

### Response shape (illustrative)

```json
{
  "market_id": 1,
  "mark_price": 776812,
  "index_price": 776800,
  "funding_rate_bps": 12,
  "funding_index": 1234567890,
  "next_funding_at_ms": 1779604000000,
  "open_interest_long": 245000,
  "open_interest_short": 218000,
  "volume_24h": 9876543210,
  "trade_count_24h": 12345,
  "best_bid": 776700,
  "best_ask": 776850,
  "last_trade_price": 776800,
  "last_trade_ts_ms": 1779602400000
}
```

| Field | Meaning |
|---|---|
| `mark_price` | The reference price the engine uses for margin / liquidation / TP-SL triggers. Comes from the oracle feed. |
| `index_price` | The off-chain reference index (closely tracks mark). |
| `funding_rate_bps` | Current funding rate in basis points. Pays longs ↔ shorts every funding interval. |
| `next_funding_at_ms` | When the next funding settlement fires. |
| `open_interest_*` | Total notional open per side. |
| `best_bid` / `best_ask` | Top of book — gap is the spread. |

## 3. L2 orderbook depth — `GET /v1/markets/:id/orderbook`

Aggregated by price level. Order-by-order detail isn't exposed (no `priority_idx`, no `account_id`).

```bash
curl -sS "$GATEWAY/v1/markets/1/orderbook" | jq .
```

```json
{
  "market_id": 1,
  "bids": {
    "776700": 35,
    "776500": 80,
    "776200": 150,
    "775000": 1200
  },
  "asks": {
    "776850": 25,
    "777000": 60,
    "777500": 180,
    "778000": 400
  }
}
```

Each entry is `"price": total_lots_at_that_level`. `bids` are descending by price (best first); `asks` ascending. Lots are scaled by the market's `lot_size` — multiply through to get the actual base-unit size.

::: tip Use the WebSocket for live depth
The REST endpoint snapshots the book at request time. For a live order entry UI use the `orderbook` channel on `wss://gateway.testnet.vistapex.io/v1/ws` — pushes deltas on every level touch.
:::

## 4. Recent market trades — `GET /v1/trades`

The public tape: every fill that's happened on a market, newest first. Counterparty ids are NOT exposed.

```bash
curl -sS "$GATEWAY/v1/trades?market_id=1&limit=20" | jq .
```

```json
{
  "trades": [
    {
      "global_seq": 1483420,
      "market_id": 1,
      "price": 776812,
      "size": 30,
      "maker_is_buy": true,
      "timestamp_ms": 1779603100000
    },
    ...
  ],
  "next_cursor": 1480000
}
```

| Field | Meaning |
|---|---|
| `maker_is_buy` | Was the maker side a buy (true) or sell (false)? This is the public-facing "direction" of the trade. |
| `next_cursor` | Pass as `?before=<value>` on the next call to paginate backwards. |

| Query param | Values |
|---|---|
| `market_id` | Required. The market to filter to. |
| `limit` | 1..200 (default 50). |
| `before` | Cursor for pagination (`global_seq < before`). |

## 5. Klines / candles — `GET /v1/klines`

OHLCV bars for charting.

```bash
curl -sS "$GATEWAY/v1/klines?market_id=1&interval=1m&limit=100" | jq '.klines | length'
# 100
```

| Query param | Values |
|---|---|
| `market_id` | Required. |
| `interval` | `1m`, `5m`, `15m`, `1h`, `4h`, `1d`. |
| `limit` | 1..1000 (default 100). |
| `start_ms` / `end_ms` | Optional unix-ms range filter. |

### Response shape

```json
{
  "klines": [
    {
      "open_ts_ms": 1779602400000,
      "open": 776500,
      "high": 776950,
      "low": 776400,
      "close": 776812,
      "volume": 245000,
      "trade_count": 18
    },
    ...
  ]
}
```

Klines are server-built from completed trades — they don't include open-order data.

## Tying it together — a typical "market overview" UI

Most market-detail pages need:

1. **On load:** `GET /v1/markets` (cache) → find this market's `tick_size` / `lot_size` / `min_lots` / `leverage_tiers`.
2. **On load:** `GET /v1/markets/:id/ticker` → mark price, funding rate, 24h volume header.
3. **On load:** `GET /v1/klines?market_id=:id&interval=1m&limit=100` → initial chart data.
4. **Live:** subscribe to the `ticker`, `orderbook`, `trades` WS channels for push updates.

That's three REST calls on render, then push-only after.

## Decimal scaling reminder

Prices and quantities in every response are integers in **per-market tick / lot units**. To display:

- Display price = `wire_price * tick_size / oracle_precision_factor`
- Display size = `wire_size * lot_size / 10^underlying_decimals`

The exact display formula depends on the market's `oracle_precision` and `quote_unit_multiplier` — see [`reference/contracts.md`](../reference/contracts) for the USDC decimal cheat sheet.
