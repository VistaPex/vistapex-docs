import { defineConfig } from 'vitepress'

// VistaPex Trade Docs — user-flow guide.
//
// Sidebar groups follow the natural user journey, top-to-bottom: get
// testnet USDC, log in, deposit, trade, withdraw. Each entry links to a
// single self-contained page with prereqs, numbered steps (curl / cast
// snippets the reader can paste), and a "what success looks like"
// callout at the end.

export default defineConfig({
  title: 'VistaPex',
  titleTemplate: ':title — VistaPex Docs',
  description: 'Flow-by-flow guide to the VistaPex perpetuals exchange — REST + on-chain.',
  cleanUrls: true,
  lastUpdated: true,

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/vistapex/vistapex_logo/icon.svg' }],
    ['link', { rel: 'apple-touch-icon', href: '/vistapex/vistapex_logo/icon.svg' }],
    ['meta', { name: 'theme-color', content: '#DDFF33' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: 'VistaPex Docs' }],
  ],

  themeConfig: {
    logo: {
      light: '/vistapex/vistapex_wordmark/black.svg',
      dark: '/vistapex/vistapex_wordmark/default.svg',
      alt: 'VistaPex',
    },
    // Wordmark already reads "VistaPex" — hide the redundant text next to it.
    siteTitle: false,

    nav: [
      { text: 'Home', link: '/' },
      { text: 'Flows', link: '/flows/01-mint-usdc' },
      { text: 'Reference', link: '/reference/contracts' },
      { text: 'Trade', link: 'https://www.vistapex.trade' },
    ],

    sidebar: [
      {
        text: 'Start here',
        items: [
          { text: 'Overview', link: '/' },
        ],
      },
      {
        text: 'User flows',
        collapsed: false,
        items: [
          { text: '1. Mint testnet USDC', link: '/flows/01-mint-usdc' },
          { text: '2. Log in', link: '/flows/02-login' },
          { text: '3. Deposit', link: '/flows/03-deposit' },
          { text: '4. Place an order', link: '/flows/04-place-order' },
          { text: '5. View your orders', link: '/flows/05-view-orders' },
          { text: '6. Withdraw', link: '/flows/06-withdraw' },
        ],
      },
      {
        text: 'Reference',
        collapsed: false,
        items: [
          { text: 'Contract addresses & RPCs', link: '/reference/contracts' },
          { text: 'Auth & request signing', link: '/reference/auth-signing' },
        ],
      },
    ],

    footer: {
      message: 'For developers building on testnet today. Mainnet contract addresses will be added at launch.',
      copyright: '© VistaPex',
    },

    search: {
      provider: 'local',
    },
  },
})
