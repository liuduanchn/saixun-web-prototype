import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(new URL("./password-hash-utils.test.ps1", import.meta.url));
const parserTestPath = fileURLToPath(new URL("./password-config-script.test.ps1", import.meta.url));
const configScriptPath = fileURLToPath(new URL("../scripts/configure-demo-password.ps1", import.meta.url));
const shell = process.platform === "win32" ? "powershell.exe" : "pwsh";

test("password hash helper works in the available PowerShell runtime", () => {
  const result = spawnSync(shell, ["-NoProfile", "-File", scriptPath], { encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("password configuration script parses in the available PowerShell runtime", () => {
  const result = spawnSync(shell, ["-NoProfile", "-File", parserTestPath, "-ScriptPath", configScriptPath], { encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr || result.stdout);
});
