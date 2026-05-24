# 1. Mint testnet USDC

Get 1,000 test USDC from the public faucet. You need this before you can deposit and trade.

## What you're doing

The testnet uses a custom ERC-20 called `MintableUSDC` (NOT Circle USDC). It has a public `faucetMint` function anyone can call:

- 1,000 USDC max per call
- 1 hour cooldown per address
- 6 decimals (same as real USDC)

## Prereqs

- Any wallet with some Arbitrum-Sepolia ETH for gas (~0.001 ETH is plenty).
- The `cast` CLI from [Foundry](https://book.getfoundry.sh/getting-started/installation), or any tool that can send a transaction (ethers.js, viem, MetaMask, etc.).

If you don't have Arbitrum-Sepolia ETH, get some from an Arbitrum faucet first:
- <https://faucet.quicknode.com/arbitrum/sepolia>
- <https://www.alchemy.com/faucets/arbitrum-sepolia>

## Step 1 — call `faucetMint`

```bash
USDC=0xd99b55120F9ebcc38058b23E8Eb38C56A470f2cD
RPC=https://sepolia-rollup.arbitrum.io/rpc

cast send $USDC "faucetMint(uint256)" 1000000000 \
  --rpc-url $RPC \
  --private-key $YOUR_PRIVATE_KEY
```

| Field | Value | Why |
|---|---|---|
| Function | `faucetMint(uint256)` | Public, no admin needed |
| Amount | `1000000000` | 1,000 USDC × 10⁶ (6 decimals) |

## Step 2 — verify your balance

```bash
USDC=0xd99b55120F9ebcc38058b23E8Eb38C56A470f2cD
RPC=https://sepolia-rollup.arbitrum.io/rpc
YOUR_ADDR=0xYourAddressHere

cast call $USDC "balanceOf(address)(uint256)" $YOUR_ADDR --rpc-url $RPC
```

## What success looks like

The `cast send` prints a transaction receipt:

```
status               1 (success)
transactionHash      0xabc...
to                   0xd99b55120F9ebcc38058b23E8Eb38C56A470f2cD
```

The `balanceOf` call returns `1000000000` (= 1,000 USDC).

## Common errors

| Error | Meaning | Fix |
|---|---|---|
| `MintableUSDC: amount exceeds faucet cap` | You asked for more than 1,000 USDC in one call | Split into multiple calls, but the cooldown still applies |
| `MintableUSDC: faucet cooldown active` | You minted from this address within the last 1 hour | Wait, or use a fresh address |
| `MintableUSDC: faucet disabled` | Admin temporarily disabled the faucet | Ask in the GitHub discussions |

## Need more than 1,000?

The default cap is 1,000 per call with a 1-hour cooldown — that's enough for ~24,000/day per address. If you need more for an automated test rig, open a GitHub issue and request an admin `mint(to, amount)` (uncapped, owner-only).

## Next

→ [Log in](./02-login)
