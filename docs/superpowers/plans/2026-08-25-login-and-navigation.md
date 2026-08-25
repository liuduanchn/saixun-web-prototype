# Login And Multi-Page Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local demo login and make every sidebar menu open a distinct, useful prototype page while preserving the existing dashboard.

**Architecture:** Keep the existing React single-page shell and use small pure state helpers for authentication and page resolution. Render a shared authenticated layout around page components selected by the active navigation label; use browser localStorage only through injected storage helpers so the behavior is testable without a DOM.

**Tech Stack:** React 19, Vite 6, Phosphor Icons, Node.js built-in test runner, CSS.

**Spec:** `docs/superpowers/specs/2026-08-25-login-and-navigation-design.md`

## Global Constraints

- Preserve the selected “行动优先驾驶舱” deep-navy and electric-blue design direction.
- Use exactly `teacher` and `123456` as the local demonstration credentials.
- Do not add a backend, external authentication service, analytics, telemetry, or network requests.
- Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact.
- Preserve all existing dashboard interactions and responsive behavior.

---

### Task 1: Testable Authentication And Navigation State

**Files:**
- Create: `src/appState.js`
- Create: `tests/app-state.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `authenticate(username, password) -> { ok, user?, error? }`
- Produces: `loadSession(storage) -> user | null`
- Produces: `saveSession(storage, user) -> void`
- Produces: `clearSession(storage) -> void`
- Produces: `resolvePage(label) -> stable page key`

- [ ] **Step 1: Write failing tests** for valid credentials, invalid credentials, stored session recovery, session removal, and every supported navigation label.
- [ ] **Step 2: Run `node --test tests/app-state.test.mjs`** and verify it fails because `src/appState.js` does not exist.
- [ ] **Step 3: Implement the smallest pure helper module** with the exact interfaces above and a fixed allow-list for nine navigation labels.
- [ ] **Step 4: Add `"test:app": "node --test tests/app-state.test.mjs"`** to `package.json`.
- [ ] **Step 5: Run `npm run test:app`** and verify all state tests pass.

### Task 2: Login Gate And Session Lifecycle

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: authentication and storage helpers from Task 1.
- Produces: `LoginScreen` with labeled username/password inputs and error status.
- Produces: authenticated shell state initialized from localStorage.

- [ ] **Step 1: Extend the state test** so storage write failure does not turn valid credentials into a false successful persistent session.
- [ ] **Step 2: Run `npm run test:app`** and confirm the new case fails against the current helper behavior.
- [ ] **Step 3: Implement `LoginScreen`**, initialize auth state through `loadSession`, persist after valid login, and clear on logout.
- [ ] **Step 4: Replace the account menu placeholder exit action** with the real logout callback.
- [ ] **Step 5: Add login-specific responsive CSS** matching the current typography, colors, borders, radii, and focus states.
- [ ] **Step 6: Run `npm run test:app`** and verify the test suite is green.

### Task 3: Distinct Navigation Pages

**Files:**
- Create: `src/pages.jsx`
- Modify: `src/App.jsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `resolvePage(label)` from Task 1.
- Produces: `WorkspacePage({ pageKey, tasks, onNavigate, onToast, onOpenDiagnosis })`.
- Produces: eight non-dashboard views with headings matching the selected navigation item.

- [ ] **Step 1: Add a table-driven state test** proving unknown labels resolve safely to the dashboard.
- [ ] **Step 2: Run `npm run test:app`** and verify the unknown-label assertion fails before updating the resolver.
- [ ] **Step 3: Build the five competition workflow pages** from the existing visual references with realistic prototype data and working primary actions.
- [ ] **Step 4: Build resource, learning-record, and settings pages** using the same shell, density, and status language.
- [ ] **Step 5: Update `App.jsx`** so only the dashboard renders its current workspace and all other labels render `WorkspacePage`.
- [ ] **Step 6: Add shared page CSS and responsive rules** without changing existing dashboard selectors unnecessarily.
- [ ] **Step 7: Run `npm run test:app`** and verify all navigation-state cases pass.

### Task 4: Durable Project Guidance And Verification

**Files:**
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: completed app behavior.
- Produces: durable prototype requirements for future edits.

- [ ] **Step 1: Record the demo login and full-menu navigation requirements** under the selected design direction.
- [ ] **Step 2: Run `npm run test:app`** and confirm all behavior tests pass.
- [ ] **Step 3: Run `npm run test:sites`** and confirm the four existing deployment tests pass.
- [ ] **Step 4: Run `npm run build`** and confirm Vite and Sites preparation complete without errors.
- [ ] **Step 5: Use the in-app browser** to verify invalid login, successful login, all nine menus, refresh persistence, profile outside-click closure, and logout.

