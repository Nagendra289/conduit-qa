/**
 * Test-data factories.
 *
 * Every value is unique per call, so tests never collide with each other
 * (parallel workers), with earlier runs (repeatability), or with other
 * people using the shared public demo instance.
 */

export interface NewUser {
  username: string;
  email: string;
  password: string;
}

export interface NewArticle {
  title: string;
  description: string;
  body: string;
  tagList: string[];
}

/** Short, collision-resistant id: base36 timestamp + 4 random chars (~12 chars). */
export function uniqueId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function buildUser(overrides: Partial<NewUser> = {}): NewUser {
  const id = uniqueId();
  return {
    username: `qa${id}`, // kept short: some Conduit backends cap username length
    email: `qa${id}@example.com`,
    password: `Pw!${id}`,
    ...overrides,
  };
}

export function buildArticle(overrides: Partial<NewArticle> = {}): NewArticle {
  const id = uniqueId();
  return {
    title: `QA article ${id}`,
    description: `Description ${id}`,
    body: `Body text for ${id}. Created by the automated suite.`,
    tagList: [`qa-${id}`],
    ...overrides,
  };
}
