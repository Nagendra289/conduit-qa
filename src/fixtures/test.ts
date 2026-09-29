import { test as base, expect } from '@playwright/test';
import { Article, AuthUser, ConduitApi } from '../api/ConduitApi';
import { buildArticle, buildUser } from '../data/factories';
import { NavBar } from '../pages/NavBar';

/**
 * Shared fixtures. Each test declares only what it needs, e.g.
 *   test('...', async ({ authedPage, userArticle }) => { ... })
 * and Playwright builds (and tears down) exactly that state for that test.
 *
 * All state is created through the REST API, never by clicking through
 * the UI — this is what keeps UI tests fast and independent.
 */
type Fixtures = {
  /** API client bound to Playwright's request context. */
  api: ConduitApi;
  /** A freshly registered user (user "A"). */
  user: AuthUser;
  /** A second, unrelated user (user "B") for permission tests. */
  otherUser: AuthUser;
  /** A browser page already signed in as `user`, via token injection — no login form. */
  authedPage: import('@playwright/test').Page;
  /** An article owned by `user`, deleted after the test. */
  userArticle: Article;
  /** Register any article created during a test (e.g. via the UI) for cleanup. */
  trackArticle: (slug: string, token: string) => void;
};

export const test = base.extend<Fixtures>({
  api: async ({ request }, use) => {
    await use(new ConduitApi(request));
  },

  user: async ({ api }, use) => {
    await use(await api.setupUser(buildUser()));
    // Conduit has no "delete user" endpoint; users are unique and harmless. See README limitations.
  },

  otherUser: async ({ api }, use) => {
    await use(await api.setupUser(buildUser()));
  },

  trackArticle: async ({ api }, use) => {
    const created: { slug: string; token: string }[] = [];
    await use((slug, token) => created.push({ slug, token }));
    // Teardown runs even when the test failed, so failed runs don't leave debris.
    for (const { slug, token } of created) await api.cleanupArticle(slug, token);
  },

  userArticle: async ({ api, user, trackArticle }, use) => {
    const article = await api.setupArticle(buildArticle(), user.token);
    trackArticle(article.slug, user.token);
    await use(article);
  },

  authedPage: async ({ page, user }, use) => {
    // The Angular app reads its JWT from localStorage key "jwtToken" on boot.
    // addInitScript runs before any app code, so the very first render is authenticated.
    await page.addInitScript((token) => {
      window.localStorage.setItem('jwtToken', token);
    }, user.token);
    // Don't wait for the 'load' event: the home feed pulls avatars from external
    // image hosts, and one slow image can hold 'load' for 30s+ on the shared demo.
    // The SPA is ready when the navbar shows the user — asserted just below.
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    // Fail fast and clearly if injection ever stops working (e.g. storage key renamed).
    await new NavBar(page).expectLoggedInAs(user.username);
    await use(page);
  },
});

export { expect };
