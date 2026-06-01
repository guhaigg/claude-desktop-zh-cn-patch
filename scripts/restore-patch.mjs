import { findLatestBackupDir, parseArgs, resolveClaudeTarget, restoreFromBackup, stopClaude } from "./lib/patch-utils.mjs";

const args = parseArgs(process.argv.slice(2));
const backupDir = args["backup-dir"] ? String(args["backup-dir"]) : findLatestBackupDir();

if (!backupDir) {
  throw new Error("Backup directory not found. Re-run with --backup-dir.");
}

const target = resolveClaudeTarget({ appDir: args["app-dir"] });
stopClaude(target.platform);

const manifest = restoreFromBackup(backupDir);
console.log(JSON.stringify({
  restoredFrom: backupDir,
  target,
  restoredFiles: Array.isArray(manifest.operations) ? manifest.operations.length : 0,
  warnings: manifest.warnings ?? [],
}, null, 2));
