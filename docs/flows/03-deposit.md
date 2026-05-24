# 3. Deposit

Send USDC to the `DepositPool` and watch your trading-account `cross_balance` credit in seconds.

## What you're doing

Deposit is a **two-step on-chain dance**:

1. **`approve`** the `DepositPool` to spend your USDC.
2. **`deposit(trading_account_id, amount)`** transfers from your wallet into the pool and emits a `Deposited` event.

The S2 `chain-watcher` service sees the `Deposited` event and emits a `DepositCredited` WAL event onto the engine. Once that lands, your `cross_balance` on the exchange goes up.

End-to-end takes **~6 seconds** (1-2 blocks of L2 confirmation + WAL pipeline).

## Prereqs

- You've already minted ([Flow 1](./01-mint-usdc)) so you have testnet USDC.
- You've logged in ([Flow 2](./02-login)) so you have your `trading_account_id`.
- The **same wallet you used to mint** also signs the approve + deposit. The wallet's funds are what's being deposited.

::: tip Wallet vs trading account
Your **wallet** (an Ethereum address you control) holds the on-chain USDC. Your **trading account** is the exchange's representation of you, identified by `trading_account_id` (a number).

`deposit(trading_account_id, amount)` is the bridge: USDC leaves your wallet, the engine credits the trading account.

You can deposit *to* any trading_account_id, but you can only *withdraw from* an account you have a signed session for.
:::

## Step 1 — approve

```bash
USDC=0xd99b55120F9ebcc38058b23E8Eb38C56A470f2cD
POOL=0xe144d2A3DE21bc48991bDEB4ade6DdE6901bcDC6
RPC=https://sepolia-rollup.arbitrum.io/rpc

# Approve 100 USDC for deposit (one-time, or do MAX_UINT256 to skip future approvals).
cast send $USDC "approve(address,uint256)" $POOL 100000000 \
  --rpc-url $RPC \
  --private-key $YOUR_PRIVATE_KEY
```

| Arg | Value | Why |
|---|---|---|
| spender | `$POOL` | The `DepositPool` contract |
| amount | `100000000` | 100 USDC × 10⁶. Use `cast max-uint` for unlimited. |

## Step 2 — deposit

```bash
TA_ID=1779526509  # your trading_account_id from /v1/auth/login

cast send $POOL "deposit(uint64,uint256)" $TA_ID 100000000 \
  --rpc-url $RPC \
  --private-key $YOUR_PRIVATE_KEY
```

| Arg | Value |
|---|---|
| `trading_account_id` | The number you got from login |
| `amount` | 100 USDC × 10⁶ (must match or be ≤ the approved amount) |

## Step 3 — confirm credit on the exchange

After ~6 seconds, query your account state:

```bash
# Using the Python signer from Flow 2:
code, body = signed_request("GET", f"/v1/account?trading_account_id={TA_ID}")
```

You're looking for `cross_balance` to reflect the new deposit.

## What success looks like

```json
{
  "trading_account_id": 1779526509,
  "cross_balance": 100000000,
  "reserved_withdrawals": 0,
  "positions": [],
  "open_orders": [],
  "fee_tier": 0,
  "volume_30d": 0,
  "is_frozen": false
}
```

`cross_balance` is in the same 6-decimal unit (100,000,000 = 100 USDC).

## Common errors

### On-chain

| Error | Meaning | Fix |
|---|---|---|
| `ERC20: insufficient allowance` | Approve step skipped or amount too low | Re-run step 1 with the deposit amount |
| `ERC20: transfer amount exceeds balance` | Your wallet doesn't have enough USDC | Mint more ([Flow 1](./01-mint-usdc)) |
| `DepositPool: deposit paused` | Admin paused deposits | Wait for re-enable |

### Engine

| Symptom | Meaning |
|---|---|
| Deposit succeeds on-chain but `cross_balance` doesn't update | Wait 10-30 s — chain-watcher is processing. If still not credited after 1 min, check `https://gateway.testnet.vistapex.io/v1/deposits/history` for your deposit's projection. |
| `cross_balance` shows the prior value forever | The `trading_account_id` you deposited to doesn't exist in the engine (typo); contact support — funds are recoverable. |

## Next

→ [Place an order](./04-place-order)
