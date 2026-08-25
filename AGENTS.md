# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Selected design direction

- Use the first generated concept, "行动优先驾驶舱", as the visual source of truth.
- Preserve the deep navy and electric-blue vocational education identity.
- The core demo interaction is: inspect the highest scoring risk, generate a revision task, and see it appear in this week's task list.
- Require local prototype login with the demonstration credentials `teacher / 123456`; keep authentication frontend-only and do not connect a real identity service.
- Every sidebar item must open a distinct workspace page. Preserve the existing dashboard and use the six images under `视频界面原型` as the visual/content reference for the core competition workflow pages.
