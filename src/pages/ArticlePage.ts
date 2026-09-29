import { Locator, Page, Response } from '@playwright/test';

/** Single-article view (/article/:slug). */
export class ArticlePage {
  readonly heading: Locator;
  readonly content: Locator;
  readonly tagList: Locator;
  readonly editButton: Locator;
  readonly deleteButton: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.locator('.banner h1');
    this.content = page.locator('.article-content');
    this.tagList = page.locator('.article-content .tag-list');
    // The author controls are rendered twice (banner + below the article);
    // `.first()` targets the banner copy explicitly rather than failing on strict mode.
    this.editButton = page.getByRole('link', { name: /edit article/i }).first();
    this.deleteButton = page.getByRole('button', { name: /delete article/i }).first();
  }

  followButton(username: string): Locator {
    return this.page.getByRole('button', { name: new RegExp(`follow ${username}`, 'i') }).first();
  }

  async open(slug: string): Promise<void> {
    await this.page.goto(`/article/${slug}`, { waitUntil: 'domcontentloaded' });
    await this.heading.waitFor();
  }

  async startEdit(): Promise<void> {
    await this.editButton.click();
    await this.page.waitForURL(/\/editor\//);
  }

  /** Delete and wait for the backend to confirm, so the next assertion can't race it. */
  async delete(): Promise<void> {
    const deleted = this.page.waitForResponse(
      (r: Response) =>
        r.request().method() === 'DELETE' &&
        /\/api\/articles\/[^/]+\/?$/.test(new URL(r.url()).pathname),
    );
    await this.deleteButton.click();
    const res = await deleted;
    if (!res.ok()) throw new Error(`Delete failed: HTTP ${res.status()}`);
  }
}
