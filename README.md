# @crossly/embed

Your Crossly listings, on your own website. Two custom elements, no build step.

> **Not on npm yet.** Unreleased — the install below will 404 until the first
> publish. The hosted script at `https://crossly.net/embed.js` is the intended
> way to use this anyway.

```html
<script src="https://crossly.net/embed.js" async></script>

<crossly-catalog pk="crossly_pk_live_…"></crossly-catalog>
```

That's the whole integration. Paste it into Squarespace, Wix, WordPress, Webflow, Shopify, a Notion embed, or a hand-written `index.html`.

## Why custom elements

Because the people who need this are on eight different site builders and most of them can't run a build step. A custom element is the only thing that works in plain HTML *and* React *and* Vue *and* Svelte without a wrapper per ecosystem — they all speak HTML.

```jsx
// React — it's just an element
<crossly-catalog pk={process.env.NEXT_PUBLIC_CROSSLY_PK} limit="24" />
```

## Elements

### `<crossly-catalog>`

| attribute | |
|---|---|
| `pk` | **required.** Your publishable key |
| `limit` | how many to show (1–48, default 12) |
| `q` | free-text filter over title and brand |
| `api` | override the API base; for testing |

### `<crossly-buy-button>`

| attribute | |
|---|---|
| `pk` | **required.** Your publishable key |
| `listing` | **required.** The listing id |
| `quantity` | default 1 |
| `label` | button text, default "Buy now" |
| `target` | `_self` (default) or `_blank` |

## The key is meant to be public

`crossly_pk_…` is designed to sit in page source. It can read **your own active listings** and **start a checkout**. That's the entire authority — there is no code path from a publishable key to an order, a buyer's address, your cost basis, your margins, your inventory counts, or anyone else's shop.

That's why it isn't a Personal Access Token. A PAT in a public page is a full-access credential published to the world, and no amount of scoping fixes the fact that it's *published*. Mint publishable keys in **Settings → Embeds**.

**Optionally lock it to your domains.** An empty allowlist permits any origin, deliberately: if you're embedding on a platform whose domain you don't control, there's no stable origin to name, and a silent 403 on an empty grid isn't something you could diagnose. Add origins once you know them.

## It never takes a payment

`<crossly-buy-button>` sends the buyer to a Crossly-hosted checkout. Card details are never entered on your site — accepting them in a script running on your page would drag *your* site into PCI scope, and you asked for a product grid.

It also sets no cookies and reads no storage on your origin, and sends no credentials cross-origin.

## Styling

Shadow DOM, so your CSS can't break our layout and our CSS can't break your nav. Styling is exposed on purpose:

```css
crossly-catalog {
  --crossly-accent: #ff5a5f;
  --crossly-radius: 2px;
  --crossly-min-col: 260px;
  --crossly-card-bg: #fafafa;
}
crossly-catalog::part(card)  { box-shadow: 0 2px 8px rgb(0 0 0 / 0.08); }
crossly-catalog::part(title) { font-family: Georgia, serif; }
```

Dark mode follows `prefers-color-scheme` unless you override the variables.

## Events

Both elements dispatch composed, bubbling events, so the host page can react without re-fetching or scraping the shadow DOM:

```js
document.addEventListener('crossly:loaded', (e) => console.log(e.detail.listings));
document.addEventListener('crossly:error',  (e) => console.warn(e.detail.message));
document.addEventListener('crossly:checkout', (e) => {
  // cancelable — preventDefault() and route it yourself
  console.log(e.detail.checkoutUrl);
});
```

## Money is always cents

The API returns integers of cents (`priceCents: 4599`). `formatPrice` is exported if you're rendering your own layout. There are no float dollars anywhere.

## License

MIT
