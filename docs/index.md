---
layout: home

hero:
  name: VistaPex
  text: The start of a new dawn in perps trading.
  tagline: Mint test USDC, log in, deposit, trade, withdraw. REST + on-chain, end-to-end.
  image:
    src: /vistapex/vistapex_logo/default.svg
    alt: VistaPex
  actions:
    - theme: brand
      text: Start with mint
      link: /flows/01-mint-usdc
    - theme: alt
      text: API reference
      link: /reference/contracts

features:
  - icon: 💧
    title: 1. Mint testnet USDC
    details: Get 1,000 testnet USDC from the public faucet. One on-chain call. Required before you can deposit.
    link: /flows/01-mint-usdc
    linkText: How to mint →

  - icon: 🔑
    title: 2. Log in
    details: Sign in via Privy embedded wallet and exchange your JWT for a per-session API key + secret.
    link: /flows/02-login
    linkText: How to log in →

  - icon: 📥
    title: 3. Deposit
    details: Approve the DepositPool, send USDC, watch your `cross_balance` update.
    link: /flows/03-deposit
    linkText: How to deposit →

  - icon: 📈
    title: 4. Place an order
    details: Submit a limit or market order. Signed HMAC request. See what the wire format looks like.
    link: /flows/04-place-order
    linkText: How to place →

  - icon: 📋
    title: 5. View your orders
    details: Live open orders, full history (with rejections), positions, balance — every read you need.
    link: /flows/05-view-orders
    linkText: How to view →

  - icon: 📤
    title: 6. Withdraw
    details: Request a withdrawal off the engine; the settler pays you out on-chain in ~6 s.
    link: /flows/06-withdraw
    linkText: How to withdraw →
---

## What this guide is

A **task-oriented walkthrough**, not a reference manual. Every page is one user task with:

1. **Prereqs** — what you need before you start.
2. **Numbered steps** — copy-paste-able `curl` / `cast` commands.
3. **What success looks like** — exact response shape so you know it worked.
4. **Common errors** — what each rejection message means and how to fix it.

Read in order the first time; jump straight to a task once you're set up.

## Beyond the basics

Once the 6 core flows above are working, two extras worth a look:

- [**Conditional orders (TP/SL)**](/flows/conditional-orders) — attach a take-profit and a stop-loss to any place in one call. The engine arms them on fill, fires them on price-cross, cancels the leftover.
- [**Public market data**](/flows/market-data) — five no-auth endpoints for prices, orderbook depth, recent trades, and candles. Everything a market detail page needs.

## Account & identity

For backend services, security audits, and multi-account setups:

- [**Refresh & revoke sessions**](/flows/sessions) — extend a session, list active ones across devices, kill a compromised one (or all of them).
- [**Long-lived API keys**](/flows/api-keys) — mint scoped credentials for bots and analytics services. Restrict by permission, market, and order size.
- [**Manage your profile**](/flows/profile) — read your identity bundle, bind a wallet, set a default trading account.

## Reference pages

- [Auth & request signing](/reference/auth-signing) — the HMAC scheme every signed call uses.
- [Contract addresses & RPCs](/reference/contracts) — current testnet `DepositPool` + `MintableUSDC` addresses.
- [Error code catalog](/reference/error-codes) — every numeric `code` you might see, with what triggers it and how to fix.
