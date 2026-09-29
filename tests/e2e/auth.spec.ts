import { test, expect } from '../../src/fixtures/test';
import { buildUser } from '../../src/data/factories';
import { AuthPage } from '../../src/pages/AuthPage';

test.describe('Authentication journeys', () => {
  test('a visitor can sign up and lands signed in as that user', async ({ page, api }) => {
    const newUser = buildUser();
    const auth = new AuthPage(page);

    await auth.signUp(newUser.username, newUser.email, newUser.password);

    await auth.nav.expectLoggedInAs(newUser.username);
    await expect(auth.nav.newArticleLink).toBeVisible();

    // Beyond the UI: the session the SPA stored must be a real token for THIS user.
    const token = await page.evaluate(() => window.localStorage.getItem('jwtToken'));
    expect(token, 'SPA should persist a JWT after sign-up').toBeTruthy();
    const me = await api.currentUser(token!);
    expect((await me.json()).user).toMatchObject({ username: newUser.username, email: newUser.email });
  });

  test('an existing user can sign in', async ({ page, user }) => {
    const auth = new AuthPage(page); // `user` was registered via the API, not the UI

    await auth.signIn(user.email, user.password);

    await auth.nav.expectLoggedInAs(user.username);
  });

  test('sign-in with a wrong password shows an error and does not create a session', async ({
    page,
    user,
  }) => {
    const auth = new AuthPage(page);

    await auth.signIn(user.email, 'definitely-wrong');

    await expect(auth.errors).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
    await expect(auth.nav.signInLink).toBeVisible();
    expect(await page.evaluate(() => window.localStorage.getItem('jwtToken'))).toBeFalsy();
  });
});
