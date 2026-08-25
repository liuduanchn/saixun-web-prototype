import test from "node:test";
import assert from "node:assert/strict";

import { getSidebarPresentation } from "../src/sidebarState.js";

test("presents an expanded sidebar with a collapse action", () => {
  assert.deepEqual(getSidebarPresentation(false), {
    shellClassName: "app-shell",
    toggleLabel: "收起导航",
    togglePressed: false,
  });
});

test("presents a collapsed sidebar with an expand action", () => {
  assert.deepEqual(getSidebarPresentation(true), {
    shellClassName: "app-shell sidebar-collapsed",
    toggleLabel: "展开导航",
    togglePressed: true,
  });
});
