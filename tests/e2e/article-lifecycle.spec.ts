import { test, expect } from '../../src/fixtures/test';
import { buildArticle } from '../../src/data/factories';
import { ArticlePage } from '../../src/pages/ArticlePage';
import { EditorPage } from '../../src/pages/EditorPage';

/**
 * The full article lifecycle through the UI: create → verify → edit → verify → delete.
 * Conduit's equivalent of GSP's lead-to-enrolment journey.
 *
 * Each UI step is verified twice: what the user sees, and what the backend stored
 * (via the API). A UI that renders the draft from local state while the save
 * silently failed would pass a UI-only check — it won't pass this one.
 */
test('article lifecycle: create → edit → verify → delete', async ({
  authedPage: page,
  api,
  user,
  trackArticle,
}) => {
  const editor = new EditorPage(page);
  const articlePage = new ArticlePage(page);
  const draft = buildArticle();
  let slug = '';

  await test.step('create an article through the editor', async () => {
    await editor.openNew();
    await editor.fill(draft);
    const saved = await editor.publish();
    slug = saved.slug;
    trackArticle(slug, user.token);
    await page.waitForURL(`**/article/${slug}`);
  });

  await test.step('the article page shows exactly what was written', async () => {
    await expect(articlePage.heading).toHaveText(draft.title);
    await expect(articlePage.content).toContainText(draft.body);
    await expect(articlePage.tagList).toContainText(draft.tagList[0]);
    await expect(articlePage.editButton).toBeVisible(); // author sees owner controls
  });

  await test.step('the backend stored it with the right author', async () => {
    const res = await api.getArticle(slug);
    expect(res.status()).toBe(200);
    expect((await res.json()).article).toMatchObject({
      title: draft.title,
      body: draft.body,
      author: { username: user.username },
    });
  });

  const edited = { title: `${draft.title} v2`, body: `Edited body ${Date.now()}` };

  await test.step('edit title and body', async () => {
    await articlePage.startEdit();
    // The editor loads the article asynchronously and then patches the form.
    // Waiting for the pre-filled value prevents a race where our typing is
    // overwritten by the late patch — a classic SPA flake.
    await expect(editor.title).toHaveValue(draft.title);
    await editor.title.fill(edited.title);
    await editor.body.fill(edited.body);
    const saved = await editor.publish();
    slug = saved.slug; // slug may change with the title
    trackArticle(slug, user.token);
    await page.waitForURL(`**/article/${slug}`);
  });

  await test.step('the edit is visible and persisted', async () => {
    await expect(articlePage.heading).toHaveText(edited.title);
    await expect(articlePage.content).toContainText(edited.body);
    await expect(articlePage.content).not.toContainText(draft.body);
    const { article } = await (await api.getArticle(slug)).json();
    expect(article).toMatchObject({ ...edited, description: draft.description });
  });

  await test.step('delete the article', async () => {
    await articlePage.delete();
    await expect(page).not.toHaveURL(/\/article\//);
  });

  await test.step('the article no longer exists in the backend', async () => {
    expect((await api.getArticle(slug)).status()).toBe(404);
  });
});
