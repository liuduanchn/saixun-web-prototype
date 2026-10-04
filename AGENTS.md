# Project Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable design feedback, preferences, or decisions, record them in `AGENTS.md`.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local build can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Current state (updated 2026-10-04)

The project is **no longer a frontend-only prototype** — it is a full-stack system:

- **Backend** (`server/`): NestJS 11 + Prisma 6, real JWT auth with refresh tokens, multi-tenant isolation, pagination, file upload, notifications, learning events, and OpenAI-compatible LLM calls (currently 赛项解析 / 作品诊断 / 模拟答辩; the goal is for every business module to call the model).
- **Data**: PostgreSQL in local dev, SQLite on the WorkBuddy deployment. The two data layers are **not** interchangeable (SQLite degrades enums to strings, JSON to text).
- **Demo data**: 10 tenants / 11 projects / 41 accounts. Password for all seeded accounts is `123456` (not `123456`).
- **Branches**: `workbuddyDeploy` = single-port self-contained + SQLite (deployed at `https://saixun-cabin.app.workbuddy.host/`); `main` = PostgreSQL + GitHub Pages/Railway.

### Environment quirks (this machine)

- The machine has `http_proxy` set — **`curl` needs `--noproxy '*'`** or every request returns 502.
- Backend port is **17100**, frontend **17200**; Vite `base` is `/saixun-web-prototype/`, so local access must include that prefix.
- Start the frontend with an explicit proxy target: `VITE_PROXY_TARGET=http://127.0.0.1:17100 npx vite --port 17200` (the Vite default target `:8080` is wrong here).
- Windows reserves a shifting port range; before picking a debug port, check `netsh interface ipv4 show excludedportrange protocol=tcp` and stay **above** the highest excluded block.
- `nest build` may be blocked mid-way by a `safe-delete` hook (`genie-trash.exe ETIMEDOUT`), leaving `dist/` emptied. Workaround: `npx tsc -p tsconfig.build.json --outDir dist2 && cp -r dist2/. dist/`.
- `agent-browser open` hangs on this machine. For automated screenshots / DOM assertions, drive headless Chrome over CDP directly (`--remote-debugging-port` + WebSocket).

## Selected design direction

- Visual source of truth: the "行动优先驾驶舱" concept. Preserve the deep navy + electric-blue vocational-education identity.
- **Dark theme only.** `styles.css` still contains a few light-theme leftovers from earlier iterations; when touching a component, check for stray `#fff` / `#f8fafc` / `rgba(15,23,42,…)` values that break contrast on the dark background.
- The core demo interaction is: inspect the highest scoring risk, generate a revision task, and see it appear in this week's task list.
- Login uses real backend auth (`/api/auth/login`) with the seeded credentials `teacher / 123456`. It falls back to `DEMO_MODE` (built-in sample data, login disabled) only when no backend is reachable.
- Every sidebar item must open a distinct workspace page. Students land on 我的任务, teachers on 竞赛项目驾驶舱 — keep the role-based landing correct.
- Project stage is data-driven: read `Project.currentStage` and derive the stage track from it. Never hardcode "作品打磨".
- The top-right notification badge represents real unread items. Keep the notification panel, per-item read state, mark-all-read action, outside-click dismissal, and mutual exclusion with the account menu working together.
- List endpoints return `{ items, total, page, pageSize }`. Always unwrap via `unwrapList()` from `src/shape.js` before calling array methods.

