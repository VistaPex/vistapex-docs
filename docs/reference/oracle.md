# Oracle & pricing

VistaPex prices every market with its own off-chain oracle aggregator. It combines spot prices from five centralized exchanges and falls back to two independent oracle networks when those are not available.

The price it produces is the **mark price**. It drives margin checks, liquidations, unrealized PnL and funding.

## Price sources

Each market takes its price from the highest tier that is available at that moment:

| Tier | Source | Used when |
|---|---|---|
| 1 | **Weighted median of 5 exchanges**: Binance, OKX, Bybit, Coinbase, Kraken | At least 3 of the 5 venues are live and fresh |
| 2 | **[Pyth Network](https://pyth.network)** (Hermes price service) | Tier 1 has too few live venues, and the latest Pyth price is fresh |
| 3 | **[RedStone](https://redstone.finance)** (signed data packages) | Tiers 1 and 2 are unavailable, and the latest RedStone package is fresh and signed by the configured signers |

If no tier is fresh, the aggregator keeps the last price. The exchange then degrades the market and finally halts it, so it never keeps trading on a stale price.

Every price update records which tier produced it.

## How the exchange price is computed

1. **Collect.** Spot prices stream continuously from each venue for the market's pair, for example `BTCUSDT` on Binance and `BTC-USD` on Coinbase.
2. **Normalize to USD.** Binance, OKX and Bybit quote in USDT. Their prices are converted to USD with a USDT/USD rate, which is the median of Coinbase, Kraken and RedStone. All five inputs are then true USD prices, so a USDT depeg does not move the mark price.
3. **Blend.** The price is the **weighted median** of the live venues: the first value whose cumulative weight passes half the total. Venues currently carry equal weight. A median is robust to one venue printing a bad price, which an average is not.
4. **Publish.** All arithmetic is integer, in USD × 10⁸, so the same inputs always give the same price.

## Markets

| Market | Exchange venues | Fallbacks |
|---|---|---|
| BTC-PERP | Binance, OKX, Bybit, Coinbase, Kraken | Pyth, RedStone |

More markets will be listed here as they open.

## What the zero-knowledge proof covers

Each proven batch commits a hash of the oracle prices it used (`oraclePricesHash` in the `BatchProven` event; see [Proofs & custody](./proofs)). This fixes which prices a batch was settled at and makes it auditable afterwards. It does **not** prove those prices were correct: the proof takes the oracle prices as an input.
