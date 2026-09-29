import { test, expect } from '../../src/fixtures/test';
import { buildArticle } from '../../src/data/factories';

test.describe('Articles API — CRUD lifecycle', () => {
  test('create → read → update → delete, asserting status and payload at each step', async ({
    api,
    user,
    trackArticle,
  }) => {
    const draft = buildArticle();
    let slug = '';

    await test.step('create returns 201 with the submitted fields and the author', async () => {
      const res = await api.createArticle(draft, user.token);
      expect(res.status()).toBe(201);
      const { article } = await res.json();
      expect(article).toMatchObject({
        title: draft.title,
        description: draft.description,
        body: draft.body,
        author: { username: user.username },
      });
      expect(article.tagList).toEqual(expect.arrayContaining(draft.tagList));
      expect(article.slug).toBeTruthy();
      slug = article.slug;
      trackArticle(slug, user.token); // cleanup even if a later step fails
    });

    await test.step('read returns 200 and the same article', async () => {
      const res = await api.getArticle(slug);
      expect(res.status()).toBe(200);
      const { article } = await res.json();
      expect(article).toMatchObject({ slug, title: draft.title, body: draft.body });
    });

    const changes = { title: `${draft.title} (edited)`, body: 'Updated body from API test' };

    await test.step('update returns 200 with changed fields, untouched fields preserved', async () => {
      const res = await api.updateArticle(slug, changes, user.token);
      expect(res.status()).toBe(200);
      const { article } = await res.json();
      expect(article).toMatchObject({ ...changes, description: draft.description });
      // RealWorld regenerates the slug from the new title; follow the server's answer.
      slug = article.slug;
      trackArticle(slug, user.token);
    });

    await test.step('re-read proves the update was persisted, not just echoed', async () => {
      const res = await api.getArticle(slug);
      expect(res.status()).toBe(200);
      expect((await res.json()).article).toMatchObject(changes);
    });

    await test.step('delete returns 204 and the article is gone (404)', async () => {
      const del = await api.deleteArticle(slug, user.token);
      expect(del.status()).toBe(204);
      const res = await api.getArticle(slug);
      expect(res.status()).toBe(404);
    });
  });

  test('creating an article without authentication is rejected with 401', async ({ api }) => {
    const res = await api.createArticle(buildArticle());
    expect(res.status()).toBe(401);
  });
});
