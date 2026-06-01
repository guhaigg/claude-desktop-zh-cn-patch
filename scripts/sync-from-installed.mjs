import fs from "node:fs";
import path from "node:path";
import {
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

function syncOne({ basePath, zhPath, enPath }) {
  const baseObject = readJson(basePath);
  const previousZh = fs.existsSync(zhPath) ? readJson(zhPath) : {};
  const previousEn = fs.existsSync(enPath) ? readJson(enPath) : {};

  const zhMerged = mergeTranslations(baseObject, previousZh);
  const enMerged = mergeTranslations(baseObject, previousEn);

  writeJson(zhPath, zhMerged.result);
  writeJson(enPath, enMerged.result);

  return {
    file: path.relative(patchRoot, zhPath).replaceAll("\\", "/").replace("/zh-CN.json", ""),
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
summaries.push(syncOne({
  basePath: path.join(target.resourcesDir, "en-US.json"),
  zhPath: path.join(patchRoot, "zh-CN.json"),
  enPath: path.join(patchRoot, "en-US.json"),
}));
summaries.push(syncOne({
  basePath: path.join(target.resourcesDir, "ion-dist", "i18n", "en-US.json"),
  zhPath: path.join(patchRoot, "ion-dist", "i18n", "zh-CN.json"),
  enPath: path.join(patchRoot, "ion-dist", "i18n", "en-US.json"),
}));
summaries.push(syncOne({
  basePath: path.join(target.resourcesDir, "ion-dist", "i18n", "statsig", "en-US.json"),
  zhPath: path.join(patchRoot, "ion-dist", "i18n", "statsig", "zh-CN.json"),
  enPath: path.join(patchRoot, "ion-dist", "i18n", "statsig", "en-US.json"),
}));

console.log(JSON.stringify({
  target,
  synced: summaries,
}, null, 2));
