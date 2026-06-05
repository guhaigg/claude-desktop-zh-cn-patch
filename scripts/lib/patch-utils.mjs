import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const repoRoot = path.resolve(__dirname, "..", "..");
export const patchRoot = path.join(repoRoot, "patch", "resources");
export const backupsRoot = path.join(repoRoot, "backups");
export const replacementsPath = path.join(repoRoot, "patch", "hardcoded-replacements.json");
export const sourceTranslationsPath = path.join(repoRoot, "patch", "source-translations.json");

function fileExists(targetPath) {
  try {
    return fs.existsSync(targetPath);
  } catch {
    return false;
  }
}

function statSafe(targetPath) {
  try {
    return fs.statSync(targetPath);
  } catch {
    return null;
  }
}

function isDirectory(targetPath) {
  return statSafe(targetPath)?.isDirectory() ?? false;
}

function compareVersionsDescending(left, right) {
  const leftParts = String(left).match(/\d+/g)?.map(Number) ?? [0];
  const rightParts = String(right).match(/\d+/g)?.map(Number) ?? [0];
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;
    if (leftValue !== rightValue) {
      return rightValue - leftValue;
    }
  }
  return String(right).localeCompare(String(left));
}

export function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const [rawKey, inlineValue] = token.slice(2).split("=", 2);
    const key = rawKey.trim();
    if (!key) {
      continue;
    }

    if (inlineValue !== undefined) {
      parsed[key] = inlineValue;
      continue;
    }

    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      parsed[key] = next;
      index += 1;
    } else {
      parsed[key] = true;
    }
  }
  return parsed;
}

export function readJson(jsonPath) {
  const raw = fs.readFileSync(jsonPath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

export function writeJson(jsonPath, value) {
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(value), "utf8");
}

function isClaudeResourcesDir(resourcesDir) {
  if (!isDirectory(resourcesDir)) {
    return false;
  }
  return fileExists(path.join(resourcesDir, "en-US.json")) &&
    fileExists(path.join(resourcesDir, "ion-dist", "i18n", "en-US.json"));
}

function inferFromInput(inputPath) {
  const resolved = path.resolve(inputPath);
  const candidates = [
    resolved,
    path.join(resolved, "resources"),
    path.join(resolved, "Contents", "Resources"),
  ];

  for (const candidate of candidates) {
    if (isClaudeResourcesDir(candidate)) {
      return candidate;
    }
  }
  return null;
}

function listChildDirectories(parentPath, predicate = () => true) {
  if (!isDirectory(parentPath)) {
    return [];
  }
  return fs.readdirSync(parentPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && predicate(entry.name))
    .map((entry) => path.join(parentPath, entry.name));
}

function getWindowsAppxResourcesDir() {
  try {
    const command = [
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-Command",
      "(Get-AppxPackage -Name 'Claude' -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty InstallLocation)"
    ];
    const output = execFileSync("powershell.exe", command, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();

    if (!output) {
      return null;
    }

    const candidate = path.join(output, "app", "resources");
    return isClaudeResourcesDir(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

function autoResolveWindowsResourcesDir() {
  const appxResources = getWindowsAppxResourcesDir();
  if (appxResources) {
    return appxResources;
  }

  const programFiles = process.env.ProgramFiles;
  if (programFiles) {
    try {
      const windowsApps = path.join(programFiles, "WindowsApps");
      const packageDirs = listChildDirectories(windowsApps, (name) => name.startsWith("Claude_"))
        .sort((left, right) => compareVersionsDescending(path.basename(left), path.basename(right)));
      for (const packageDir of packageDirs) {
        const candidate = path.join(packageDir, "app", "resources");
        if (isClaudeResourcesDir(candidate)) {
          return candidate;
        }
      }
    } catch {
      // Ignore WindowsApps enumeration failures; AppX lookup already tried above.
    }
  }

  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    const anthropicRoot = path.join(localAppData, "AnthropicClaude");
    const appDirs = listChildDirectories(anthropicRoot, (name) => name.startsWith("app-"))
      .sort((left, right) => compareVersionsDescending(path.basename(left), path.basename(right)));
    for (const appDir of appDirs) {
      const candidate = path.join(appDir, "resources");
      if (isClaudeResourcesDir(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

function autoResolveDarwinResourcesDir() {
  const homeDir = os.homedir();
  const candidates = [
    "/Applications/Claude.app/Contents/Resources",
    path.join(homeDir, "Applications", "Claude.app", "Contents", "Resources"),
  ];
  return candidates.find((candidate) => isClaudeResourcesDir(candidate)) ?? null;
}

function autoResolveLinuxResourcesDir() {
  const homeDir = os.homedir();
  const candidates = [
    path.join(homeDir, ".local", "share", "Claude", "resources"),
    path.join(homeDir, ".config", "Claude", "resources"),
    "/opt/Claude/resources",
    "/usr/lib/Claude/resources",
    "/usr/lib64/Claude/resources",
  ];
  return candidates.find((candidate) => isClaudeResourcesDir(candidate)) ?? null;
}

function inferAppRoot(resourcesDir, platform) {
  if (platform === "win32") {
    return path.dirname(resourcesDir);
  }
  if (platform === "darwin") {
    return path.resolve(resourcesDir, "..", "..");
  }
  return path.dirname(resourcesDir);
}

export function resolveClaudeTarget({ appDir, platform = process.platform } = {}) {
  const explicitResources = appDir ? inferFromInput(appDir) : null;
  const resourcesDir = explicitResources ?? (
    platform === "win32"
      ? autoResolveWindowsResourcesDir()
      : platform === "darwin"
        ? autoResolveDarwinResourcesDir()
        : autoResolveLinuxResourcesDir()
  );

  if (!resourcesDir) {
    throw new Error(
      platform === "linux"
        ? "Claude resources directory was not found automatically on Linux. Re-run with --app-dir pointing to the Claude resources/app directory."
        : "Claude resources directory was not found. Re-run with --app-dir pointing to the Claude resources/app directory.",
    );
  }

  return {
    platform,
    resourcesDir,
    appRoot: inferAppRoot(resourcesDir, platform),
  };
}

export function getPatchFileEntries({ forceEnglishSlot = true } = {}) {
  const entries = [
    { relativePath: "zh-CN.json", sourcePath: path.join(patchRoot, "zh-CN.json") },
    { relativePath: path.join("ion-dist", "i18n", "zh-CN.json"), sourcePath: path.join(patchRoot, "ion-dist", "i18n", "zh-CN.json") },
    { relativePath: path.join("ion-dist", "i18n", "statsig", "zh-CN.json"), sourcePath: path.join(patchRoot, "ion-dist", "i18n", "statsig", "zh-CN.json") },
  ];

  if (forceEnglishSlot) {
    entries.push(
      { relativePath: "en-US.json", sourcePath: path.join(patchRoot, "en-US.json") },
      { relativePath: path.join("ion-dist", "i18n", "en-US.json"), sourcePath: path.join(patchRoot, "ion-dist", "i18n", "en-US.json") },
      { relativePath: path.join("ion-dist", "i18n", "statsig", "en-US.json"), sourcePath: path.join(patchRoot, "ion-dist", "i18n", "statsig", "en-US.json") },
    );
  }

  return entries.filter((entry) => fileExists(entry.sourcePath));
}

function sanitizeForBackup(targetPath) {
  const normalized = path.resolve(targetPath).replace(/[:]/g, "_");
  return normalized.split(path.sep).filter(Boolean).join("/");
}

export function createBackupSession({ dryRun = false, backupDir } = {}) {
  const stamp = new Date().toISOString().replaceAll(":", "").replace(/\..+$/, "").replace("T", "-");
  const resolvedBackupDir = backupDir ? path.resolve(backupDir) : path.join(backupsRoot, `claude-desktop-language.${stamp}`);
  if (!dryRun) {
    fs.mkdirSync(path.join(resolvedBackupDir, "original"), { recursive: true });
  }

  return {
    dryRun,
    backupDir: resolvedBackupDir,
    backedUpTargets: new Map(),
    operations: [],
    warnings: [],
  };
}

function backupOriginalIfNeeded(session, targetPath) {
  if (session.backedUpTargets.has(targetPath)) {
    return session.backedUpTargets.get(targetPath);
  }

  const existedBefore = fileExists(targetPath);
  const backupPath = existedBefore ? path.join("original", sanitizeForBackup(targetPath)) : null;
  const metadata = { existedBefore, backupPath };

  if (!session.dryRun && existedBefore && backupPath) {
    const fullBackupPath = path.join(session.backupDir, backupPath);
    fs.mkdirSync(path.dirname(fullBackupPath), { recursive: true });
    fs.copyFileSync(targetPath, fullBackupPath);
  }

  session.backedUpTargets.set(targetPath, metadata);
  return metadata;
}

export function copyPatchedFile(session, { sourcePath, targetPath, relativePath, kind }) {
  const sourceBuffer = fs.readFileSync(sourcePath);
  const currentBuffer = fileExists(targetPath) ? fs.readFileSync(targetPath) : null;

  if (currentBuffer && Buffer.compare(currentBuffer, sourceBuffer) === 0) {
    return { changed: false, targetPath };
  }

  const backup = backupOriginalIfNeeded(session, targetPath);
  if (!session.dryRun) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, sourceBuffer);
  }

  const operation = {
    kind,
    relativePath,
    sourcePath,
    targetPath,
    existedBefore: backup.existedBefore,
    backupPath: backup.backupPath,
  };
  session.operations.push(operation);
  return { changed: true, targetPath, operation };
}

export function loadReplacementEntries() {
  const replacements = readJson(replacementsPath);
  if (!Array.isArray(replacements) || replacements.length < 1) {
    throw new Error(`Replacement list is empty: ${replacementsPath}`);
  }

  for (const entry of replacements) {
    if (!entry || typeof entry.find !== "string" || entry.find.length < 1 || typeof entry.replace !== "string") {
      throw new Error(`Invalid replacement entry in ${replacementsPath}`);
    }
  }

  return [
    ...replacements,
    ...createIntlSourceReplacementEntries(),
  ].sort((left, right) => right.find.length - left.find.length);
}

function createIntlSourceReplacementEntries() {
  if (!fileExists(sourceTranslationsPath)) {
    return [];
  }

  const sourceTranslations = readJson(sourceTranslationsPath);
  const entries = [];
  const intlStringProps = [
    "defaultMessage",
    "label",
    "title",
    "description",
    "placeholder",
    "children",
  ];

  for (const [englishValue, chineseValue] of Object.entries(sourceTranslations)) {
    if (
      typeof englishValue !== "string" ||
      typeof chineseValue !== "string" ||
      englishValue === chineseValue ||
      englishValue.length < 1
    ) {
      continue;
    }

    const englishLiteral = JSON.stringify(englishValue);
    const chineseLiteral = JSON.stringify(chineseValue);
    for (const propName of intlStringProps) {
      entries.push({
        find: `${propName}:${englishLiteral}`,
        replace: `${propName}:${chineseLiteral}`,
      });
    }
  }

  return entries;
}

export function applyHardcodedReplacements(session, resourcesDir, replacements) {
  const assetRoot = path.join(resourcesDir, "ion-dist", "assets", "v1");
  if (!isDirectory(assetRoot)) {
    throw new Error(`Asset directory not found: ${assetRoot}`);
  }

  const matchedPhrases = new Set();
  const changedFiles = [];
  const jsFiles = fs.readdirSync(assetRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
    .map((entry) => path.join(assetRoot, entry.name));

  for (const filePath of jsFiles) {
    const originalText = fs.readFileSync(filePath, "utf8");
    let nextText = originalText;
    const applied = [];

    for (const entry of replacements) {
      if (!nextText.includes(entry.find)) {
        continue;
      }
      const parts = nextText.split(entry.find);
      const occurrences = parts.length - 1;
      if (occurrences < 1) {
        continue;
      }
      nextText = parts.join(entry.replace);
      applied.push({ find: entry.find, replace: entry.replace, count: occurrences });
      matchedPhrases.add(entry.find);
    }

    if (nextText === originalText) {
      continue;
    }

    const relativePath = path.relative(resourcesDir, filePath);
    const backup = backupOriginalIfNeeded(session, filePath);
    if (!session.dryRun) {
      fs.writeFileSync(filePath, nextText, "utf8");
    }

    const operation = {
      kind: "hardcoded-rewrite",
      relativePath,
      targetPath: filePath,
      existedBefore: backup.existedBefore,
      backupPath: backup.backupPath,
      replacements: applied,
    };
    session.operations.push(operation);
    changedFiles.push(operation);
  }

  return {
    assetRoot,
    changedFiles,
    matchedPhrases: [...matchedPhrases].sort(),
    unmatchedPhrases: replacements.map((entry) => entry.find).filter((phrase) => !matchedPhrases.has(phrase)),
  };
}

export function finalizeBackupSession(session, metadata) {
  if (session.dryRun) {
    return;
  }

  const manifestPath = path.join(session.backupDir, "restore-manifest.json");
  writeJson(manifestPath, {
    ...metadata,
    createdAt: new Date().toISOString(),
    operations: session.operations,
    warnings: session.warnings,
  });
}

export function updateLocaleConfigs(session, { platform = process.platform, locale = "zh-CN" } = {}) {
  const homeDir = os.homedir();
  const configPaths = platform === "win32"
    ? [
      path.join(process.env.LOCALAPPDATA ?? "", "Claude-3p", "config.json"),
      path.join(process.env.APPDATA ?? "", "Claude", "config.json"),
      path.join(process.env.LOCALAPPDATA ?? "", "Claude-3p", "claude_desktop_config.json"),
      path.join(process.env.APPDATA ?? "", "Claude", "claude_desktop_config.json"),
    ]
    : platform === "darwin"
      ? [
        path.join(homeDir, "Library", "Application Support", "Claude", "config.json"),
        path.join(homeDir, "Library", "Application Support", "Claude", "claude_desktop_config.json"),
        path.join(homeDir, "Library", "Application Support", "Claude-3p", "config.json"),
      ]
      : [
        path.join(homeDir, ".config", "Claude", "config.json"),
        path.join(homeDir, ".config", "Claude", "claude_desktop_config.json"),
        path.join(homeDir, ".config", "Claude-3p", "config.json"),
      ];

  const results = [];
  for (const configPath of configPaths.filter(Boolean)) {
    if (!fileExists(configPath)) {
      continue;
    }

    try {
      const raw = fs.readFileSync(configPath, "utf8").replace(/^\uFEFF/, "");
      const parsed = raw.trim() ? JSON.parse(raw) : {};
      const next = { ...parsed, language: locale };
      if (!Object.prototype.hasOwnProperty.call(next, "locale")) {
        next.locale = locale;
      }
      const nextText = JSON.stringify(next);
      const currentText = JSON.stringify(parsed);
      if (currentText === nextText) {
        results.push({ configPath, changed: false });
        continue;
      }

      const backup = backupOriginalIfNeeded(session, configPath);
      if (!session.dryRun) {
        fs.writeFileSync(configPath, nextText, "utf8");
      }

      session.operations.push({
        kind: "config-update",
        targetPath: configPath,
        existedBefore: backup.existedBefore,
        backupPath: backup.backupPath,
      });
      results.push({ configPath, changed: true });
    } catch (error) {
      session.warnings.push(`Skipped invalid config ${configPath}: ${error.message}`);
      results.push({ configPath, changed: false, skipped: true, reason: error.message });
    }
  }
  return results;
}

export function stopClaude(platform = process.platform) {
  try {
    if (platform === "win32") {
      execFileSync("taskkill.exe", ["/IM", "Claude.exe", "/F"], { stdio: "ignore" });
      return;
    }
    if (platform === "darwin") {
      execFileSync("pkill", ["-x", "Claude"], { stdio: "ignore" });
      return;
    }
    execFileSync("pkill", ["-f", "Claude"], { stdio: "ignore" });
  } catch {
    // Ignore: app may already be closed.
  }
}

export function restartClaude(target) {
  const { platform, appRoot } = target;
  if (platform === "win32") {
    const executable = path.join(appRoot, "Claude.exe");
    if (!fileExists(executable)) {
      return false;
    }
    const child = spawn(executable, [], { detached: true, stdio: "ignore" });
    child.unref();
    return true;
  }

  if (platform === "darwin") {
    try {
      execFileSync("open", ["-a", "Claude"], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

export function findLatestBackupDir() {
  if (!isDirectory(backupsRoot)) {
    return null;
  }
  const backups = listChildDirectories(backupsRoot, (name) => name.startsWith("claude-desktop-language."))
    .sort((left, right) => path.basename(right).localeCompare(path.basename(left)));
  return backups[0] ?? null;
}

export function restoreFromBackup(backupDir) {
  const manifestPath = path.join(backupDir, "restore-manifest.json");
  if (!fileExists(manifestPath)) {
    throw new Error(`Restore manifest not found: ${manifestPath}`);
  }

  const manifest = readJson(manifestPath);
  const operations = Array.isArray(manifest.operations) ? manifest.operations : [];

  for (const operation of operations) {
    const { targetPath, existedBefore, backupPath } = operation;
    if (!targetPath) {
      continue;
    }

    if (!existedBefore) {
      if (fileExists(targetPath)) {
        fs.rmSync(targetPath, { force: true });
      }
      continue;
    }

    const fullBackupPath = backupPath ? path.join(backupDir, backupPath) : null;
    if (!fullBackupPath || !fileExists(fullBackupPath)) {
      throw new Error(`Backup payload missing for ${targetPath}`);
    }

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(fullBackupPath, targetPath);
  }

  return manifest;
}
