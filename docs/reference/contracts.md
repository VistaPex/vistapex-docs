# Contract addresses & RPCs

## Mainnet

| Field | Value |
|---|---|
| Network | **Avalanche C-Chain** (chain id `43114`) |
| Public RPC | `https://api.avax.network/ext/bc/C/rpc` |
| Block explorer | <https://snowtrace.io> |

| Contract | Address | Role |
|---|---|---|
| **USDC** (Circle, native) | [`0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E`](https://snowtrace.io/address/0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E) | Collateral (6 decimals). |
| **DepositPool** | [`0x4D1bE1E2EdB9d6053d6054Ecf343d232B16f146F`](https://snowtrace.io/address/0x4D1bE1E2EdB9d6053d6054Ecf343d232B16f146F) | Holds deposited USDC; on-chain settlement target for withdrawals. |
| **PerpsStateVerifier** | [`0x29Ca68cbE61CA9378C5564e1c5041270e1A93c9B`](https://snowtrace.io/address/0x29Ca68cbE61CA9378C5564e1c5041270e1A93c9B) | Verifies batch proofs; stores the latest proven state root. See [Proofs & custody](./proofs). |

## Testnet

The `cast` examples below use the testnet.

### Network

| Field | Value |
|---|---|
| Network | **Avalanche Fuji** (chain id `43113`) |
| Public RPC | `https://api.avax-test.network/ext/bc/C/rpc` |
| Block explorer | <https://testnet.snowtrace.io> |
| Gas token | AVAX (Avalanche Fuji testnet AVAX) |

### Contracts

| Contract | Address | Role |
|---|---|---|
| **MintableUSDC** | [`0x77816fef2E06a1c054F9CbdA3bF82De5D30f8FDA`](https://testnet.snowtrace.io/address/0x77816fef2E06a1c054F9CbdA3bF82De5D30f8FDA) | Testnet ERC-20 USDC (6 decimals). Public `faucetMint` for 1k USDC/hour per address. |
| **DepositPool** | [`0x1cC2CD89cBBdE1d1C53C80fC38AA44cADF819779`](https://testnet.snowtrace.io/address/0x1cC2CD89cBBdE1d1C53C80fC38AA44cADF819779) | Holds deposited USDC; on-chain settlement target for withdrawals. |

### API endpoints

| Service | URL | Purpose |
|---|---|---|
| Gateway (REST + WS) | `https://gateway.testnet.vistapex.io` | All authenticated calls; public market data; WebSocket. |
| Privy app | `cmpghglar00is0cjxth9udi4n` | Auth provider — your frontend uses this `APP_ID`. |

## Quick reference — useful `cast` commands

```bash
RPC=https://api.avax-test.network/ext/bc/C/rpc

# === MintableUSDC ===
USDC=0x77816fef2E06a1c054F9CbdA3bF82De5D30f8FDA

# Mint 1k USDC to yourself (public, no admin needed; 1h cooldown per addr)
cast send $USDC "faucetMint(uint256)" 1000000000 --rpc-url $RPC --private-key $YOUR_KEY

# Check anyone's USDC balance
cast call $USDC "balanceOf(address)(uint256)" $ADDR --rpc-url $RPC

# Check the faucet's per-call cap and cooldown
cast call $USDC "faucetPerCallCap()(uint256)" --rpc-url $RPC
cast call $USDC "faucetCooldownSeconds()(uint256)" --rpc-url $RPC

# === DepositPool ===
POOL=0x1cC2CD89cBBdE1d1C53C80fC38AA44cADF819779

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
