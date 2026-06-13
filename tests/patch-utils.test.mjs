import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  applyHardcodedReplacements,
  createBackupSession,
  getPatchFileEntries,
} from "../scripts/lib/patch-utils.mjs";

test("getPatchFileEntries skips optional resources missing from the target app", () => {
  const resourcesDir = fs.mkdtempSync(path.join(os.tmpdir(), "claude-patch-resources-"));
  fs.writeFileSync(path.join(resourcesDir, "en-US.json"), "{}");
  fs.mkdirSync(path.join(resourcesDir, "ion-dist", "i18n"), { recursive: true });
  fs.writeFileSync(path.join(resourcesDir, "ion-dist", "i18n", "en-US.json"), "{}");
  fs.mkdirSync(path.join(resourcesDir, "ion-dist", "i18n", "dynamic"), { recursive: true });
  fs.writeFileSync(path.join(resourcesDir, "ion-dist", "i18n", "dynamic", "en-US.json"), "{}");

  const relativePaths = getPatchFileEntries({ forceEnglishSlot: true, resourcesDir })
    .map((entry) => entry.relativePath.replaceAll("\\", "/"));

  assert(relativePaths.includes("zh-CN.json"));
  assert(relativePaths.includes("en-US.json"));
  assert(relativePaths.includes("ion-dist/i18n/zh-CN.json"));
  assert(relativePaths.includes("ion-dist/i18n/en-US.json"));
  assert(!relativePaths.includes("ion-dist/i18n/statsig/zh-CN.json"));
  assert(!relativePaths.includes("ion-dist/i18n/statsig/en-US.json"));
});

test("applyHardcodedReplacements reports assets that are already patched", () => {
  const resourcesDir = fs.mkdtempSync(path.join(os.tmpdir(), "claude-patched-assets-"));
  const assetDir = path.join(resourcesDir, "ion-dist", "assets", "v1");
  fs.mkdirSync(assetDir, { recursive: true });
  fs.writeFileSync(path.join(assetDir, "index.js"), 'button.textContent="清理";');

  const summary = applyHardcodedReplacements(
    createBackupSession({ dryRun: true }),
    resourcesDir,
    [{ find: "Clean Up", replace: "清理" }],
  );

  assert.equal(summary.changedFiles.length, 0);
  assert.deepEqual(
    summary.alreadyPatchedFiles.map((entry) => entry.relativePath.replaceAll("\\", "/")),
    ["ion-dist/assets/v1/index.js"],
  );
});
