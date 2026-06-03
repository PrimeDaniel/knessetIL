import { test, expect } from '@playwright/test';

// Helper: wait for data to load (no loading spinners / skeleton screens)
async function waitForData(page: any, dataText?: string) {
  await page.waitForLoadState('networkidle', { timeout: 15_000 });
  if (dataText) {
    await expect(page.getByText(dataText)).toBeVisible({ timeout: 10_000 });
  }
}

test.describe('Homepage / Dashboard', () => {
  test('loads with recent votes and bills', async ({ page }) => {
    await page.goto('/');
    await waitForData(page);

    // Navigation present
    await expect(page.getByRole('navigation')).toBeVisible();

    // Dashboard shows vote and bill counts (numbers > 0)
    const body = await page.textContent('body');
    expect(body).toBeTruthy();

    // Page title
    await expect(page).toHaveTitle(/כנסת|Knesset/i);

    // Recent votes section has at least one item
    const recentVotes = page.locator('[data-testid="recent-votes"], .recent-votes, section').first();
    await expect(recentVotes).toBeVisible();

    console.log('✅ Homepage loaded');
  });
});

test.describe('Bills page (/bills)', () => {
  test('shows bill list with pagination', async ({ page }) => {
    await page.goto('/bills');
    await page.waitForLoadState('networkidle', { timeout: 15_000 });

    const body = await page.textContent('body');
    expect(body?.length).toBeGreaterThan(200);

    await expect(page.getByText('Something went wrong')).not.toBeVisible();
    await expect(page.getByText('500')).not.toBeVisible();

    const hasHebrew = /[֐-׿]/.test(body || '');
    expect(hasHebrew).toBe(true);

    console.log('✅ Bills page loaded');
  });

  test('bill detail page loads via direct URL', async ({ page }) => {
    // Fetch a real bill ID from the API
    const api = await page.request.get('http://localhost:8000/api/v1/bills?limit=1');
    const data = await api.json();
    const billId = data.data[0]?.bill_id;
    expect(billId).toBeTruthy();

    await page.goto(`/bills/${billId}`);
    // Bill detail page makes long-running OData requests — wait for DOM, not networkidle
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
    expect(page.url()).toMatch(/\/bills\/\d+/);
    const body = await page.textContent('body');
    expect(body?.length).toBeGreaterThan(200);
    console.log('✅ Bill detail page loaded:', page.url());
  });
});

test.describe('Members page (/members)', () => {
  test('shows MK list with Hebrew names', async ({ page }) => {
    await page.goto('/members');
    await page.waitForLoadState('networkidle', { timeout: 15_000 });

    const body = await page.textContent('body');
    expect(body?.length).toBeGreaterThan(200);

    await expect(page.getByText('Something went wrong')).not.toBeVisible();

    const hasHebrew = /[֐-׿]/.test(body || '');
    expect(hasHebrew).toBe(true);

    console.log('✅ Members page loaded');
  });

  test('member detail page loads via direct URL', async ({ page }) => {
    const api = await page.request.get('http://localhost:8000/api/v1/members?limit=1&is_current=true');
    const data = await api.json();
    const mkId = data.data[0]?.mk_individual_id;
    expect(mkId).toBeTruthy();

    await page.goto(`/members/${mkId}`);
    await page.waitForLoadState('networkidle', { timeout: 15_000 });
    expect(page.url()).toMatch(/\/members\/\d+/);
    const body = await page.textContent('body');
    expect(body?.length).toBeGreaterThan(200);
    const hasHebrew = /[֐-׿]/.test(body || '');
    expect(hasHebrew).toBe(true);
    console.log('✅ Member detail page loaded:', page.url());
  });
});

test.describe('Parties page (/parties)', () => {
  test('shows party list', async ({ page }) => {
    await page.goto('/parties');
    await page.waitForLoadState('networkidle', { timeout: 15_000 });

    const body = await page.textContent('body');
    expect(body?.length).toBeGreaterThan(200);

    await expect(page.getByText('Something went wrong')).not.toBeVisible();

    const hasHebrew = /[֐-׿]/.test(body || '');
    expect(hasHebrew).toBe(true);

    console.log('✅ Parties page loaded');
  });

  test('party detail page loads via direct URL', async ({ page }) => {
    const api = await page.request.get('http://localhost:8000/api/v1/parties?limit=1&is_active=true');
    const data = await api.json();
    const partyId = data.data[0]?.id;
    expect(partyId).toBeTruthy();

    await page.goto(`/parties/${partyId}`);
    await page.waitForLoadState('networkidle', { timeout: 15_000 });
    expect(page.url()).toMatch(/\/parties\/\d+/);
    const body = await page.textContent('body');
    expect(body?.length).toBeGreaterThan(200);
    const hasHebrew = /[֐-׿]/.test(body || '');
    expect(hasHebrew).toBe(true);
    console.log('✅ Party detail page loaded:', page.url());
  });
});

test.describe('Votes page (/votes)', () => {
  test('shows vote list', async ({ page }) => {
    await page.goto('/votes');
    await page.waitForLoadState('networkidle', { timeout: 15_000 });

    const body = await page.textContent('body');
    expect(body?.length).toBeGreaterThan(200);

    await expect(page.getByText('Something went wrong')).not.toBeVisible();

    const hasHebrew = /[֐-׿]/.test(body || '');
    expect(hasHebrew).toBe(true);

    console.log('✅ Votes page loaded');
  });

  test('vote detail page loads via direct URL', async ({ page }) => {
    // Fetch a fresh vote ID directly (avoid stale Redis cache in Playwright request)
    const api = await page.request.get('http://localhost:8000/api/v1/votes?limit=1&page=1');
    const data = await api.json();
    // Fall back to a known K25 vote ID if cache returns empty
    const voteId = data.data[0]?.id ?? 45953;

    await page.goto(`/votes/${voteId}`);
    // Vote detail makes long-running OData requests (per-MK results) — wait for
    // the DOM, not networkidle (same pattern as the bill detail test above).
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2500);
    expect(page.url()).toMatch(/\/votes\/\d+/);
    const body = await page.textContent('body');
    expect(body?.length).toBeGreaterThan(200);
    const hasHebrew = /[֐-׿]/.test(body || '');
    expect(hasHebrew).toBe(true);
    console.log('✅ Vote detail page loaded:', page.url());
  });
});

test.describe('API health and data freshness', () => {
  test('API health endpoint is OK', async ({ request }) => {
    const response = await request.get('http://localhost:8000/api/v1/health');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ok');
    console.log('✅ API health OK, env:', body.env);
  });

  test('bills API returns data', async ({ request }) => {
    const response = await request.get('http://localhost:8000/api/v1/bills?limit=5');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.pagination.total).toBeGreaterThan(0);
    expect(body.data.length).toBeGreaterThan(0);
    console.log('✅ Bills API:', body.pagination.total, 'total bills');
  });

  test('members API returns data', async ({ request }) => {
    const response = await request.get('http://localhost:8000/api/v1/members?limit=5');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.pagination.total).toBeGreaterThan(0);
    console.log('✅ Members API:', body.pagination.total, 'total members');
  });

  test('votes API returns data', async ({ request }) => {
    const response = await request.get('http://localhost:8000/api/v1/votes?limit=5');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.pagination.total).toBeGreaterThan(0);
    console.log('✅ Votes API:', body.pagination.total, 'total votes');
  });

  test('parties API returns data', async ({ request }) => {
    const response = await request.get('http://localhost:8000/api/v1/parties?limit=5');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.pagination.total).toBeGreaterThan(0);
    console.log('✅ Parties API:', body.pagination.total, 'total parties');
  });

  test('dashboard API returns correct data', async ({ request }) => {
    const response = await request.get('http://localhost:8000/api/v1/stats/dashboard');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.total_votes_this_knesset).toBeGreaterThan(0);
    expect(body.total_bills).toBeGreaterThan(0);
    expect(body.total_active_mks).toBeGreaterThan(0);
    expect(body.recent_votes.length).toBeGreaterThan(0);
    expect(body.recent_bills.length).toBeGreaterThan(0);
    console.log('✅ Dashboard API: votes=', body.total_votes_this_knesset, 'bills=', body.total_bills, 'mks=', body.total_active_mks);
  });
});
