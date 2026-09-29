import { APIRequestContext, APIResponse, expect } from '@playwright/test';
import { NewArticle, NewUser } from '../data/factories';

export const API_URL = process.env.API_URL ?? 'https://conduit-api.bondaracademy.com/api';

export interface AuthUser {
  username: string;
  email: string;
  token: string;
  password: string;
}

export interface Article {
  slug: string;
  title: string;
  description: string;
  body: string;
  tagList: string[];
  author: { username: string };
}

/**
 * Thin client over the Conduit REST API.
 *
 * Two layers on purpose:
 *  - raw methods (`register`, `createArticle`, ...) return the APIResponse
 *    untouched, so API tests can assert on status codes and payloads;
 *  - `setup*` helpers assert success and return typed data, used by
 *    fixtures to build state quickly. If setup fails, the error says
 *    "setup failed" rather than surfacing as a confusing UI failure.
 */
export class ConduitApi {
  constructor(private readonly request: APIRequestContext) {}

  private auth(token?: string): Record<string, string> {
    // Conduit uses the non-standard "Token" scheme, not "Bearer".
    return token ? { Authorization: `Token ${token}` } : {};
  }

  // ---------- raw calls ----------

  register(user: NewUser): Promise<APIResponse> {
    return this.request.post(`${API_URL}/users`, { data: { user } });
  }

  login(email: string, password: string): Promise<APIResponse> {
    return this.request.post(`${API_URL}/users/login`, { data: { user: { email, password } } });
  }

  currentUser(token?: string): Promise<APIResponse> {
    return this.request.get(`${API_URL}/user`, { headers: this.auth(token) });
  }

  createArticle(article: NewArticle, token?: string): Promise<APIResponse> {
    return this.request.post(`${API_URL}/articles`, {
      data: { article },
      headers: this.auth(token),
    });
  }

  getArticle(slug: string, token?: string): Promise<APIResponse> {
    return this.request.get(`${API_URL}/articles/${slug}`, { headers: this.auth(token) });
  }

  updateArticle(slug: string, changes: Partial<NewArticle>, token?: string): Promise<APIResponse> {
    return this.request.put(`${API_URL}/articles/${slug}`, {
      data: { article: changes },
      headers: this.auth(token),
    });
  }

  deleteArticle(slug: string, token?: string): Promise<APIResponse> {
    return this.request.delete(`${API_URL}/articles/${slug}`, { headers: this.auth(token) });
  }

  // ---------- setup helpers (assert + return data) ----------

  async setupUser(user: NewUser): Promise<AuthUser> {
    const res = await this.register(user);
    await expectOk(res, 'setup failed: register user');
    const body = await res.json();
    return { ...body.user, password: user.password } as AuthUser;
  }

  async setupArticle(article: NewArticle, token: string): Promise<Article> {
    const res = await this.createArticle(article, token);
    await expectOk(res, 'setup failed: create article');
    return (await res.json()).article as Article;
  }

  /** Best-effort teardown: already-deleted (404) is fine, anything else is logged. */
  async cleanupArticle(slug: string, token: string): Promise<void> {
    const res = await this.deleteArticle(slug, token);
    if (!res.ok() && res.status() !== 404) {
      console.warn(`cleanup: DELETE ${slug} returned ${res.status()}`);
    }
  }
}

/** Assert a 2xx and include the response body in the failure message. */
export async function expectOk(res: APIResponse, context: string): Promise<void> {
  if (!res.ok()) {
    const text = await res.text().catch(() => '<no body>');
    expect(res.ok(), `${context}: HTTP ${res.status()} ${res.url()}\n${text}`).toBe(true);
  }
}
