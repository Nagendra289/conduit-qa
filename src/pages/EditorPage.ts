import { Locator, Page, Response } from '@playwright/test';
import { Article } from '../api/ConduitApi';
import { NewArticle } from '../data/factories';

/** Article editor, used for both create (/editor) and edit (/editor/:slug). */
export class EditorPage {
  readonly title: Locator;
  readonly description: Locator;
  readonly body: Locator;
  readonly tags: Locator;
  readonly publishButton: Locator;

  constructor(private readonly page: Page) {
    this.title = page.getByPlaceholder('Article Title');
    this.description = page.getByPlaceholder("What's this article about?");
    this.body = page.getByPlaceholder('Write your article (in markdown)');
    this.tags = page.getByPlaceholder('Enter tags');
    this.publishButton = page.getByRole('button', { name: /publish article/i });
  }

  async openNew(): Promise<void> {
    await this.page.goto('/editor', { waitUntil: 'domcontentloaded' });
    await this.title.waitFor();
  }

  async fill(article: Partial<NewArticle>): Promise<void> {
    if (article.title !== undefined) await this.title.fill(article.title);
    if (article.description !== undefined) await this.description.fill(article.description);
    if (article.body !== undefined) await this.body.fill(article.body);
    for (const tag of article.tagList ?? []) {
      await this.tags.fill(tag);
      await this.tags.press('Enter');
    }
  }

  /**
   * Click Publish and wait for the backend to confirm the save.
   * Waiting on the network response (not a sleep, not a URL guess) is what
   * makes this deterministic, and it hands back the server's view of the
   * article — including the slug we need for verification and cleanup.
   */
  async publish(): Promise<Article> {
    // Match on path + method, not host: the deployed SPA may call a different
    // API host than the one the tests use directly.
    const saved = this.page.waitForResponse((r: Response) => {
      const path = new URL(r.url()).pathname;
      const method = r.request().method();
      return (
        (method === 'POST' && /\/api\/articles\/?$/.test(path)) ||
        (method === 'PUT' && /\/api\/articles\/[^/]+\/?$/.test(path))
      );
    });
    await this.publishButton.click();
    const res = await saved;
    if (!res.ok()) throw new Error(`Publish failed: HTTP ${res.status()} ${await res.text()}`);
    return (await res.json()).article as Article;
  }
}
