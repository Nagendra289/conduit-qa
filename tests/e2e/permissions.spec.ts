import { test, expect } from '../../src/fixtures/test';
import { buildArticle } from '../../src/data/factories';
import { ArticlePage } from '../../src/pages/ArticlePage';

/**
 * UI half of the ownership check (the API half, which is the real security
 * boundary, lives in tests/api/permissions.api.spec.ts).
 *
 * Here: user A (`user`, signed in) opens an article owned by user B (`otherUser`).
 * A must see the article but none of the owner controls.
 */
test('user A sees no edit/delete controls on user B’s article', async ({
  authedPage: page,
  api,
  otherUser,
  trackArticle,
}) => {
  const bArticle = await api.setupArticle(buildArticle(), otherUser.token);
  trackArticle(bArticle.slug, otherUser.token);

  const articlePage = new ArticlePage(page);
  await articlePage.open(bArticle.slug);

  // Anchor: prove we are really on B's article as a signed-in non-owner. Without
  // this, "buttons are hidden" would also pass on an error page or a blank render.
  await expect(articlePage.heading).toHaveText(bArticle.title);
  await expect(articlePage.followButton(otherUser.username)).toBeVisible();

  await expect(articlePage.editButton).toHaveCount(0);
  await expect(articlePage.deleteButton).toHaveCount(0);
});

test('user A cannot open user B’s article in the editor via a direct URL', async ({
  authedPage: page,
  api,
  otherUser,
  trackArticle,
}) => {
  // Hidden buttons are not a control: a user can still type /editor/<slug>.
  // The app's editor checks ownership on load and redirects non-authors home.
  const bArticle = await api.setupArticle(buildArticle(), otherUser.token);
  trackArticle(bArticle.slug, otherUser.token);

  await page.goto(`/editor/${bArticle.slug}`, { waitUntil: 'domcontentloaded' });

  await expect(page).not.toHaveURL(/\/editor\//);
  // And nothing changed server-side.
  const { article } = await (await api.getArticle(bArticle.slug)).json();
  expect(article).toMatchObject({ title: bArticle.title, body: bArticle.body });
});
