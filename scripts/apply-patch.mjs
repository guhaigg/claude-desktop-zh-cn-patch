import path from "node:path";
import {
  applyHardcodedReplacements,
  copyPatchedFile,
  createBackupSession,
  finalizeBackupSession,
  getPatchFileEntries,
  loadReplacementEntries,
  parseArgs,
  repoRoot,
  resolveClaudeTarget,
  restartClaude,
  stopClaude,
  updateLocaleConfigs,
} from "./lib/patch-utils.mjs";

const args = parseArgs(process.argv.slice(2));
const dryRun = Boolean(args["dry-run"]);
const noRestart = Boolean(args["no-restart"]);
const forceEnglishSlot = !Boolean(args["no-force-english-slot"]);

const target = resolveClaudeTarget({ appDir: args["app-dir"] });
const session = createBackupSession({ dryRun, backupDir: args["backup-dir"] });

if (!dryRun && !noRestart) {
  stopClaude(target.platform);
}

const copiedFiles = [];
for (const entry of getPatchFileEntries({ forceEnglishSlot, resourcesDir: target.resourcesDir })) {
  const result = copyPatchedFile(session, {
    sourcePath: entry.sourcePath,
    targetPath: path.join(target.resourcesDir, entry.relativePath),
    relativePath: entry.relativePath,
    kind: "resource-copy",
  });
  if (result.changed) {
    copiedFiles.push(entry.relativePath);
  }
}

const replacementSummary = applyHardcodedReplacements(
  session,
  target.resourcesDir,
  loadReplacementEntries(),
);

const configResults = updateLocaleConfigs(session, { platform: target.platform });

finalizeBackupSession(session, {
  platform: target.platform,
  appRoot: target.appRoot,
  resourcesDir: target.resourcesDir,
  repoRoot,
});

let restarted = false;
if (!dryRun && !noRestart) {
  restarted = restartClaude(target);
}

const summary = {
  dryRun,
  target,
  backupDir: session.backupDir,
  copiedFiles,
  rewrittenAssetFiles: replacementSummary.changedFiles.map((entry) => entry.relativePath),
  matchedPhrases: replacementSummary.matchedPhrases,
  unmatchedPhrases: replacementSummary.unmatchedPhrases,
  configUpdates: configResults.filter((entry) => entry.changed).map((entry) => entry.configPath),
  warnings: session.warnings,
  restarted,
};

console.log(JSON.stringify(summary, null, 2));
