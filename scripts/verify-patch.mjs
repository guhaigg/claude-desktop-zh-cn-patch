import fs from "node:fs";
import path from "node:path";
import {
  applyHardcodedReplacements,
  createBackupSession,
  getPatchFileEntries,
  getPatchResourceSets,
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

const patchFiles = getPatchFileEntries({ forceEnglishSlot: true });
assert(patchFiles.length >= 4, "Patch file list is incomplete.");

for (const entry of patchFiles) {
  assert(fs.existsSync(entry.sourcePath), `Missing patch file: ${path.relative(patchRoot, entry.sourcePath)}`);
  readJson(entry.sourcePath);
}

for (const resourceSet of getPatchResourceSets()) {
  const zhPath = path.join(patchRoot, resourceSet.zhRelativePath);
  const enPath = path.join(patchRoot, resourceSet.enRelativePath);
  const zhExists = fs.existsSync(zhPath);
  const enExists = fs.existsSync(enPath);
  assert(zhExists === enExists, `${resourceSet.name} zh-CN/en-US presence mismatch.`);
  if (!zhExists) {
    continue;
  }

  const zhResource = readJson(zhPath);
  const enResource = readJson(enPath);
  assert(
    Object.keys(zhResource).length === Object.keys(enResource).length,
    `${resourceSet.name} zh-CN/en-US key count mismatch.`,
  );
}

const replacements = loadReplacementEntries();
assert(fs.existsSync(replacementsPath), "Replacement map is missing.");
assert(replacements.every((entry) => entry.replace.length > 0), "Replacement map contains an empty replacement.");

const secretPattern = /sk-[A-Za-z0-9_-]{30,}/;
for (const targetPath of [
  ...patchFiles.map((entry) => entry.sourcePath),
  replacementsPath,
]) {
  const content = fs.readFileSync(targetPath, "utf8");
  assert(!secretPattern.test(content), `Potential secret detected: ${targetPath}`);
}

let dryRunSummary = null;
if (args["app-dir"]) {
  const target = resolveClaudeTarget({ appDir: args["app-dir"] });
  const targetPatchFiles = getPatchFileEntries({
    forceEnglishSlot,
    resourcesDir: target.resourcesDir,
  });
  assert(targetPatchFiles.length >= 4, "Target patch file list is incomplete.");
  const session = createBackupSession({ dryRun: true });
  const replacementSummary = applyHardcodedReplacements(session, target.resourcesDir, replacements);
  dryRunSummary = {
    target,
    patchFiles: targetPatchFiles.map((entry) => entry.relativePath.replaceAll("\\", "/")),
    matchedPhrases: replacementSummary.matchedPhrases,
    alreadyPatchedPhrases: replacementSummary.alreadyPatchedPhrases,
    unmatchedPhrases: replacementSummary.unmatchedPhrases,
    rewrittenAssetFiles: replacementSummary.changedFiles.map((entry) => entry.relativePath),
    alreadyPatchedAssetFiles: replacementSummary.alreadyPatchedFiles.map((entry) => entry.relativePath),
  };
  assert(
    dryRunSummary.rewrittenAssetFiles.length > 0 || dryRunSummary.alreadyPatchedAssetFiles.length > 0,
    "Dry-run patch found no JS assets to rewrite and no already patched JS assets. Upstream structure may have changed.",
  );
}

console.log(JSON.stringify({
  verifiedPatchFiles: patchFiles.map((entry) => entry.relativePath.replaceAll("\\", "/")),
  replacementCount: replacements.length,
  dryRunSummary,
}, null, 2));
