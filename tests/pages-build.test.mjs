import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const pagesBase = "/saixun-web-prototype/";
const clientDir = fileURLToPath(new URL("../dist/client/", import.meta.url));
const indexPath = path.join(clientDir, "index.html");

test("builds asset URLs that remain valid under the GitHub Pages project path", () => {
  assert.ok(existsSync(indexPath), "dist/client/index.html should exist after the build");

  const html = readFileSync(indexPath, "utf8");
  const assetUrls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((url) => url.includes("/assets/"));

  assert.ok(assetUrls.length > 0, "the built page should reference local assets");
  assert.equal(
    assetUrls.some((url) => url.startsWith("/assets/")),
    false,
    "root-relative asset URLs would break on a project Pages site",
  );

  for (const assetUrl of assetUrls) {
    assert.ok(assetUrl.startsWith(pagesBase), `${assetUrl} should start with ${pagesBase}`);
    const assetPath = path.join(clientDir, assetUrl.slice(pagesBase.length));
    assert.ok(existsSync(assetPath), `${assetUrl} should resolve to a built file`);
  }
});
