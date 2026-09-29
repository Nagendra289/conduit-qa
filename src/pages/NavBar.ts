import { Locator, Page, expect } from '@playwright/test';

/**
 * Header navigation, shared by every page.
 * Selectors are role/text-based (what a user sees), not CSS classes,
 * so a styling refactor does not break the suite.
 */
export class NavBar {
  readonly root: Locator;

  constructor(private readonly page: Page) {
    this.root = page.locator('nav.navbar');
  }

  userLink(username: string): Locator {
    return this.root.getByRole('link', { name: username });
  }

  get newArticleLink(): Locator {
    return this.root.getByRole('link', { name: /new article/i });
  }

  get signInLink(): Locator {
    return this.root.getByRole('link', { name: /sign in/i });
  }

  /** The one reliable signal that the SPA has finished bootstrapping an authenticated session. */
  async expectLoggedInAs(username: string): Promise<void> {
    await expect(this.userLink(username)).toBeVisible();
    await expect(this.signInLink).toBeHidden();
  }
}
