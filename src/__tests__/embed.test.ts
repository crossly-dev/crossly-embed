/**
 * The embed's contract.
 *
 * This code runs on OTHER PEOPLE'S WEBSITES, which changes what is worth
 * testing. A bug here does not show up in our dashboard — it shows up as a
 * broken product grid on a seller's storefront, and they will not be able to
 * tell us why. So the tests lean on the two things that would actually hurt
 * somebody: escaping seller-controlled text before it lands in their page, and
 * never carrying credentials to a third-party origin.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';

let dom: JSDOM;

beforeEach(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://seller-site.example/shop',
    pretendToBeVisual: true,
  });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
  vi.stubGlobal('customElements', dom.window.customElements);
  vi.stubGlobal('CustomEvent', dom.window.CustomEvent);
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('escaping seller text', () => {
  it('neutralises markup in a title', async () => {
    // Titles are seller-controlled and land in a page we do not own. A seller
    // who pastes a script tag must not be able to run it on their visitors.
    const { escapeHtml } = await import('../index.js');
    const out = escapeHtml('<script>alert(1)</script>');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });

  it('escapes quotes, so an attribute cannot be broken out of', async () => {
    const { escapeHtml } = await import('../index.js');
    const out = escapeHtml('" onerror="alert(1)');
    expect(out).not.toContain('"');
    expect(out).toContain('&quot;');
  });

  it('renders an apostrophe without breaking the page', async () => {
    // The mundane case that actually happens: "Levi's".
    const { escapeHtml } = await import('../index.js');
    expect(escapeHtml("Levi's 501")).toBe('Levi&#39;s 501');
  });

  it('treats null and undefined as empty, not as the word "null"', async () => {
    const { escapeHtml } = await import('../index.js');
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});

describe('money', () => {
  it('renders cents as currency, never the raw integer', async () => {
    const { formatPrice } = await import('../index.js');
    expect(formatPrice(4599, 'USD', 'en-US')).toBe('$45.99');
  });

  it('does not lose the cents on a round number', async () => {
    const { formatPrice } = await import('../index.js');
    expect(formatPrice(4500, 'USD', 'en-US')).toBe('$45.00');
  });
});

describe('custom elements', () => {
  it('registers both elements', async () => {
    await import('../index.js');
    expect(customElements.get('crossly-catalog')).toBeTruthy();
    expect(customElements.get('crossly-buy-button')).toBeTruthy();
  });

  it('survives the script being included twice', async () => {
    // Page builders inject a script per section, and two plugins can both add
    // it. `define()` throws on a repeat, which would take down the whole embed
    // for a mistake that is not the seller's.
    const mod = await import('../index.js');
    expect(() => mod.defineCrosslyElements()).not.toThrow();
  });

  it('says what is missing rather than failing silently', async () => {
    await import('../index.js');
    const el = document.createElement('crossly-catalog');
    document.body.appendChild(el);
    // No `pk` — the most common mistake, and an empty box tells the seller
    // nothing about which of a dozen things went wrong.
    expect(el.shadowRoot?.textContent ?? '').toMatch(/pk/i);
  });
});

describe('requests carry no ambient credentials', () => {
  it('omits cookies and sends the key as a header', async () => {
    // This runs on a domain we do not own. Sending cookies would attach
    // whatever the seller's site has set for their own origin to a
    // cross-origin request, which is nobody's intent.
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), init });
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: [] }),
      } as unknown as Response;
    });

    await import('../index.js');
    const el = document.createElement('crossly-catalog');
    el.setAttribute('pk', 'crossly_pk_live_test');
    document.body.appendChild(el);

    await new Promise((r) => setTimeout(r, 0));

    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]!.init.credentials).toBe('omit');
    expect((calls[0]!.init.headers as Record<string, string>)['x-crossly-key']).toBe(
      'crossly_pk_live_test',
    );
  });

  it('hits the embed API, not the seller or buyer API', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(String(url));
      return { ok: true, status: 200, json: async () => ({ data: [] }) } as unknown as Response;
    });

    await import('../index.js');
    const el = document.createElement('crossly-catalog');
    el.setAttribute('pk', 'crossly_pk_live_test');
    document.body.appendChild(el);
    await new Promise((r) => setTimeout(r, 0));

    expect(calls[0]).toContain('/embed/v1/catalog');
    expect(calls[0]).not.toContain('/v1/orders');
  });
});

describe('it cannot take a payment', () => {
  it('exposes no card or payment entry point', async () => {
    // Load-bearing. The moment this script accepts card details, every site
    // that pasted our snippet is in PCI scope. Checkout is a redirect to a
    // Crossly-hosted page, and that has to stay a deliberate decision.
    const mod = await import('../index.js');
    const names = Object.keys(mod).map((k) => k.toLowerCase());
    for (const forbidden of ['card', 'payment', 'pay', 'stripe', 'token']) {
      expect(names.some((n) => n.includes(forbidden)), `exported ${forbidden}`).toBe(false);
    }
  });
});
