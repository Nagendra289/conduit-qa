# Conduit QA — Playwright + TypeScript

Automated test suite for [Conduit](https://conduit.bondaracademy.com), the RealWorld Angular SPA, built for the GSP QA Engineer (Automation) assessment.

- **Part 1 (build):** this repository.
- **Part 2 (think):** [`docs/GSP-test-strategy.md`](docs/GSP-test-strategy.md).

## Quick start

Requires Node 20+.

```bash
npm ci
npx playwright install chromium
npm test                 # everything (api + e2e)
npm run test:api         # REST tests only, no browser
npm run test:e2e         # browser journeys only
npm run report           # open the last HTML report
```

Useful while debugging:

```bash
npx playwright test --ui                         # watch mode with time-travel
npx playwright test tests/e2e/auth.spec.ts --debug
npx playwright test --repeat-each=5 --workers=4  # prove independence / hunt flakes
npx playwright show-trace test-results/<test>/trace.zip
```

Targets are configurable (defaults point at the hosted demo). Copy `.env.example` to `.env` or export:

| Variable   | Default                                        |
| ---------- | ---------------------------------------------- |
| `BASE_URL` | `https://conduit.bondaracademy.com`            |
| `API_URL`  | `https://conduit-api.bondaracademy.com/api`    |

## What is covered (17 tests)

| Area | File | What it proves |
| --- | --- | --- |
| Sign-up (UI) | `tests/e2e/auth.spec.ts` | New visitor registers, lands signed in; the stored JWT authenticates as *that* user via the API |
| Sign-in (UI) | `tests/e2e/auth.spec.ts` | API-created user signs in; wrong password shows an error and leaves no session |
| Article lifecycle (UI) | `tests/e2e/article-lifecycle.spec.ts` | Create → verify → edit → verify → delete, each step checked in the UI **and** in the backend |
| Permissions (UI) | `tests/e2e/permissions.spec.ts` | A sees no Edit/Delete on B's article; a direct `/editor/<slug>` deep link is refused |
| Users API | `tests/api/users.api.spec.ts` | Register (201), duplicate (409/422), login, wrong password, auth-required endpoint |
| Articles API CRUD | `tests/api/articles.api.spec.ts` | 201 → 200 → 200 → 204 → 404 with payload assertions, persistence re-read, anonymous create rejected |
| Permissions API | `tests/api/permissions.api.spec.ts` | A gets **403** on update/delete of B's article, B's data unchanged, anonymous gets 401, owner positive control |

## How the suite is organised

```
src/
  api/ConduitApi.ts      REST client: raw calls (for assertions) + setup helpers (for fixtures)
  data/factories.ts      unique test data builders (users, articles)
  fixtures/test.ts       shared Playwright fixtures: api, user, otherUser, authedPage, userArticle, trackArticle
  pages/                 page objects: NavBar, AuthPage, EditorPage, ArticlePage
tests/
  api/                   project "api"  — no browser
  e2e/                   project "e2e"  — Chromium
.github/workflows/       CI
docs/                    Part 2 (GSP strategy)
tools/stub-api.js        offline RealWorld stand-in with injectable bugs (suite self-check)
```

**Fixtures carry the test-data strategy.** A test asks for what it needs and Playwright builds it through the API:

```ts
test('...', async ({ authedPage, userArticle }) => { ... })
```

- `user` / `otherUser` — a fresh user registered via `POST /users` for every test.
- `authedPage` — a browser already signed in as `user`. The JWT is written to `localStorage["jwtToken"]` with `addInitScript` before the app boots (the key comes from the app's `JwtService`), so no test clicks through a login form unless login *is* the thing under test. The fixture asserts the navbar shows the username, so if injection ever breaks, it fails loudly in one place.
- `userArticle` — an article created via `POST /articles`.
- `trackArticle(slug, token)` — registers anything created during a test (e.g. via the UI) for deletion in teardown, which runs even when the test fails.

**Independence.** Every test creates its own uniquely-named users and articles (`qa<timestamp36><random>`), so any test can run alone, repeatedly, in any order, in parallel (`fullyParallel: true`), and alongside other people using the public demo.

**Waiting, not sleeping.** There are no `waitForTimeout` calls. The suite relies on:
- web-first assertions (`toBeVisible`, `toHaveText`, `toHaveValue`) that auto-retry;
- `waitForResponse` on the actual `POST`/`PUT`/`DELETE` when saving or deleting, so the test continues when the *backend* has confirmed, and reads the real slug from the response;
- navigations use `waitUntil: 'domcontentloaded'`, never the default `load` event. The home feed loads avatars from external hosts, and one slow image once held `load` past 30s during a `--repeat-each=3` run. Readiness is asserted on what the user needs (navbar, heading), not on every image finishing;
- one deliberate guard in the edit flow: wait for the editor to be pre-filled before typing, otherwise Angular's late `patchValue` can overwrite what the test typed.

**Selectors** are role/placeholder/text based (what a user sees), checked against the app's source templates. Two CSS selectors remain (`.banner h1`, `.article-content`) because the app exposes no better hook; in a codebase I owned, I'd add `data-testid`s.

## The permission test — approach

The rule: only an article's author may edit or delete it. I test it at two layers because they prove different things.

1. **API (the real security boundary).** User A sends `PUT` and `DELETE` for B's article with A's own valid token. Three things must hold:
   - the response is **403** — not 401 (A *is* authenticated; 401 would mean ownership was never evaluated) and not 2xx;
   - a follow-up `GET` shows B's article **unchanged / still present** — this catches a backend that answers 403 but has already applied the write;
   - a **positive control**: the owner can perform the same update, so the negative test can't pass just because the endpoint is broken for everyone.
   Anonymous requests are checked separately (401).
2. **UI (user experience).** Signed in as A, open B's article. First assert we really are on B's article as a signed-in non-owner (title visible, "Follow B" button visible) — otherwise "no Edit button" would also pass on a blank or error page. Then assert Edit and Delete are absent. Finally, try the deep link `/editor/<B's slug>`: the app must redirect away, and the API confirms nothing changed.

Hiding buttons is not access control, which is why the UI test alone would not be enough.

## Evidence the assertions catch real bugs

`tools/stub-api.js` is a ~50-line in-memory stand-in that follows the RealWorld spec for users and articles, with switchable bugs. It exists only to check the suite itself — a test that can't fail is worse than no test.

```bash
BUG=ownership npm run stub:api          # terminal 1 (or BUG=fake-delete, or no BUG)
API_URL=http://127.0.0.1:3999/api npm run test:api   # terminal 2
```

| Stub mode | Result |
| --- | --- |
| correct | 11/11 pass; also 33/33 with `--repeat-each=3 --workers=4` (tests are independent) |
| `BUG=ownership` — anyone may update/delete any article | 2 permission tests fail |
| `BUG=fake-delete` — `DELETE` answers 204 but keeps the article | CRUD test fails: "GET after delete → expected 404, received 200" |

Expected status codes were checked against the RealWorld spec's own conformance tests (`specs/api/hurl` in `gothinkster/realworld`).

## CI

`.github/workflows/playwright.yml` runs on every push and pull request, on manual dispatch, and nightly (catches drift on the shared demo when nobody pushed). Steps: `npm ci` → type-check → install Chromium → run both projects in one invocation → upload the HTML report as an artifact (always), plus traces/screenshots/videos on failure. In CI, `forbidOnly` blocks a stray `test.only`, and retries are 2 — retried-then-passed tests are shown as **flaky** in the report, not hidden.

## Known limitations

- **Shared public backend.** The hosted demo is used by many people. Outages, slowness, or rate limiting show up as failures that aren't product bugs. The nightly run makes this visible; the real fix is a self-hosted stack in CI (see below).
- **Users are never deleted.** Conduit has no delete-user endpoint, so each run leaves a handful of uniquely named users behind. Articles are cleaned up.
- **Status-code tolerance in two places.** Duplicate registration accepts 409 *or* 422 (current spec says 409; older backends say 422) and wrong-password login accepts 401 *or* 403. Both are deliberate: either is a correct rejection, and 2xx/5xx still fails. Ownership violations are asserted strictly as 403.
- **Chromium only.** Cross-browser is a config change, left out to keep CI fast.
- **UI token injection** depends on the `jwtToken` localStorage key. That is an implementation detail of the app; if it changes, the `authedPage` fixture fails immediately with a clear message, and the sign-in page object is the fallback.
- **No schema validation** of API responses beyond the fields asserted.

## With one more day

1. Run a **self-hosted RealWorld stack in CI** (Docker service container) for deterministic runs, keeping the hosted demo as a nightly smoke target.
2. **Contract tests**: validate every API response against the RealWorld `openapi.yml` (e.g. with `ajv`), so unexpected fields/types fail even where no test asserts them.
3. **Validation / negative paths**: empty title, oversized body, duplicate tags, invalid slugs, expired/tampered JWT.
4. Extend permissions to **comments, profile settings and favourites**, generated from a single ownership table (the same pattern I describe for GSP in Part 2).
5. **Tagging** (`@smoke`, `@permissions`) and **sharding** so a 2-minute smoke gates every push and the full suite gates merges.
6. **Accessibility** checks (`@axe-core/playwright`) on the core pages.

## Time spent and tooling

- Time spent: **_[fill in honestly]_**
- AI assistance: **_[describe how you used it]_**. I can walk through and defend every line.
