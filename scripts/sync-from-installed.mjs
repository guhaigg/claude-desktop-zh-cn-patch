import fs from "node:fs";
import path from "node:path";
import {
  getPatchResourceSets,
  parseArgs,
  patchRoot,
  readJson,
  resolveClaudeTarget,
  writeJson,
} from "./lib/patch-utils.mjs";

const manualTranslationsPath = path.join(patchRoot, "..", "manual-translations.json");
const manualTranslations = fs.existsSync(manualTranslationsPath)
  ? readJson(manualTranslationsPath)
  : {};
const sourceTranslationsPath = path.join(patchRoot, "..", "source-translations.json");
const sourceTranslations = fs.existsSync(sourceTranslationsPath)
  ? readJson(sourceTranslationsPath)
  : {};

function mergeTranslations(baseObject, translatedObject) {
  const result = {};
  let reused = 0;
  let fallback = 0;
  let manual = 0;
  let source = 0;

  for (const [key, englishValue] of Object.entries(baseObject)) {
    if (Object.prototype.hasOwnProperty.call(manualTranslations, key)) {
      result[key] = manualTranslations[key];
      manual += 1;
    } else if (Object.prototype.hasOwnProperty.call(sourceTranslations, englishValue)) {
      result[key] = sourceTranslations[englishValue];
      source += 1;
    } else if (Object.prototype.hasOwnProperty.call(translatedObject, key)) {
      result[key] = translatedObject[key];
      reused += 1;
    } else {
      result[key] = englishValue;
      fallback += 1;
    }
  }

  return { result, reused, fallback, manual, source };
}

function syncOne({ name, basePath, zhPath, enPath }) {
  const baseObject = readJson(basePath);
  const previousZh = fs.existsSync(zhPath) ? readJson(zhPath) : {};
  const previousEn = fs.existsSync(enPath) ? readJson(enPath) : {};

  const zhMerged = mergeTranslations(baseObject, previousZh);
  const enMerged = mergeTranslations(baseObject, previousEn);

  writeJson(zhPath, zhMerged.result);
  writeJson(enPath, enMerged.result);

  return {
    file: name,
    totalKeys: Object.keys(baseObject).length,
    zhFallback: zhMerged.fallback,
    enFallback: enMerged.fallback,
    manualApplied: zhMerged.manual,
    sourceApplied: zhMerged.source,
  };
}

const args = parseArgs(process.argv.slice(2));
const target = resolveClaudeTarget({ appDir: args["app-dir"] });

const summaries = [];
const skipped = [];
for (const resourceSet of getPatchResourceSets()) {
  const basePath = path.join(target.resourcesDir, resourceSet.baseRelativePath);
  if (!fs.existsSync(basePath)) {
    skipped.push({
      file: resourceSet.name,
      reason: `Installed resource not found: ${resourceSet.baseRelativePath.replaceAll("\\", "/")}`,
    });
    continue;
  }

  summaries.push(syncOne({
    name: resourceSet.name,
    basePath,
    zhPath: path.join(patchRoot, resourceSet.zhRelativePath),
    enPath: path.join(patchRoot, resourceSet.enRelativePath),
  }));
}

console.log(JSON.stringify({
  target,
  synced: summaries,
  skipped,
}, null, 2));
