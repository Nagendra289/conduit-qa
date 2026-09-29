import { Locator, Page } from '@playwright/test';
import { NavBar } from './NavBar';

/** Sign-up (/register) and sign-in (/login) share the same Angular form component. */
export class AuthPage {
  readonly nav: NavBar;
  readonly username: Locator;
  readonly email: Locator;
  readonly password: Locator;
  readonly errors: Locator;

  constructor(private readonly page: Page) {
    this.nav = new NavBar(page);
    this.username = page.getByPlaceholder('Username');
    this.email = page.getByPlaceholder('Email');
    this.password = page.getByPlaceholder('Password');
    this.errors = page.locator('.error-messages');
  }

  async signUp(username: string, email: string, password: string): Promise<void> {
    await this.page.goto('/register', { waitUntil: 'domcontentloaded' });
    await this.username.fill(username);
    await this.email.fill(email);
    await this.password.fill(password);
    await this.page.getByRole('button', { name: /sign up/i }).click();
  }

  async signIn(email: string, password: string): Promise<void> {
    await this.page.goto('/login', { waitUntil: 'domcontentloaded' });
    await this.email.fill(email);
    await this.password.fill(password);
    await this.page.getByRole('button', { name: /sign in/i }).click();
  }
}
