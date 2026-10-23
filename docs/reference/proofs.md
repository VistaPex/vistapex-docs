# Proofs & custody

VistaPex matches orders off-chain, keeps balances in its own engine, and holds deposited USDC in one pool contract on Avalanche C-Chain. A zero-knowledge proof posted on-chain shows that balances follow from the exchange's published rules.

## Contracts (Avalanche C-Chain, chain id `43114`)

| Contract | Address | Role |
|---|---|---|
| **DepositPool** | [`0x4D1bE1E2EdB9d6053d6054Ecf343d232B16f146F`](https://snowtrace.io/address/0x4D1bE1E2EdB9d6053d6054Ecf343d232B16f146F) | Holds every trader's deposited USDC; pays out withdrawals. |
| **PerpsStateVerifier** | [`0x29Ca68cbE61CA9378C5564e1c5041270e1A93c9B`](https://snowtrace.io/address/0x29Ca68cbE61CA9378C5564e1c5041270e1A93c9B) | Verifies each batch proof and stores the latest proven state root. |
| **USDC** (Circle, native) | [`0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E`](https://snowtrace.io/address/0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E) | The only collateral asset (6 decimals). |

## Total value locked

TVL is the USDC held by the DepositPool:

```bash
RPC=https://api.avax.network/ext/bc/C/rpc
cast call 0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E "balanceOf(address)(uint256)" \
  0x4D1bE1E2EdB9d6053d6054Ecf343d232B16f146F --rpc-url $RPC
# 6 decimals: 35508229 = 35.508229 USDC
```

`poolBalance()` on the DepositPool returns the same figure.

## Events

| Contract | Event | topic0 |
|---|---|---|
| DepositPool | `Deposit(uint64 indexed tradingAccountId, address indexed depositor, uint256 amount)` | `0x88ab94ac53260736800da5d05843e504231e9d57ea5cc4ce6479495a52fa296d` |
| DepositPool | `Withdrawal(uint256 indexed withdrawalId, address indexed to, uint256 amount, uint256 nonce)` | `0x13d23b66b80073e6fb9522c31eac92141f2ba60d122edde49609d5cb9383aae2` |
| PerpsStateVerifier | `BatchProven(uint256 indexed batchId, bytes32 preRoot, bytes32 postRoot, uint32 eventCount, bytes32 oraclePricesHash, bytes32 eventsHash, bytes32 marketConfigsHash)` | `0xdc973c5e7af869eecd1da24a100fe6c60971adc5fec83492ed41cccb8234ecb4` |

## What a proof shows

The exchange groups its activity into batches: deposits, withdrawals, trades, funding and liquidations. For each batch, an [SP1](https://docs.succinct.xyz) zero-knowledge program replays the batch's events against the previous state and proves that the new state root is the result. The verifier contract checks the proof and records the new root:

```bash
cast call 0x29Ca68cbE61CA9378C5564e1c5041270e1A93c9B "getProvenState()(bytes32,uint256)" --rpc-url $RPC
# latest proven state root, latest proven batch id
```

Each `BatchProven` event commits:

| Field | Commits to |
|---|---|
| `preRoot`, `postRoot` | The account state (every balance and position) before and after the batch. |
| `eventsHash` | The exact sequence of events the batch applied. |
| `oraclePricesHash` | The oracle prices the batch was settled at ([Oracle & pricing](./oracle)). |
| `marketConfigsHash` | Each market's rules for the batch: tick size, leverage tiers, fee schedule. |

Proofs are generated after the fact and never block trading.

**What it does not show.** The proof checks the arithmetic, not the inputs. It does not check that a trader authorized a given trade or withdrawal, and it takes oracle prices and funding rates as given; the hashes above make those inputs fixed and auditable, not correct. The pool contract does not read the proof.

## Custody

**The exchange holds custody. There is no forced withdrawal.**

- All deposited USDC sits together in the DepositPool. A trader's balance is a record in the exchange's engine, not a separate on-chain account.
- A withdrawal needs two exchange-held keys: one authorizes it, the other submits it. The contract has no function a trader can call to take funds out.
- If the exchange stops processing withdrawals, funds stay in the pool until withdrawals resume.
- The owner, or either withdrawal key, can pause deposits and withdrawals together. Only the owner can resume them.
- The engine and the pool contract both cap withdrawals; the exchange can change these limits.
