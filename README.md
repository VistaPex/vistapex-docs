# VistaPex Trade Docs

User-friendly guide to the VistaPex perpetuals exchange — written as a **flow-by-flow walkthrough** of what a user does end-to-end.

Each page covers one task (mint test USDC, log in, deposit, place an order, view your orders, withdraw) and walks you through the exact REST calls and on-chain transactions needed. Copy-paste-able `curl` and `cast` commands.

## Local development

```bash
npm install
npm run dev    # serves at http://localhost:5173
```

## Production build

```bash
npm run build
# Output in docs/.vitepress/dist — deploy as a static site.
```

## Structure

```
docs/
├── index.md                  # landing page with the full task list
├── flows/                    # one page per user task, in order
│   ├── 01-mint-usdc.md       # get testnet USDC from the faucet
│   ├── 02-login.md           # log in via Privy → get a session
│   ├── 03-deposit.md         # send USDC to DepositPool, see balance credited
│   ├── 04-place-order.md     # place a limit / market order
│   ├── 05-view-orders.md     # check open orders + history
│   └── 06-withdraw.md        # request a withdrawal, settle on-chain
└── reference/
    ├── contracts.md          # deployed contract addresses + RPC URLs
    └── auth-signing.md       # HMAC request-signing reference
```
