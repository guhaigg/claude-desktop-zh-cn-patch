import fs from "node:fs";
import path from "node:path";
import {
  applyHardcodedReplacements,
  createBackupSession,
  getPatchFileEntries,
  loadReplacementEntries,
  parseArgs,
  patchRoot,
  readJson,
  replacementsPath,
  resolveClaudeTarget,
} from "./lib/patch-utils.mjs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const args = parseArgs(process.argv.slice(2));
const forceEnglishSlot = !Boolean(args["no-force-english-slot"]);

const patchFiles = getPatchFileEntries({ forceEnglishSlot });
assert(patchFiles.length >= 3, "Patch file list is incomplete.");

for (const entry of patchFiles) {
  assert(fs.existsSync(entry.sourcePath), `Missing patch file: ${path.relative(patchRoot, entry.sourcePath)}`);
  readJson(entry.sourcePath);
}

const zhRoot = readJson(path.join(patchRoot, "zh-CN.json"));
const enRoot = readJson(path.join(patchRoot, "en-US.json"));
assert(Object.keys(zhRoot).length === Object.keys(enRoot).length, "Root zh-CN/en-US key count mismatch.");

const zhIon = readJson(path.join(patchRoot, "ion-dist", "i18n", "zh-CN.json"));
const enIon = readJson(path.join(patchRoot, "ion-dist", "i18n", "en-US.json"));
assert(Object.keys(zhIon).length === Object.keys(enIon).length, "Ion zh-CN/en-US key count mismatch.");

const zhStatsig = readJson(path.join(patchRoot, "ion-dist", "i18n", "statsig", "zh-CN.json"));
const enStatsig = readJson(path.join(patchRoot, "ion-dist", "i18n", "statsig", "en-US.json"));
assert(Object.keys(zhStatsig).length === Object.keys(enStatsig).length, "Statsig zh-CN/en-US key count mismatch.");

const replacements = loadReplacementEntries();
assert(fs.existsSync(replacementsPath), "Replacement map is missing.");
assert(replacements.every((entry) => entry.replace.length > 0), "Replacement map contains an empty replacement.");

const secretPattern = /sk-[A-Za-z0-9_-]{30,}/;
for (const targetPath of [
  path.join(patchRoot, "zh-CN.json"),
  path.join(patchRoot, "en-US.json"),
  path.join(patchRoot, "ion-dist", "i18n", "zh-CN.json"),
  path.join(patchRoot, "ion-dist", "i18n", "en-US.json"),
  replacementsPath,
]) {
  const content = fs.readFileSync(targetPath, "utf8");
  assert(!secretPattern.test(content), `Potential secret detected: ${targetPath}`);
}

let dryRunSummary = null;
if (args["app-dir"]) {
  const target = resolveClaudeTarget({ appDir: args["app-dir"] });
  const session = createBackupSession({ dryRun: true });
  const replacementSummary = applyHardcodedReplacements(session, target.resourcesDir, replacements);
  dryRunSummary = {
    target,
    matchedPhrases: replacementSummary.matchedPhrases,
    unmatchedPhrases: replacementSummary.unmatchedPhrases,
    rewrittenAssetFiles: replacementSummary.changedFiles.map((entry) => entry.relativePath),
  };
  assert(dryRunSummary.rewrittenAssetFiles.length > 0, "Dry-run patch found no JS assets to rewrite. Upstream structure may have changed.");
}

console.log(JSON.stringify({
  verifiedPatchFiles: patchFiles.map((entry) => entry.relativePath.replaceAll("\\", "/")),
  replacementCount: replacements.length,
  dryRunSummary,
}, null, 2));
