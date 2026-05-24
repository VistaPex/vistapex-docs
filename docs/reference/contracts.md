# Contract addresses & RPCs

Current testnet deployment. Mainnet addresses will be added at launch.

## Network

| Field | Value |
|---|---|
| Network | **Arbitrum Sepolia** (chain id `421614`) |
| Public RPC | `https://sepolia-rollup.arbitrum.io/rpc` |
| Block explorer | <https://sepolia.arbiscan.io> |
| Gas token | ETH (Arbitrum-Sepolia testnet ETH) |

## Contracts

| Contract | Address | Role |
|---|---|---|
| **MintableUSDC** | [`0xd99b55120F9ebcc38058b23E8Eb38C56A470f2cD`](https://sepolia.arbiscan.io/address/0xd99b55120F9ebcc38058b23E8Eb38C56A470f2cD) | Testnet ERC-20 USDC (6 decimals). Public `faucetMint` for 1k USDC/hour per address. |
| **DepositPool** | [`0xe144d2A3DE21bc48991bDEB4ade6DdE6901bcDC6`](https://sepolia.arbiscan.io/address/0xe144d2A3DE21bc48991bDEB4ade6DdE6901bcDC6) | Holds deposited USDC; on-chain settlement target for withdrawals. |

## API endpoints

| Service | URL | Purpose |
|---|---|---|
| Gateway (REST + WS) | `https://gateway.testnet.vistapex.io` | All authenticated calls; public market data; WebSocket. |
| Privy app | `cmpghglar00is0cjxth9udi4n` | Auth provider — your frontend uses this `APP_ID`. |

## Quick reference — useful `cast` commands

```bash
RPC=https://sepolia-rollup.arbitrum.io/rpc

# === MintableUSDC ===
USDC=0xd99b55120F9ebcc38058b23E8Eb38C56A470f2cD

# Mint 1k USDC to yourself (public, no admin needed; 1h cooldown per addr)
cast send $USDC "faucetMint(uint256)" 1000000000 --rpc-url $RPC --private-key $YOUR_KEY

# Check anyone's USDC balance
cast call $USDC "balanceOf(address)(uint256)" $ADDR --rpc-url $RPC

# Check the faucet's per-call cap and cooldown
cast call $USDC "faucetPerCallCap()(uint256)" --rpc-url $RPC
cast call $USDC "faucetCooldownSeconds()(uint256)" --rpc-url $RPC

# === DepositPool ===
POOL=0xe144d2A3DE21bc48991bDEB4ade6DdE6901bcDC6

# Approve the pool to spend USDC (one-time per (token, spender) per amount)
cast send $USDC "approve(address,uint256)" $POOL 100000000 --rpc-url $RPC --private-key $YOUR_KEY

# Deposit 100 USDC to trading_account 1779526509
cast send $POOL "deposit(uint64,uint256)" 1779526509 100000000 --rpc-url $RPC --private-key $YOUR_KEY

# Check pool's total USDC holdings
cast call $POOL "poolBalance()(uint256)" --rpc-url $RPC

# Check if a withdrawal id has been settled on-chain
cast call $POOL "isWithdrawalSettled(uint256)(bool)" 1779526510 --rpc-url $RPC

# Read the current operator (the address authorized to settle withdrawals)
cast call $POOL "operator()(address)" --rpc-url $RPC
```

## Decimal scaling cheat sheet

USDC has 6 decimals. The engine stores all amounts as integers in this 6-decimal unit:

| Display | Wire value |
|---|---|
| 1 USDC | `1000000` |
| 10 USDC | `10000000` |
| 100 USDC | `100000000` |
| 1,000 USDC | `1000000000` |
| 10,000 USDC | `10000000000` |

Prices on the engine are in **per-market tick units** — see each market's `tick_size` and `lot_size` from `GET /v1/markets`.
