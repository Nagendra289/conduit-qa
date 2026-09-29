# Part 2 — Testing GSP: coverage, permissions, config safety, stability

GSP's risk is less "a button broke" and more "a rule silently changed": a checklist edit that blocks 40 Canadian applicants, a query that lets an agent see a competitor's students, a rate card that pays the wrong commission. So I think in **workflows, states and permissions**, and treat configuration as something that needs tests of its own.

## 1. Coverage first — the first 8–10 journeys

**Ordering logic:** rank by *impact if broken × likelihood of breaking*, then respect dependencies (you can't test commission until an application can reach enrolment). Impact weights, highest first: data leak / legal exposure → money → a student's application getting stuck → staff productivity.

| # | Journey | Why at this position |
| --- | --- | --- |
| 1 | **Agent data isolation** — agent A cannot see agent B's students via list, search, filters, dashboard counts, exports, direct URL or API | A leak is a contractual and data-protection incident, not a bug. Cheap to automate, catastrophic to miss. |
| 2 | **Happy path, enquiry → enrolment**, one market end to end through all 15 stages | The spine every other test hangs off; proves the pipeline is connected. Built API-first, one UI run. |
| 3 | **Stage-gate rules** — cannot advance without required documents; illegal jumps (enquiry → CAS) rejected; allowed back-transitions work | The pipeline is a state machine; test its transitions, not just its screens. Most config changes land here. |
| 4 | **Per-market document checklists**, parametrised across all 9 markets — each market's required set gates the right stage | Config-driven, so it changes often; one data-driven test covers 9 markets. |
| 5 | **Commission calculation** on enrolment from the agent's rate card (tiers, market, currency, clawback on withdrawal) | Money. Wrong commission damages agent trust and costs real cash. |
| 6 | **Role-restricted actions** — only Staff/Admin can issue an offer, mark visa granted, or approve a document; Agent can upload but not approve | Second half of the permission model: *actions*, not just visibility. |
| 7 | **Admin config change propagates correctly** — edit a checklist / rate card, check new vs in-flight applications behave per the versioning rule | Directly protects against the "Friday change" (section 3). |
| 8 | **Document upload & review loop** — upload, reject with reason, re-upload, approve; the student/agent sees the status | High-volume daily work; failures create support tickets fast. |
| 9 | **Notifications on key transitions** (offer issued, document rejected, CAS ready) go to the right recipients — never to another agent | Wrong recipient = leak; missing mail = stuck student. Assert via a test mailbox. |
| 10 | **Auth & session** — login per role, password reset, session expiry, deactivated agent loses access immediately | Foundation; usually stable, so it ranks lower despite being essential. |

## 2. Provably safe permissions

**Principle:** the expected permissions live in **one reviewable policy table in the test repo**, and tests are *generated* from it. Adding a role, resource or action means adding a row, and any cell without a test fails the build. A regression can't ship silently because nothing about permissions is tested ad hoc.

**Dimensions:** role × resource × action × *ownership scope* × channel.

- **Ownership scope** is what catches the classic bug: *own student* / *another agent's student* / *unassigned* / *student in another market*.
- **Channel**: UI visibility, API, direct URL, search/list, export/report, notifications. Every "deny" is checked at the **API**; the UI is checked for hiding.

**Matrix sketch** (✓ allowed, ✗ must be 403/404, ◐ allowed only within scope):

| Resource / action | Admin | Staff | Agent — own student | Agent — other agent's student |
| --- | --- | --- | --- | --- |
| View student / application | ✓ | ✓ (assigned markets) | ✓ | ✗ **404** (don't confirm it exists) |
| Create application | ✓ | ✓ | ✓ | n/a |
| Upload document | ✓ | ✓ | ✓ | ✗ |
| Approve / reject document | ✓ | ✓ | ✗ | ✗ |
| Advance stage (e.g. issue offer) | ✓ | ✓ | ✗ | ✗ |
| View commission | ✓ | ◐ read-only | ◐ own only | ✗ |
| Edit rate card | ✓ | ✗ | ✗ | ✗ |
| Edit market checklist | ✓ | ✗ | ✗ | ✗ |
| Export student list | ✓ | ◐ assigned | ◐ own only | ✗ |
| Manage users / roles | ✓ | ✗ | ✗ | ✗ |

**How each cell is tested:**

1. **Seed via API** two agents (A, B), each with students in two markets, plus Staff limited to some markets.
2. For every cell, call the endpoint as that role and assert the **exact** status. A deny also asserts **no side effect** (re-read the record) — "403 but the write happened" is a real bug class.
3. For list/search/export/dashboards, assert **absence**: A's results contain none of B's student IDs *and totals/counts match* (a count of 51 when A owns 50 is a leak).
4. **Positive controls** in every group, so "everything returns 403" can't pass as secure.
5. A **coverage check** fails if a new API route appears (from the route table / OpenAPI) that isn't in the policy table — new endpoints are denied by default in tests until someone decides.

This runs on every PR in minutes because it's pure API.

## 3. The Friday config change — Canada's checklist at 5pm

**What can break**

- **In-flight applications get stuck:** a newly required document blocks students at stages they had already passed, or right before a CAS/visa deadline.
- **Applications advance wrongly:** a removed or renamed document un-gates a stage, so an incomplete file reaches the university or visa stage.
- **Broken references:** stage gates, reminder emails, or reports still point at the old document key; already-uploaded files become orphaned.
- **Blast radius beyond Canada:** a shared template or default checklist edited by mistake affects other markets.
- **Agent/student UI:** the checklist renders empty or with duplicates; uploads to the new type fail validation.
- **Downstream:** stage-triggered commission or notification rules fire (or don't) because stages are now reached differently.

**How automation catches it before Monday**

1. **Validate at save time (shift left):** config is data with a schema. On save, a validator checks every gate references an existing document type, no market is left with an empty required set, keys are unique, and flags any change to shared templates. It blocks or warns *before* the change goes live.
2. **Change-triggered run:** the admin save writes an audit event that triggers the CI pipeline (`workflow_dispatch` with `market=CA`) to run the **market-tagged** journeys (#3, #4, #7 above) against staging loaded with a snapshot of **production config**. Results reach Slack in ~15 minutes, not Monday.
3. **Impact report:** a job compares the old and new checklists against current in-flight Canadian applications: "38 applications at stage 9+ would now be missing *Proof of funds*." That's the conversation to have at 5:15pm Friday, not 9am Monday.
4. **Nightly full suite** over the weekend against production-config staging, plus a **synthetic canary application per market** in a sandbox tenant of production that exercises checklist evaluation read-only-ish and alerts on failure.
5. **Process guardrails the tests should push for:** versioned checklists (in-flight applications keep the version they started on unless migrated deliberately), and a preview/approval step for config edits. Automation catches problems; versioning prevents most of them.

## 4. Stability — fast and non-flaky on a data-heavy SPA

1. **Seed through the API, never the UI.** Each test creates exactly the student/application/stage it needs via API or DB factories. UI steps are reserved for what is under test. This is the biggest speed and stability win.
2. **Isolate data per test.** Unique names/IDs per test; per-worker agent accounts; no test depends on another's leftovers or on "the 3rd row". Tests that mutate *global config* run in their own serial project against their own tenant, never in parallel with readers of that config.
3. **Wait on state, never on time.** No sleeps. Wait for the specific network response (`waitForResponse` on the save), then web-first assertions that auto-retry. For Angular, wait for the form to be populated before typing — late `patchValue` is a classic flake.
4. **Stable selectors.** Agree `data-testid`s with developers for key controls; otherwise use roles and labels. Never positional CSS or text that config/i18n can change.
5. **Control what isn't under test.** Stub third parties (email, payment, university/visa portals) at the network boundary; freeze the clock for deadline logic — IST staff vs destination-country time zones is a likely source of date bugs *and* flaky tests.
6. **Parallelism and sharding.** Independent tests allow `fullyParallel` locally and sharding across CI machines. Layer runs: a ~3-minute smoke on every push, full suite on merge, full + cross-browser nightly.
7. **Retries are a signal, not a fix.** Retries only in CI; every retried-then-passed test shows as *flaky* in the report and gets a ticket. A test flaky twice in a week is quarantined with a named owner and a date — it doesn't stay in the gate silently.
8. **Make failures cheap to diagnose.** Traces, screenshots, video and API logs on failure, uploaded as CI artifacts, so debugging is minutes, not reruns.
