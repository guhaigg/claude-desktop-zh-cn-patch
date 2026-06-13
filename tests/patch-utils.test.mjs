import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  applyHardcodedReplacements,
  createBackupSession,
  loadReplacementEntries,
  repoRoot,
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

test("applyHardcodedReplacements does not rewrite intl fallback props from source translations", () => {
  const resourcesDir = fs.mkdtempSync(path.join(os.tmpdir(), "claude-source-replacements-"));
  const assetDir = path.join(resourcesDir, "ion-dist", "assets", "v1");
  fs.mkdirSync(assetDir, { recursive: true });
  const assetPath = path.join(assetDir, "index.js");
  fs.writeFileSync(assetPath, 'const view={defaultMessage:"About",label:"Account"};');

  const summary = applyHardcodedReplacements(
    createBackupSession({ dryRun: false }),
    resourcesDir,
    [],
  );

  assert.equal(summary.changedFiles.length, 0);
  assert.equal(
    fs.readFileSync(assetPath, "utf8"),
    'const view={defaultMessage:"About",label:"Account"};',
  );
});

test("hardcoded replacements do not rewrite route or icon identifiers", () => {
  const resourcesDir = fs.mkdtempSync(path.join(os.tmpdir(), "claude-safe-hardcoded-replacements-"));
  const assetDir = path.join(resourcesDir, "ion-dist", "assets", "v1");
  fs.mkdirSync(assetDir, { recursive: true });
  const assetPath = path.join(assetDir, "index.js");
  fs.writeFileSync(
    assetPath,
    'export{A as ProjectsRoute};const nav={icon:"Projects",label:"Projects",title:"Projects"};',
  );

  const summary = applyHardcodedReplacements(
    createBackupSession({ dryRun: false }),
    resourcesDir,
    loadReplacementEntries(),
  );

  assert.equal(summary.changedFiles.length, 1);
  assert.equal(
    fs.readFileSync(assetPath, "utf8"),
    'export{A as ProjectsRoute};const nav={icon:"Projects",label:"项目",title:"项目"};',
  );
});

test("hardcoded replacements repair partially patched time and token strings", () => {
  const resourcesDir = fs.mkdtempSync(path.join(os.tmpdir(), "claude-partial-hardcoded-replacements-"));
  const assetDir = path.join(resourcesDir, "ion-dist", "assets", "v1");
  fs.mkdirSync(assetDir, { recursive: true });
  const assetPath = path.join(assetDir, "index.js");
  fs.writeFileSync(
    assetPath,
    'if(t<90)return"刚刚";if(t<3600)return`${Math.floor(t/60)}m ago`;if(t<86400)return`${Math.floor(t/3600)}h ago`;if(t<2592e3)return`${Math.floor(t/86400)}d ago`;const msg={defaultMessage:"你已使用约 {times}\\xd7 more tokens than {book}."};',
  );

  const summary = applyHardcodedReplacements(
    createBackupSession({ dryRun: false }),
    resourcesDir,
    loadReplacementEntries(),
  );

  assert.equal(summary.changedFiles.length, 1);
  assert.equal(
    fs.readFileSync(assetPath, "utf8"),
    'if(t<90)return"刚刚";if(t<3600)return`${Math.floor(t/60)} 分钟前`;if(t<86400)return`${Math.floor(t/3600)} 小时前`;if(t<2592e3)return`${Math.floor(t/86400)} 天前`;const msg={defaultMessage:"你使用的令牌约为 {book} 的 {times} 倍。"};',
  );
});

test("source translations do not contain polluted machine-token artifacts", () => {
  const sourceTranslations = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "patch", "source-translations.json"), "utf8"),
  );

  const pollutedEntries = Object.entries(sourceTranslations)
    .filter(([source, translated]) => /[\u3400-\u9fff]/.test(source) || /\[\[(?:T|ICU)\d+/u.test(translated));

  assert.deepEqual(pollutedEntries, []);
});

test("PR translations do not use public-relations mistranslation", () => {
  const manualTranslations = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "patch", "manual-translations.json"), "utf8"),
  );
  const ionZh = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "patch", "resources", "ion-dist", "i18n", "zh-CN.json"), "utf8"),
  );

  assert.equal(manualTranslations["EBcT1W1KuZ"], "创建 PR");
  assert.equal(manualTranslations["VVKfLhPHLQ"], "创建 PR");
  assert.equal(manualTranslations["oIGoNawMHy"], "打开 PR");
  assert.deepEqual(
    Object.entries(ionZh).filter(([, value]) => String(value).includes("公关")),
    [],
  );
});

test("third-party inference settings labels are translated", () => {
  const ionZh = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "patch", "resources", "ion-dist", "i18n", "zh-CN.json"), "utf8"),
  );

  assert.equal(ionZh["on79ZcGd72"], "配置第三方推理");
  assert.equal(ionZh["KtZV9pULgo"], "连接");
  assert.equal(ionZh["Amxb69AvfR"], "选择 Claude Desktop 发送推理请求的位置。");
  assert.equal(ionZh["6T78KTXhBM"], "自定义推理请求头");
  assert.equal(ionZh["0hPFsTuQ1X"], "每次向已配置提供方发送推理请求时都会附带的额外 HTTP 请求头。可用于租户路由、组织 ID、Bedrock Guardrails 等。");
});
