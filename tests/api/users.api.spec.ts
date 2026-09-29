import { test, expect } from '../../src/fixtures/test';
import { buildUser } from '../../src/data/factories';

test.describe('Users API', () => {
  test('register returns 201 and a usable token for the new user', async ({ api }) => {
    const newUser = buildUser();

    const res = await api.register(newUser);

    expect(res.status()).toBe(201);
    const { user } = await res.json();
    expect(user).toMatchObject({ username: newUser.username, email: newUser.email });
    expect(user.token, 'JWT should be returned').toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(user).not.toHaveProperty('password'); // never echo credentials back

    // The token must actually authenticate as this user — not just "look like" a JWT.
    const me = await api.currentUser(user.token);
    expect(me.status()).toBe(200);
    expect((await me.json()).user.username).toBe(newUser.username);
  });

  test('register rejects a duplicate email with a 4xx conflict and an error body', async ({ api, user }) => {
    const res = await api.register(buildUser({ email: user.email }));

    // Current RealWorld spec says 409; older backends (incl. many deployed demos) return 422.
    // Both are correct "conflict" answers; a 2xx or 5xx is the bug we care about.
    expect([409, 422]).toContain(res.status());
    const body = await res.json();
    expect(Object.keys(body.errors ?? {}).length, 'errors object should explain why').toBeGreaterThan(0);
  });

  test('login returns the same user and a fresh token', async ({ api, user }) => {
    const res = await api.login(user.email, user.password);

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.user).toMatchObject({ username: user.username, email: user.email });
    expect(body.user.token).toBeTruthy();
  });

  test('login with a wrong password is rejected without a token', async ({ api, user }) => {
    const res = await api.login(user.email, `${user.password}-wrong`);

    // RealWorld spec: 401. Some deployed backends answer 403; either is a rejection.
    expect([401, 403]).toContain(res.status());
    expect(JSON.stringify(await res.json())).not.toContain('token');
  });

  test('current-user endpoint requires authentication', async ({ api }) => {
    const res = await api.currentUser();
    expect(res.status()).toBe(401);
  });
});
