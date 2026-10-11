/**
 * The Vault Markets widgets: they must never print a number the api said is
 * too thin to cite, must always say how much a number rests on, and must
 * escape what they render (a market name is catalogue text, not ours to trust
 * inside somebody else's page).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';

beforeEach(() => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://blog.example/post' });
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

const index = {
  slug: 'crossly-50', name: 'Crossly 50', level: 1043.21, changeBps: 125,
  points: [{ day: '2026-10-01', value: 1000 }, { day: '2026-10-02', value: 1043.21 }],
  quality: 'A' as const, n: 41, asOf: '2026-10-06', insufficient: false, href: 'https://crossly.net/shop/vault/markets/indexes/crossly-50',
};

describe('<crossly-index>', () => {
  it('shows the level with quality, n, as-of and a link back', async () => {
    const { renderIndexWidget } = await import('../index.js');
    const html = renderIndexWidget(index);
    expect(html).toContain('1043.21');
    expect(html).toContain('+1.25%');
    expect(html).toContain('Quality A');
    expect(html).toContain('n 41 markets');
    expect(html).toContain('as of 2026-10-06');
    expect(html).toContain('Data: Crossly');
  });

  it('says "Insufficient data" and prints no level when gated', async () => {
    const { renderIndexWidget } = await import('../index.js');
    const html = renderIndexWidget({ ...index, level: null, changeBps: null, points: [], quality: 'none', n: 2, insufficient: true });
    expect(html).toContain('Insufficient data');
    expect(html).not.toContain('1043');
    expect(html).not.toContain('Quality');
    expect(html).toContain('n 2 markets');
  });

  it('escapes the name', async () => {
    const { renderIndexWidget } = await import('../index.js');
    expect(renderIndexWidget({ ...index, name: '<img src=x onerror=alert(1)>' })).not.toContain('<img src=x');
  });
});

describe('<crossly-mark>', () => {
  const mark = {
    bookKey: '3f2a0000-0000-0000-0000-000000000000:new:-', name: 'Charizard', label: 'Base Set', imageUrl: null,
    mark: { cents: 12_345, quality: 'B' as const, asOf: '2026-10-06T12:00:00.000Z' }, trades30d: 7, insufficient: false,
    points: [{ day: '2026-10-01', cents: 12_000 }, { day: '2026-10-06', cents: 12_345 }], href: 'https://crossly.net/x',
  };

  it('shows the mark with quality, trades and as-of', async () => {
    const { renderMarkWidget } = await import('../index.js');
    const html = renderMarkWidget(mark);
    expect(html).toContain('123.45');
    expect(html).toContain('Quality B');
    expect(html).toContain('n 7 trades (30 d)');
    expect(html).toContain('as of 2026-10-06');
  });

  it('says "No market yet" with no price when there is no showable mark', async () => {
    const { renderMarkWidget } = await import('../index.js');
    const html = renderMarkWidget({ ...mark, mark: { cents: null, quality: 'none', asOf: null }, insufficient: true, points: [] });
    expect(html).toContain('No market yet');
    expect(html).not.toContain('123.45');
  });

  it('sends the market as bookKey, never as key (that is the publishable key)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: mark }) });
    vi.stubGlobal('fetch', fetchMock);
    await import('../index.js');
    const el = document.createElement('crossly-mark');
    el.setAttribute('pk', 'crossly_pk_test_1');
    el.setAttribute('key', mark.bookKey);
    document.body.appendChild(el);
    await new Promise((r) => setTimeout(r, 0));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/embed/v1/vault/mark?bookKey=');
    expect(String(url)).not.toMatch(/[?&]key=/);
    expect(init.credentials).toBe('omit');
  });
});

describe('sparklinePath', () => {
  it('needs two points', async () => {
    const { sparklinePath } = await import('../index.js');
    expect(sparklinePath([1])).toBe('');
    expect(sparklinePath([1, 2]).startsWith('M0.0,')).toBe(true);
  });
});
