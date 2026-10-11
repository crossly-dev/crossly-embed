/**
 * @crossly/embed — Crossly on somebody else's website.
 *
 *   <script src="https://crossly.net/embed.js" async></script>
 *   <crossly-catalog pk="crossly_pk_live_…"></crossly-catalog>
 *   <crossly-buy-button pk="crossly_pk_live_…" listing="…"></crossly-buy-button>
 *   <crossly-index pk="crossly_pk_live_…" slug="crossly-50"></crossly-index>
 *   <crossly-mark pk="crossly_pk_live_…" key="…"></crossly-mark>
 *
 * ── WHY CUSTOM ELEMENTS AND NOT A REACT COMPONENT ────────────────────
 * The sellers who need this are on Squarespace, Wix, WordPress, Webflow and
 * hand-written HTML. Most of them cannot run a build step, and the ones on a
 * framework are on four different frameworks. A custom element is the only
 * thing that works in all of those without a wrapper per ecosystem — React,
 * Vue, Svelte and a raw `<div>` all speak HTML.
 *
 * ── WHY SHADOW DOM ───────────────────────────────────────────────────
 * The host page's CSS is not ours and ours is not theirs. Without a shadow
 * root, a seller's `img { width: 100% }` reflows our grid and our reset breaks
 * their nav, and both parties blame us. Styling is exposed deliberately
 * through CSS custom properties and `::part`, so a seller can match their
 * brand without being able to break the layout by accident.
 *
 * ── WHAT THIS NEVER DOES ─────────────────────────────────────────────
 * It never collects payment details. `<crossly-buy-button>` sends the buyer to
 * a Crossly-hosted checkout. Taking a card number inside a script running on
 * someone else's page would drag every site that pastes this snippet into PCI
 * scope, which is not a thing to do to somebody who wanted a product grid.
 *
 * It also sets no cookies and reads no storage on the host origin. An embed
 * that quietly tracked a seller's visitors would be a liability we handed them
 * without asking.
 */

const DEFAULT_API = 'https://crossly.net/api';

export interface EmbedListing {
  id: string;
  title: string;
  description: string | null;
  priceCents: number;
  imageUrl: string | null;
  brand: string | null;
  size: string | null;
  condition: string | null;
  available: boolean;
}

/** Cents to a display string. The API never sends dollars; neither do we. */
export function formatPrice(cents: number, currency = 'USD', locale?: string): string {
  return new Intl.NumberFormat(locale ?? undefined, { style: 'currency', currency }).format(
    cents / 100,
  );
}

/**
 * Escape before interpolating into HTML.
 *
 * Titles and descriptions are seller-controlled, not ours, and they land in a
 * page we do not own. A seller who pastes an apostrophe should not be able to
 * break their own site, and one who pastes a `<script>` should not be able to
 * break it for their visitors.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function embedFetch<T>(
  apiBase: string,
  path: string,
  key: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${apiBase}/embed/v1${path}`, {
    ...init,
    headers: {
      'x-crossly-key': key,
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
    // No cookies, ever. This runs on somebody else's domain and has no
    // business carrying ambient credentials anywhere.
    credentials: 'omit',
  });

  const body = (await res.json().catch(() => null)) as
    | { data?: T; error?: { code: string; message: string } }
    | null;

  if (!res.ok) {
    throw new Error(body?.error?.message ?? `Crossly embed request failed (${res.status})`);
  }
  return body?.data as T;
}

const STYLE = `
  :host {
    /* Deliberately overridable. A seller matching their brand should not have
       to fight specificity or fork the component. */
    --crossly-gap: 16px;
    --crossly-radius: 10px;
    --crossly-fg: #111;
    --crossly-muted: #666;
    --crossly-accent: #10b981;
    --crossly-card-bg: #fff;
    --crossly-border: #e5e7eb;
    --crossly-min-col: 200px;

    display: block;
    color: var(--crossly-fg);
    font-family: inherit; /* the host page's type, not ours */
  }
  @media (prefers-color-scheme: dark) {
    :host {
      --crossly-fg: #f3f4f6;
      --crossly-muted: #9ca3af;
      --crossly-card-bg: #111827;
      --crossly-border: #374151;
    }
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--crossly-min-col), 1fr));
    gap: var(--crossly-gap);
  }
  .card {
    background: var(--crossly-card-bg);
    border: 1px solid var(--crossly-border);
    border-radius: var(--crossly-radius);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .thumb {
    aspect-ratio: 1 / 1;
    width: 100%;
    object-fit: cover;
    display: block;
    background: var(--crossly-border);
  }
  .body { padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 4px; }
  .title { font-weight: 600; font-size: 0.95rem; line-height: 1.3; }
  .meta { color: var(--crossly-muted); font-size: 0.8rem; }
  .price { font-weight: 700; margin-top: 2px; }
  .sold { color: var(--crossly-muted); font-weight: 600; }
  button {
    font: inherit;
    cursor: pointer;
    border: 0;
    border-radius: var(--crossly-radius);
    padding: 10px 16px;
    background: var(--crossly-accent);
    color: #fff;
    font-weight: 600;
  }
  button[disabled] { opacity: 0.5; cursor: not-allowed; }
  .msg { color: var(--crossly-muted); font-size: 0.9rem; padding: 12px 0; }
`;

function shadow(el: HTMLElement): ShadowRoot {
  const root = el.shadowRoot ?? el.attachShadow({ mode: 'open' });
  if (!root.querySelector('style')) {
    const style = document.createElement('style');
    style.textContent = STYLE;
    root.appendChild(style);
  }
  return root;
}

/** `<crossly-catalog pk="…" limit="12" q="jacket">` */
export class CrosslyCatalog extends HTMLElement {
  static get observedAttributes(): string[] {
    return ['pk', 'limit', 'q', 'api'];
  }

  private root!: ShadowRoot;
  private slotEl!: HTMLDivElement;

  connectedCallback(): void {
    this.root = shadow(this);
    if (!this.slotEl) {
      this.slotEl = document.createElement('div');
      this.root.appendChild(this.slotEl);
    }
    void this.load();
  }

  attributeChangedCallback(): void {
    if (this.isConnected) void this.load();
  }

  private async load(): Promise<void> {
    const pk = this.getAttribute('pk');
    if (!pk) {
      this.slotEl.innerHTML = `<div class="msg">Missing <code>pk</code> — your Crossly publishable key.</div>`;
      return;
    }

    this.slotEl.innerHTML = `<div class="msg">Loading…</div>`;

    const api = this.getAttribute('api') ?? DEFAULT_API;
    const params = new URLSearchParams();
    const limit = this.getAttribute('limit');
    const q = this.getAttribute('q');
    if (limit) params.set('limit', limit);
    if (q) params.set('q', q);

    try {
      const listings = await embedFetch<EmbedListing[]>(
        api,
        `/catalog${params.toString() ? `?${params}` : ''}`,
        pk,
      );

      if (!listings?.length) {
        this.slotEl.innerHTML = `<div class="msg">Nothing listed right now.</div>`;
        return;
      }

      this.slotEl.innerHTML = `<div class="grid" part="grid">${listings
        .map((l) => this.card(l))
        .join('')}</div>`;

      // The event carries the data so a host page can react — analytics, a
      // custom layout — without re-fetching or scraping our shadow DOM.
      this.dispatchEvent(
        new CustomEvent('crossly:loaded', { detail: { listings }, bubbles: true, composed: true }),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not load listings.';
      this.slotEl.innerHTML = `<div class="msg">${escapeHtml(message)}</div>`;
      this.dispatchEvent(
        new CustomEvent('crossly:error', { detail: { message }, bubbles: true, composed: true }),
      );
    }
  }

  private card(l: EmbedListing): string {
    const meta = [l.brand, l.size, l.condition].filter(Boolean).map(escapeHtml).join(' · ');
    const img = l.imageUrl
      ? `<img class="thumb" part="image" loading="lazy" alt="${escapeHtml(l.title)}" src="${escapeHtml(l.imageUrl)}">`
      : `<div class="thumb" part="image"></div>`;
    return `
      <article class="card" part="card" data-listing="${escapeHtml(l.id)}">
        ${img}
        <div class="body">
          <div class="title" part="title">${escapeHtml(l.title)}</div>
          ${meta ? `<div class="meta" part="meta">${meta}</div>` : ''}
          <div class="price" part="price">${
            l.available ? escapeHtml(formatPrice(l.priceCents)) : '<span class="sold">Sold</span>'
          }</div>
        </div>
      </article>`;
  }
}

/** `<crossly-buy-button pk="…" listing="…" quantity="1">` */
export class CrosslyBuyButton extends HTMLElement {
  static get observedAttributes(): string[] {
    return ['pk', 'listing', 'quantity', 'label', 'api', 'target'];
  }

  private root!: ShadowRoot;
  private button!: HTMLButtonElement;

  connectedCallback(): void {
    this.root = shadow(this);
    if (!this.button) {
      this.button = document.createElement('button');
      this.button.setAttribute('part', 'button');
      this.button.addEventListener('click', () => void this.checkout());
      this.root.appendChild(this.button);
    }
    this.render();
  }

  attributeChangedCallback(): void {
    if (this.isConnected) this.render();
  }

  private render(): void {
    this.button.textContent = this.getAttribute('label') ?? 'Buy now';
    this.button.disabled = !this.getAttribute('pk') || !this.getAttribute('listing');
  }

  private async checkout(): Promise<void> {
    const pk = this.getAttribute('pk');
    const listingId = this.getAttribute('listing');
    if (!pk || !listingId) return;

    const api = this.getAttribute('api') ?? DEFAULT_API;
    const quantity = Number(this.getAttribute('quantity') ?? '1') || 1;

    const previous = this.button.textContent;
    this.button.disabled = true;
    this.button.textContent = 'Starting checkout…';

    try {
      const result = await embedFetch<{ checkoutUrl: string; mode: string }>(
        api,
        '/checkout',
        pk,
        {
          method: 'POST',
          body: JSON.stringify({
            items: [{ listingId, quantity }],
            returnUrl: window.location.href,
          }),
        },
      );

      this.dispatchEvent(
        new CustomEvent('crossly:checkout', {
          detail: { checkoutUrl: result.checkoutUrl },
          bubbles: true,
          composed: true,
          cancelable: true,
        }),
      );

      // `_self` by default. A new tab loses the back button and some mobile
      // browsers block it when the click is one await away from the user
      // gesture — which is exactly this code path.
      const target = this.getAttribute('target') ?? '_self';
      if (target === '_self') window.location.assign(result.checkoutUrl);
      else window.open(result.checkoutUrl, target, 'noopener,noreferrer');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Checkout could not start.';
      this.button.textContent = previous;
      this.button.disabled = false;
      this.dispatchEvent(
        new CustomEvent('crossly:error', { detail: { message }, bubbles: true, composed: true }),
      );
    }
  }
}

/* ── Vault Markets widgets ─────────────────────────────────────────────
 *
 *   <crossly-index pk="…" slug="crossly-50" range="1y"></crossly-index>
 *   <crossly-mark pk="…" key="<variantId>:<condition>:<grade>"></crossly-mark>
 *
 * For creators, breakers, blogs and press: a Crossly index level or a vault
 * market's mark, read-only, with a link back. Every number comes from the
 * Crossly order book, and each widget always shows how much it rests on --
 * the quality letter, n and the as-of date. When the data is too thin the api
 * says so and the widget prints "Insufficient data" (or "No market yet")
 * instead of a number somebody might quote.
 */

export interface EmbedIndexWidget {
  slug: string;
  name: string;
  level: number | null;
  changeBps: number | null;
  points: Array<{ day: string; value: number }>;
  quality: 'A' | 'B' | 'C' | 'none';
  n: number;
  asOf: string | null;
  insufficient: boolean;
  href: string;
}

export interface EmbedMarkWidget {
  bookKey: string;
  name: string | null;
  label: string | null;
  imageUrl: string | null;
  mark: { cents: number | null; quality: 'A' | 'B' | 'C' | 'none'; asOf: string | null };
  trades30d: number;
  insufficient: boolean;
  points: Array<{ day: string; cents: number }>;
  href: string;
}

const RANGES = ['1m', '3m', '6m', '1y', '5y'];

/** A signed bps move as "+4.31%". */
export function formatMove(bps: number | null | undefined): string {
  if (bps == null) return '';
  const sign = bps > 0 ? '+' : bps < 0 ? '-' : '';
  return `${sign}${(Math.abs(bps) / 100).toFixed(2)}%`;
}

/** An SVG path for a sparkline, or '' with fewer than two points. */
export function sparklinePath(values: number[], width = 160, height = 40): string {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length < 2) return '';
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  const span = hi - lo || 1;
  return v
    .map((x, i) => {
      const px = (i / (v.length - 1)) * width;
      const py = height - ((x - lo) / span) * (height - 4) - 2;
      return `${i === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`;
    })
    .join(' ');
}

const WIDGET_STYLE = `
  .w { background: var(--crossly-card-bg); border: 1px solid var(--crossly-border); border-radius: var(--crossly-radius); padding: 12px 14px; display: flex; flex-direction: column; gap: 6px; max-width: 360px; }
  .w .row { display: flex; align-items: center; gap: 10px; }
  .w .name { font-weight: 600; font-size: 0.95rem; line-height: 1.3; }
  .w .big { font-size: 1.5rem; font-weight: 700; font-variant-numeric: tabular-nums; }
  .w .up { color: #059669; } .w .down { color: #dc2626; }
  .w .meta { color: var(--crossly-muted); font-size: 0.75rem; }
  .w .thumb { width: 44px; height: 44px; border-radius: 8px; object-fit: contain; background: var(--crossly-border); flex: none; }
  .w svg { display: block; width: 100%; height: 40px; }
  .w a { color: inherit; }
`;

function widgetRoot(el: HTMLElement): HTMLDivElement {
  const root = shadow(el);
  if (!root.querySelector('style[data-w]')) {
    const style = document.createElement('style');
    style.setAttribute('data-w', '');
    style.textContent = WIDGET_STYLE;
    root.appendChild(style);
  }
  let slot = root.querySelector('div[data-slot]') as HTMLDivElement | null;
  if (!slot) {
    slot = document.createElement('div');
    slot.setAttribute('data-slot', '');
    root.appendChild(slot);
  }
  return slot;
}

function rangeOf(el: HTMLElement): string {
  const r = el.getAttribute('range') ?? '1y';
  return RANGES.includes(r) ? r : '1y';
}

function spark(values: number[], up: boolean): string {
  const d = sparklinePath(values);
  return d ? `<svg viewBox="0 0 160 40" preserveAspectRatio="none" part="sparkline" aria-hidden="true"><path d="${d}" fill="none" stroke="${up ? '#059669' : '#dc2626'}" stroke-width="1.5"/></svg>` : '';
}

function footer(parts: Array<string | null>, href: string): string {
  const meta = parts.filter((p): p is string => !!p).map((p) => escapeHtml(p)).join(' · ');
  return `<div class="meta" part="meta">${meta}${meta ? ' · ' : ''}<a href="${escapeHtml(href)}" target="_blank" rel="noopener">Data: Crossly</a></div>`;
}

/** The index widget's HTML. Exported for tests. */
export function renderIndexWidget(x: EmbedIndexWidget): string {
  const up = (x.changeBps ?? 0) >= 0;
  const body = x.insufficient || x.level == null
    ? `<div class="big" part="value">Insufficient data</div>`
    : `<div class="row"><span class="big" part="value">${escapeHtml(x.level.toFixed(2))}</span>${x.changeBps != null ? `<span class="${up ? 'up' : 'down'}" part="change">${escapeHtml(formatMove(x.changeBps))}</span>` : ''}</div>${spark(x.points.map((p) => p.value), up)}`;
  return `<div class="w" part="widget"><a class="name" part="title" href="${escapeHtml(x.href)}" target="_blank" rel="noopener">${escapeHtml(x.name)}</a>${body}${footer([
    x.insufficient ? null : `Quality ${x.quality}`,
    `n ${x.n} market${x.n === 1 ? '' : 's'}`,
    x.asOf ? `as of ${x.asOf}` : null,
  ], x.href)}</div>`;
}

/** The mark widget's HTML. Exported for tests. */
export function renderMarkWidget(x: EmbedMarkWidget): string {
  const values = x.points.map((p) => p.cents);
  const up = values.length < 2 || values[values.length - 1]! >= values[0]!;
  const img = x.imageUrl ? `<img class="thumb" part="image" loading="lazy" alt="" src="${escapeHtml(x.imageUrl)}">` : '';
  const value = x.insufficient || x.mark.cents == null ? 'No market yet' : formatPrice(x.mark.cents);
  const label = x.label ? `<div class="meta">${escapeHtml(x.label)}</div>` : '';
  return `<div class="w" part="widget"><div class="row">${img}<div><a class="name" part="title" href="${escapeHtml(x.href)}" target="_blank" rel="noopener">${escapeHtml(x.name ?? 'Vault market')}</a>${label}</div></div><div class="big" part="value">${escapeHtml(value)}</div>${x.insufficient ? '' : spark(values, up)}${footer([
    x.insufficient ? null : `Quality ${x.mark.quality}`,
    `n ${x.trades30d} trade${x.trades30d === 1 ? '' : 's'} (30 d)`,
    x.mark.asOf ? `as of ${x.mark.asOf.slice(0, 10)}` : null,
  ], x.href)}</div>`;
}

abstract class VaultWidget<T> extends HTMLElement {
  protected abstract need(): string[];
  protected abstract path(): string;
  protected abstract render(x: T): string;
  protected abstract detail(x: T): Record<string, unknown>;

  connectedCallback(): void {
    void this.load();
  }

  attributeChangedCallback(): void {
    if (this.isConnected) void this.load();
  }

  private async load(): Promise<void> {
    const slot = widgetRoot(this);
    const pk = this.getAttribute('pk');
    const missing = ['pk', ...this.need()].filter((a) => !this.getAttribute(a));
    if (!pk || missing.length) {
      slot.innerHTML = `<div class="msg">Missing ${missing.map((m) => `<code>${escapeHtml(m)}</code>`).join(' and ')}.</div>`;
      return;
    }
    slot.innerHTML = `<div class="msg">Loading…</div>`;
    const api = this.getAttribute('api') ?? DEFAULT_API;
    try {
      const x = await embedFetch<T>(api, this.path(), pk);
      slot.innerHTML = this.render(x);
      this.dispatchEvent(new CustomEvent('crossly:loaded', { detail: this.detail(x), bubbles: true, composed: true }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not load Crossly data.';
      slot.innerHTML = `<div class="msg">${escapeHtml(message)}</div>`;
      this.dispatchEvent(new CustomEvent('crossly:error', { detail: { message }, bubbles: true, composed: true }));
    }
  }
}

/** `<crossly-index pk="…" slug="crossly-50" range="1y">` */
export class CrosslyIndex extends VaultWidget<EmbedIndexWidget> {
  static get observedAttributes(): string[] {
    return ['pk', 'slug', 'range', 'api'];
  }
  protected need() { return ['slug']; }
  protected path() { return `/vault/index/${encodeURIComponent(this.getAttribute('slug')!)}?range=${rangeOf(this)}`; }
  protected render(x: EmbedIndexWidget) { return renderIndexWidget(x); }
  protected detail(x: EmbedIndexWidget) { return { index: x }; }
}

/** `<crossly-mark pk="…" key="variantId:condition:grade" range="3m">` */
export class CrosslyMark extends VaultWidget<EmbedMarkWidget> {
  static get observedAttributes(): string[] {
    return ['pk', 'key', 'range', 'api'];
  }
  protected need() { return ['key']; }
  // `bookKey` on the wire: `key` there is the publishable key.
  protected path() { return `/vault/mark?${new URLSearchParams({ bookKey: this.getAttribute('key')!, range: rangeOf(this) })}`; }
  protected render(x: EmbedMarkWidget) { return renderMarkWidget(x); }
  protected detail(x: EmbedMarkWidget) { return { mark: x }; }
}

/**
 * Register the elements.
 *
 * Guarded because a page can include the script twice — two plugins, or a
 * builder that injects it per section — and `define()` throws on a repeat,
 * which would take down the whole embed for a mistake that is not the
 * seller's.
 */
export function defineCrosslyElements(): void {
  if (typeof window === 'undefined' || !window.customElements) return;
  if (!customElements.get('crossly-catalog')) {
    customElements.define('crossly-catalog', CrosslyCatalog);
  }
  if (!customElements.get('crossly-buy-button')) {
    customElements.define('crossly-buy-button', CrosslyBuyButton);
  }
  if (!customElements.get('crossly-index')) {
    customElements.define('crossly-index', CrosslyIndex);
  }
  if (!customElements.get('crossly-mark')) {
    customElements.define('crossly-mark', CrosslyMark);
  }
}

defineCrosslyElements();
