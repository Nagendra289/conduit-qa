import { test, expect } from '../../src/fixtures/test';

/**
 * Ownership rule: only an article's author may edit or delete it.
 *
 * The API is the real security boundary (the UI only hides buttons), so the
 * strongest proof lives here. Each negative check is paired with:
 *  - a state check  — the article is unchanged / still exists afterwards, so a
 *    backend that returns 403 but *still applies the change* is caught;
 *  - a positive control — the owner CAN do the same operation, so the test
 *    can't pass just because the endpoint is broken for everyone.
 *
 * Naming: `user` = owner (B in the brief), `otherUser` = intruder (A in the brief).
 */
test.describe('Article ownership — API', () => {
  test('another user cannot update the article, and it stays unchanged', async ({
    api,
    otherUser,
    userArticle,
  }) => {
    const res = await api.updateArticle(
      userArticle.slug,
      { title: 'hijacked', body: 'hijacked' },
      otherUser.token,
    );

    // 403, not 401: the caller IS authenticated, just not authorised.
    // A 401 here would mean ownership was never checked. (RealWorld spec: 403.)
    expect(res.status()).toBe(403);

    const after = await (await api.getArticle(userArticle.slug)).json();
    expect(after.article).toMatchObject({
      title: userArticle.title,
      body: userArticle.body,
      author: { username: userArticle.author.username },
    });
  });

  test('another user cannot delete the article, and it still exists', async ({
    api,
    otherUser,
    userArticle,
  }) => {
    const res = await api.deleteArticle(userArticle.slug, otherUser.token);

    expect(res.status()).toBe(403);
    expect((await api.getArticle(userArticle.slug)).status()).toBe(200);
  });

  test('anonymous requests cannot update or delete', async ({ api, userArticle }) => {
    expect((await api.updateArticle(userArticle.slug, { title: 'anon' })).status()).toBe(401);
    expect((await api.deleteArticle(userArticle.slug)).status()).toBe(401);
    expect((await api.getArticle(userArticle.slug)).status()).toBe(200);
  });

  test('positive control: the owner can update the same article', async ({
    api,
    user,
    userArticle,
    trackArticle,
  }) => {
    const res = await api.updateArticle(userArticle.slug, { body: 'owner edit' }, user.token);
    expect(res.status()).toBe(200);
    const { article } = await res.json();
    expect(article.body).toBe('owner edit');
    trackArticle(article.slug, user.token);
  });
});
