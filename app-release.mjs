#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, copyFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";

const repoRoot = process.env.APP_RELEASE_REPO_ROOT
  ? resolve(process.env.APP_RELEASE_REPO_ROOT)
  : process.cwd();
const defaultDerivedRoot = process.env.APP_RELEASE_DERIVED_ROOT ?? "/tmp/sil-app-release";

function usage() {
  console.log(`Usage:
  app-release --config apps/stacks/release/ios.json --mode validate
  app-release --config apps/stacks/release/ios.json --mode screenshots --output ~/Desktop/stacks-shots
  app-release --config apps/stacks/release/ios.json --mode all

Modes:
  preflight            Report what can run and what upload/distribution config is missing.
  validate             Run the app's configured validation command.
  verify               Alias for validate.
  screenshots          Build simulator app and capture configured screenshots.
  site-screenshots     Capture configured screenshots into site/public/screenshots/apps.
  promo-video          Build simulator app and record a 10 second promo video.
  archive              Create an archive and optional IPA export.
  upload-build         Upload a configured IPA with xcrun altool.
  prepare-metadata     Export repo-owned metadata JSON to Fastlane Deliver format.
  upload-metadata      Upload metadata with Fastlane Deliver.
  prepare-screenshots  Copy screenshots into a Fastlane Deliver-compatible folder.
  upload-screenshots   Run fastlane deliver for screenshots only.
  distribute           Upload build and screenshots.
  all                  validate, screenshots, archive, prepare-screenshots.

Flags:
  --config <path>      Required JSON config path.
  --mode <mode>        Default: all.
  --output <path>      Override screenshots/video output directory.
  --skip-validate      Skip validation in all mode.
  --upload            In all mode, also upload build and screenshots.
  --dry-run           Print commands without running side-effect commands.
`);
}

function parseArgs(argv) {
  const args = {
    mode: "all",
    upload: false,
    dryRun: false,
    skipValidate: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
    case "--help":
    case "-h":
      args.help = true;
      break;
    case "--config":
      args.config = argv[++index];
      break;
    case "--mode":
      args.mode = argv[++index];
      break;
    case "--output":
      args.output = argv[++index];
      break;
    case "--upload":
      args.upload = true;
      break;
    case "--dry-run":
      args.dryRun = true;
      break;
    case "--skip-validate":
      args.skipValidate = true;
      break;
    default:
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function loadConfig(configPath) {
  const absolutePath = pathFromRepo(configPath);
  const config = JSON.parse(readFileSync(absolutePath, "utf8"));
  config.__path = absolutePath;
  config.__dir = dirname(absolutePath);
  return config;
}

function pathFromRepo(value) {
  return isAbsolute(value) ? value : resolve(repoRoot, value);
}

function expandPath(value) {
  if (!value) { return value; }
  if (value === "~") { return homedir(); }
  if (value.startsWith("~/")) { return join(homedir(), value.slice(2)); }
  return isAbsolute(value) ? value : resolve(repoRoot, value);
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function commandString(command, args) {
  return [command, ...args.map(shellQuote)].join(" ");
}

function run(command, args = [], options = {}) {
  const cwd = options.cwd ?? repoRoot;
  const env = { ...process.env, ...(options.env ?? {}) };
  console.log(`\n$ ${commandString(command, args)}`);
  if (options.dryRun) {
    return { stdout: "", stderr: "", status: 0 };
  }

  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit"
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} exited with status ${result.status}`);
  }
  return result;
}

function runShell(script, options = {}) {
  run("/bin/bash", ["-lc", script], options);
}

function requireFields(config, fields) {
  for (const field of fields) {
    if (config[field] == null || config[field] === "") {
      throw new Error(`Missing required config field: ${field}`);
    }
  }
}

function iosDir(config) {
  return pathFromRepo(config.iosDir ?? `apps/${config.app}/ios`);
}

function projectPath(config) {
  return pathFromRepo(config.project);
}

function derivedPath(config, name) {
  return resolve(defaultDerivedRoot, config.app, name);
}

function appProductName(config) {
  return config.productName ?? config.scheme;
}

function simulatorAppPath(config) {
  return join(derivedPath(config, "screenshots-derived-data"), "Build/Products/Debug-iphonesimulator", `${appProductName(config)}.app`);
}

function runValidation(config, args) {
  const validation = config.validation ?? {};
  if (validation.command) {
    runShell(validation.command, { cwd: pathFromRepo(validation.cwd ?? "."), dryRun: args.dryRun });
    return;
  }

  const script = validation.script ?? `apps/${config.app}/ios/scripts/validate-local.sh`;
  run(pathFromRepo(script), [], { cwd: repoRoot, dryRun: args.dryRun });
}

function preflight(config, args) {
  const exportOptions = config.archive?.exportOptionsPlist ? pathFromRepo(config.archive.exportOptionsPlist) : null;
  const ipa = expandPath(config.upload?.ipaPath ?? config.archive?.ipaPath ?? exportedIpaPath(config));
  const appleId = config.upload?.appleId ?? config.appleId;
  const apiKeyEnv = config.upload?.apiKeyEnv ?? "APP_STORE_CONNECT_API_KEY_ID";
  const apiIssuerEnv = config.upload?.apiIssuerEnv ?? "APP_STORE_CONNECT_API_ISSUER_ID";

  const rows = [
    ["app", config.app],
    ["scheme", config.scheme],
    ["bundleId", config.bundleId],
    ["project", existsSync(projectPath(config)) ? "ok" : `missing: ${projectPath(config)}`],
    ["validation", config.validation?.command ? "custom command" : (config.validation?.script ?? "default")],
    ["screenshots.outputDir", screenshotOutputDir(config, args)],
    ["siteScreenshots.outputDir", siteScreenshotOutputDir(config)],
    ["promoVideo.outputDir", promoVideoOutputDir(config, args)],
    ["screenshots.enabledScenarios", String((config.screenshots?.scenarios ?? []).filter((scenario) => scenario.enabled !== false).length)],
    ["screenshots.jobsPerDevice", String(countScreenshotJobsPerDevice(config))],
    ["screenshots.budgetPerDevice", String(config.screenshots?.scenarioBudgetPerDevice ?? "not set")],
    ["archive.exportOptionsPlist", exportOptions ? (existsSync(exportOptions) ? `ok: ${exportOptions}` : `missing: ${exportOptions}`) : "missing"],
    ["upload.ipaPath", ipa],
    ["upload.appleId", appleId ? String(appleId) : "missing"],
    [apiKeyEnv, process.env[apiKeyEnv] ? "set" : "missing"],
    [apiIssuerEnv, process.env[apiIssuerEnv] ? "set" : "missing"],
    ["fastlane", commandExists("fastlane") ? "available" : "missing"]
  ];

  for (const [key, value] of rows) {
    console.log(`${key}: ${value}`);
  }

  printRequirementSummary(config, args);

  const canDistribute = requirementsForMode(config, args, "distribute").length === 0;
  const canRunLocalValidation = requirementsForMode(config, args, "validate").length === 0;
  const canTakeScreenshots = requirementsForMode(config, args, "screenshots").length === 0;
  console.log(`canRunLocalValidation: ${canRunLocalValidation ? "yes" : "no"}`);
  console.log(`canTakeScreenshots: ${canTakeScreenshots ? "yes" : "no"}`);
  console.log(`canDistribute: ${canDistribute ? "yes" : "no"}`);
}

function commandExists(command) {
  const result = spawnSync("/bin/bash", ["-lc", `command -v ${shellQuote(command)}`], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "pipe"
  });
  return result.status === 0;
}

function addIssue(issues, module, type, message) {
  issues.push({ module, type, message });
}

function checkFields(issues, module, config, fields) {
  for (const field of fields) {
    if (config[field] == null || config[field] === "") {
      addIssue(issues, module, "config", `Missing required config field: ${field}`);
    }
  }
}

function checkCommand(issues, module, command, hint) {
  if (!commandExists(command)) {
    addIssue(issues, module, "dependency", `Missing command: ${command}${hint ? ` (${hint})` : ""}`);
  }
}

function checkPath(issues, module, label, value) {
  if (!value || !existsSync(value)) {
    addIssue(issues, module, "file", `${label} not found: ${value ?? "not configured"}`);
  }
}

function validationRequirements(config) {
  const issues = [];
  const module = "validate";
  const validation = config.validation ?? {};
  if (validation.command) {
    checkCommand(issues, module, "/bin/bash");
    return issues;
  }

  const script = pathFromRepo(validation.script ?? `apps/${config.app}/ios/scripts/validate-local.sh`);
  checkPath(issues, module, "validation script", script);
  return issues;
}

function xcodeProjectRequirements(config, module, needsBundleId = false) {
  const issues = [];
  checkFields(issues, module, config, needsBundleId
    ? ["app", "scheme", "project", "bundleId"]
    : ["app", "scheme", "project"]);
  if (config.project) {
    checkPath(issues, module, "Xcode project", projectPath(config));
  }
  checkPath(issues, module, "iOS directory", iosDir(config));
  checkCommand(issues, module, "xcodegen", "install with: brew install xcodegen");
  checkCommand(issues, module, "xcodebuild", "install Xcode command line tools");
  return issues;
}

function screenshotRequirements(config, module = "screenshots") {
  const issues = xcodeProjectRequirements(config, module, true);
  if (!config.screenshots) {
    addIssue(issues, module, "config", "Missing screenshots config.");
  }
  checkCommand(issues, module, "xcrun", "install Xcode command line tools");
  return issues;
}

function promoVideoRequirements(config) {
  const module = "promo-video";
  const issues = screenshotRequirements(config, module);
  checkCommand(issues, module, "ffmpeg", "install with: brew install ffmpeg");
  const screenshots = config.screenshots ?? {};
  try {
    const segments = promoSegments(config, screenshots);
    if (segments.some((segment) => ["title", "card", "cta"].includes(segment.type))) {
      checkCommand(issues, module, "magick", "install with: brew install imagemagick");
    }
  } catch (error) {
    addIssue(issues, module, "config", error.message);
  }
  return issues;
}

function archiveRequirements(config) {
  const module = "archive";
  const issues = xcodeProjectRequirements(config, module);
  if (config.archive?.exportOptionsPlist) {
    checkPath(issues, module, "archive.exportOptionsPlist", pathFromRepo(config.archive.exportOptionsPlist));
  }
  return issues;
}

function uploadBuildRequirements(config, args) {
  const module = "upload-build";
  const issues = [];
  const upload = config.upload ?? {};
  checkFields(issues, module, config, ["bundleId"]);
  checkCommand(issues, module, "xcrun", "install Xcode command line tools");
  const apiKeyEnv = upload.apiKeyEnv ?? "APP_STORE_CONNECT_API_KEY_ID";
  const apiIssuerEnv = upload.apiIssuerEnv ?? "APP_STORE_CONNECT_API_ISSUER_ID";
  if (!process.env[apiKeyEnv]) {
    addIssue(issues, module, "config", `Missing environment variable: ${apiKeyEnv}`);
  }
  if (!process.env[apiIssuerEnv]) {
    addIssue(issues, module, "config", `Missing environment variable: ${apiIssuerEnv}`);
  }
  const ipa = expandPath(upload.ipaPath ?? config.archive?.ipaPath ?? exportedIpaPath(config));
  if (!args.dryRun) {
    checkPath(issues, module, "IPA", ipa);
  }
  return issues;
}

function metadataRequirements(config, module = "prepare-metadata") {
  const issues = [];
  const sourceDir = metadataSourceDir(config);
  checkPath(issues, module, "metadata source directory", sourceDir);
  for (const locale of metadataLocales(config)) {
    checkPath(issues, module, `metadata JSON for ${locale}`, join(sourceDir, `${locale}.json`));
  }
  return issues;
}

function uploadMetadataRequirements(config) {
  const module = "upload-metadata";
  const issues = metadataRequirements(config, module);
  checkFields(issues, module, config, ["bundleId"]);
  if (!(config.upload?.appleId ?? config.appleId ?? config.appStoreId)) {
    addIssue(issues, module, "config", "Missing upload.appleId, appleId, or appStoreId in config.");
  }
  checkCommand(issues, module, "fastlane", "install with: brew install fastlane or gem install fastlane");
  return issues;
}

function prepareScreenshotsRequirements(config, args, module = "prepare-screenshots") {
  const issues = [];
  if (!config.screenshots) {
    addIssue(issues, module, "config", "Missing screenshots config.");
    return issues;
  }
  const sourceDir = screenshotOutputDir(config, args);
  checkPath(issues, module, "screenshot output directory", sourceDir);
  return issues;
}

function uploadScreenshotsRequirements(config, args) {
  const module = "upload-screenshots";
  const issues = prepareScreenshotsRequirements(config, args, module);
  checkFields(issues, module, config, ["bundleId"]);
  if (!(config.upload?.appleId ?? config.appleId)) {
    addIssue(issues, module, "config", "Missing upload.appleId or appleId in config.");
  }
  checkCommand(issues, module, "fastlane", "install with: brew install fastlane or gem install fastlane");
  return issues;
}

function dedupeIssues(issues) {
  const seen = new Set();
  return issues.filter((issue) => {
    const key = `${issue.module}|${issue.type}|${issue.message}`;
    if (seen.has(key)) { return false; }
    seen.add(key);
    return true;
  });
}

function requirementsForMode(config, args, mode) {
  switch (mode) {
  case "validate":
  case "verify":
    return validationRequirements(config);
  case "screenshots":
    return screenshotRequirements(config);
  case "site-screenshots":
    return screenshotRequirements(config, "site-screenshots");
  case "promo-video":
    return promoVideoRequirements(config);
  case "archive":
    return archiveRequirements(config);
  case "upload-build":
    return uploadBuildRequirements(config, args);
  case "prepare-metadata":
    return metadataRequirements(config);
  case "upload-metadata":
    return uploadMetadataRequirements(config);
  case "prepare-screenshots":
    return prepareScreenshotsRequirements(config, args);
  case "upload-screenshots":
    return uploadScreenshotsRequirements(config, args);
  case "distribute":
    return dedupeIssues([
      ...uploadBuildRequirements(config, args),
      ...uploadMetadataRequirements(config),
      ...uploadScreenshotsRequirements(config, args)
    ]);
  case "all":
    return dedupeIssues([
      ...(args.skipValidate ? [] : validationRequirements(config)),
      ...screenshotRequirements(config),
      ...archiveRequirements(config),
      ...metadataRequirements(config),
      ...prepareScreenshotsRequirements(config, args),
      ...(args.upload ? [
        ...uploadBuildRequirements(config, args),
        ...uploadMetadataRequirements(config),
        ...uploadScreenshotsRequirements(config, args)
      ] : [])
    ]);
  default:
    return [];
  }
}

function assertModeRequirements(config, args, mode) {
  const issues = requirementsForMode(config, args, mode);
  if (issues.length === 0) { return; }

  console.error(`\n${mode} cannot run. Fix these requirements first:`);
  for (const issue of issues) {
    console.error(`- [${issue.module}] ${issue.type}: ${issue.message}`);
  }
  throw new Error(`Missing ${issues.length} requirement${issues.length === 1 ? "" : "s"} for ${mode}.`);
}

function printRequirementSummary(config, args) {
  const modes = [
    "validate",
    "screenshots",
    "promo-video",
    "archive",
    "prepare-metadata",
    "prepare-screenshots",
    "upload-build",
    "upload-metadata",
    "upload-screenshots"
  ];

  console.log("\nModule requirements:");
  for (const mode of modes) {
    const issues = requirementsForMode(config, args, mode);
    if (issues.length === 0) {
      console.log(`${mode}: ok`);
      continue;
    }
    console.log(`${mode}: missing ${issues.length}`);
    for (const issue of issues) {
      console.log(`  - ${issue.type}: ${issue.message}`);
    }
  }
}

function runXcodegen(config, args) {
  run("xcodegen", ["generate"], { cwd: iosDir(config), dryRun: args.dryRun });
}

function buildSimulatorApp(config, args, device) {
  runXcodegen(config, args);
  const destination = device.udidForBuild ? `platform=iOS Simulator,id=${device.udidForBuild}` : `platform=iOS Simulator,OS=${device.os},name=${device.name}`;
  const quietBuild = config.screenshots?.quietBuild ?? true;
  run("xcodebuild", [
    "build",
    ...(quietBuild ? ["-quiet"] : []),
    "-project", projectPath(config),
    "-scheme", config.scheme,
    "-configuration", config.screenshots?.configuration ?? "Debug",
    "-destination", destination,
    "-derivedDataPath", derivedPath(config, "screenshots-derived-data")
  ], { cwd: iosDir(config), dryRun: args.dryRun });
}

function listSimulators(args) {
  const result = run("xcrun", ["simctl", "list", "devices", "available", "--json"], { capture: true, dryRun: args.dryRun });
  if (args.dryRun) { return []; }
  return JSON.parse(result.stdout).devices;
}

function listDeviceTypes(args) {
  const result = run("xcrun", ["simctl", "list", "devicetypes", "--json"], { capture: true, dryRun: args.dryRun });
  if (args.dryRun) { return []; }
  return JSON.parse(result.stdout).devicetypes;
}

function listRuntimes(args) {
  const result = run("xcrun", ["simctl", "list", "runtimes", "available", "--json"], { capture: true, dryRun: args.dryRun });
  if (args.dryRun) { return []; }
  return JSON.parse(result.stdout).runtimes;
}

function findSimulator(device, args) {
  if (args.dryRun) { return device.udid ?? "DRY-RUN-SIMULATOR"; }
  if (device.udid) { return device.udid; }
  const devicesByRuntime = listSimulators(args);
  for (const [runtime, devices] of Object.entries(devicesByRuntime)) {
    if (!runtime.includes(`iOS-${device.os.replaceAll(".", "-")}`)) { continue; }
    const match = devices.find((candidate) => candidate.name === device.name);
    if (match) { return match.udid; }
  }
  if (device.createIfMissing !== false) {
    return createSimulator(device, args);
  }
  throw new Error(`No available simulator found for ${device.name} iOS ${device.os}. Boot it/create it in Xcode or set devices[].udid.`);
}

function createSimulator(device, args) {
  const deviceType = listDeviceTypes(args).find((candidate) => candidate.name === device.name);
  if (!deviceType) {
    throw new Error(`No simulator device type found for ${device.name}.`);
  }

  const runtime = listRuntimes(args).find((candidate) => candidate.version === device.os && candidate.isAvailable);
  if (!runtime) {
    throw new Error(`No available simulator runtime found for iOS ${device.os}.`);
  }

  const name = device.simulatorName ?? `${device.name} ${device.os} App Release`;
  const result = run("xcrun", ["simctl", "create", name, deviceType.identifier, runtime.identifier], { capture: true, dryRun: args.dryRun });
  return result.stdout.trim();
}

function bootSimulator(udid, args) {
  run("xcrun", ["simctl", "boot", udid], { dryRun: args.dryRun, capture: true, allowFailure: true });
  run("xcrun", ["simctl", "bootstatus", udid, "-b"], { dryRun: args.dryRun });
}

function setStatusBar(udid, statusBar, args) {
  if (!statusBar) { return; }
  const pairs = Object.entries(statusBar).flatMap(([key, value]) => [`--${key}`, String(value)]);
  run("xcrun", ["simctl", "status_bar", udid, "override", ...pairs], { dryRun: args.dryRun });
}

function resetStatusBar(udid, statusBar, args) {
  if (!statusBar) { return; }
  run("xcrun", ["simctl", "status_bar", udid, "clear"], { dryRun: args.dryRun });
}

function eraseSimulator(udid, shouldErase, args) {
  if (!shouldErase) { return; }
  run("xcrun", ["simctl", "shutdown", udid], { dryRun: args.dryRun, capture: true, allowFailure: true });
  run("xcrun", ["simctl", "erase", udid], { dryRun: args.dryRun });
}

function scenarioLaunchArgs(config, locale, scenario) {
  const baseArgs = config.screenshots?.baseLaunchArgs ?? ["--ui-testing"];
  const scenarioArgs = scenario.launchArgs ?? [];
  return [...baseArgs, ...scenarioArgs].map((value) => (
    String(value)
      .replaceAll("{locale}", locale.id ?? locale)
      .replaceAll("{app}", config.app)
  ));
}

function expandTemplate(value, context) {
  return String(value)
    .replaceAll("{locale}", context.locale)
    .replaceAll("{appLanguage}", context.appLanguage ?? context.locale)
    .replaceAll("{app}", context.app)
    .replaceAll("{colorMode}", context.colorMode.id)
    .replaceAll("{scenario}", context.scenario.id)
    .replaceAll("{level}", context.level == null ? "" : String(context.level))
    .replaceAll("{device}", context.device.displayType ?? context.device.name?.replaceAll(" ", "-") ?? "")
    .replaceAll("{deviceName}", context.device.name ?? context.device.displayType ?? "")
    .replaceAll("{deviceSlug}", slug(context.device.name ?? context.device.displayType ?? ""));
}

function expandLaunchArgs(config, locale, scenario, colorMode, level) {
  const context = {
    app: config.app,
    locale: locale.id,
    appLanguage: locale.appLanguage,
    scenario,
    colorMode,
    level,
    device: {}
  };
  return scenarioLaunchArgs(config, locale, scenario)
    .concat(colorMode.launchArgs ?? [])
    .concat(level == null ? [] : (scenario.levelLaunchArgs ?? ["--level", "{level}"]))
    .map((value) => expandTemplate(value, context))
    .filter((value) => value !== "");
}

function mergedUserDefaults(...groups) {
  return Object.assign({}, ...groups.filter(Boolean));
}

function expandObjectTemplate(object, context) {
  return Object.fromEntries(Object.entries(object ?? {}).map(([key, value]) => [
    expandTemplate(key, context),
    expandTemplate(value, context)
  ]));
}

function simctlChildEnv(env) {
  return Object.fromEntries(Object.entries(env ?? {}).map(([key, value]) => [
    key.startsWith("SIMCTL_CHILD_") ? key : `SIMCTL_CHILD_${key}`,
    String(value)
  ]));
}

function applyUserDefaults(udid, bundleId, defaults, args) {
  for (const [key, value] of Object.entries(defaults ?? {})) {
    const valueArgs = typeof value === "boolean"
      ? ["-bool", value ? "true" : "false"]
      : typeof value === "number"
        ? ["-int", String(value)]
        : ["-string", String(value)];
    run("xcrun", ["simctl", "spawn", udid, "defaults", "write", bundleId, key, ...valueArgs], { dryRun: args.dryRun });
  }
}

function clearUserDefaults(udid, bundleId, keys, args) {
  for (const key of keys) {
    run("xcrun", ["simctl", "spawn", udid, "defaults", "delete", bundleId, key], { dryRun: args.dryRun, capture: true, allowFailure: true });
  }
}

function normalizeLocales(locales) {
  return locales.map((locale) => {
    if (typeof locale === "string") {
      return { id: locale, appLanguage: locale };
    }
    return {
      id: locale.id,
      appLanguage: locale.appLanguage ?? locale.id
    };
  });
}

function screenshotOutputDir(config, args) {
  const baseDir = expandPath(args.output ?? config.screenshots?.outputDir ?? `artifacts/screenshots/${config.app}`);
  return join(baseDir, "screenshots", releaseVersion(config));
}

function siteScreenshotOutputDir(config) {
  return join(repoRoot, "site/public/screenshots/apps", config.app);
}

function promoVideoOutputDir(config, args) {
  const baseDir = expandPath(args.output ?? config.promoVideo?.outputDir ?? `artifacts/videos/${config.app}`);
  return join(baseDir, "videos", releaseVersion(config));
}

function releaseVersion(config) {
  if (config.releaseVersion) { return String(config.releaseVersion); }

  const projectYml = join(iosDir(config), "project.yml");
  if (existsSync(projectYml)) {
    const match = readFileSync(projectYml, "utf8").match(/MARKETING_VERSION:\s*"?([^"\n]+)"?/);
    if (match) { return match[1].trim(); }
  }

  return "unversioned";
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function countScreenshotJobsPerDevice(config) {
  const screenshots = config.screenshots ?? {};
  const locales = normalizeLocales(screenshots.locales?.length ? screenshots.locales : ["en-US"]);
  const colorModes = screenshots.colorModes?.length ? screenshots.colorModes : [{ id: "default" }];
  const scenarios = (screenshots.scenarios ?? []).filter((scenario) => scenario.enabled !== false);
  return scenarios.reduce((total, scenario) => {
    const scenarioLocales = normalizeLocales(scenario.locales?.length ? scenario.locales : locales);
    const scenarioColorModes = scenario.colorModes?.length
      ? colorModes.filter((colorMode) => scenario.colorModes.includes(colorMode.id))
      : colorModes;
    const levels = scenario.levels?.length ? scenario.levels : [null];
    return total + scenarioLocales.length * scenarioColorModes.length * levels.length;
  }, 0);
}

function captureScreenshots(config, args, options = {}) {
  requireFields(config, ["app", "scheme", "project", "bundleId"]);
  const screenshots = config.screenshots;
  if (!screenshots) {
    throw new Error("Missing screenshots config.");
  }

  const outputDir = options.outputDir ?? screenshotOutputDir(config, args);
  const locales = normalizeLocales(screenshots.locales?.length ? screenshots.locales : ["en-US"]);
  const devices = screenshots.devices?.length ? screenshots.devices : [{ name: "iPhone 16", os: "18.1", displayType: "APP_IPHONE_65" }];
  const colorModes = screenshots.colorModes?.length ? screenshots.colorModes : [{ id: "default" }];
  const scenarios = (screenshots.scenarios?.length ? screenshots.scenarios : [{ id: "home", filename: "01-home.png" }])
    .filter((scenario) => scenario.enabled !== false);
  const budget = screenshots.scenarioBudgetPerDevice;
  const jobsPerDevice = countScreenshotJobsPerDevice(config);
  if (budget != null && jobsPerDevice > budget) {
    throw new Error(`Screenshot config has ${jobsPerDevice} jobs per device, over budget ${budget}.`);
  }

  if (!args.dryRun && options.cleanOutputDir) {
    rmSync(outputDir, { recursive: true, force: true });
  }

  if (!args.dryRun) {
    mkdirSync(outputDir, { recursive: true });
  }

  for (const device of devices) {
    const udid = findSimulator(device, args);
    device.udidForBuild = udid;
    buildSimulatorApp(config, args, device);
    eraseSimulator(udid, screenshots.eraseBeforeCapture ?? false, args);
    bootSimulator(udid, args);
    setStatusBar(udid, screenshots.statusBar, args);
    run("xcrun", ["simctl", "install", udid, simulatorAppPath(config)], { dryRun: args.dryRun });

    for (let index = 0; index < scenarios.length; index += 1) {
      const scenario = scenarios[index];
      const scenarioLocales = normalizeLocales(scenario.locales?.length ? scenario.locales : locales);
      const scenarioColorModes = scenario.colorModes?.length
        ? colorModes.filter((colorMode) => scenario.colorModes.includes(colorMode.id))
        : colorModes;

      for (const locale of scenarioLocales) {
        for (const colorMode of scenarioColorModes) {
          const levels = scenario.levels?.length ? scenario.levels : [null];
          for (const level of levels) {
            const context = { app: config.app, locale: locale.id, appLanguage: locale.appLanguage, colorMode, scenario, level, device };
            const defaults = mergedUserDefaults(screenshots.userDefaults, colorMode.userDefaults, scenario.userDefaults);
            const defaultKeys = Object.keys(defaults);
            clearUserDefaults(udid, config.bundleId, defaultKeys, args);
            applyUserDefaults(udid, config.bundleId, defaults, args);
            const launchEnv = simctlChildEnv(expandObjectTemplate({
              ...screenshots.env,
              ...colorMode.env,
              ...scenario.env
            }, context));

            const launchArgs = expandLaunchArgs(config, locale, scenario, colorMode, level);
            run("xcrun", [
              "simctl", "launch", "--terminate-running-process", udid, config.bundleId, ...launchArgs
            ], { dryRun: args.dryRun, env: launchEnv });

            const waitSeconds = scenario.waitSeconds ?? screenshots.defaultWaitSeconds ?? 2;
            if (!args.dryRun && waitSeconds > 0) {
              Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, waitSeconds * 1000);
            }

            const filenameTemplate = scenario.filename ?? `${String(index + 1).padStart(2, "0")}-{scenario}{level}-{colorMode}.png`;
            const filename = expandTemplate(filenameTemplate, context).replace(/--+/g, "-");
            const targetDir = join(outputDir, slug(device.name ?? device.displayType ?? "device"));
            if (!args.dryRun) {
              mkdirSync(targetDir, { recursive: true });
            }
            run("xcrun", ["simctl", "io", udid, "screenshot", join(targetDir, filename)], { dryRun: args.dryRun });
          }
        }
      }
    }

    resetStatusBar(udid, screenshots.statusBar, args);
  }

  console.log(`\nScreenshots written to ${outputDir}`);
}

function firstEnabledScenario(screenshots, scenarioId) {
  const scenarios = (screenshots.scenarios?.length ? screenshots.scenarios : [{ id: "home", filename: "01-home.png" }])
    .filter((scenario) => scenario.enabled !== false);
  if (scenarioId) {
    const match = scenarios.find((scenario) => scenario.id === scenarioId);
    if (!match) {
      throw new Error(`Promo video scenario not found: ${scenarioId}`);
    }
    return match;
  }
  return scenarios.find((scenario) => scenario.id.includes("progress"))
    ?? scenarios.find((scenario) => scenario.id.includes("level"))
    ?? scenarios[0];
}

function firstMatchingColorMode(screenshots, scenario, colorModeId) {
  const colorModes = screenshots.colorModes?.length ? screenshots.colorModes : [{ id: "default" }];
  const allowed = scenario.colorModes?.length
    ? colorModes.filter((colorMode) => scenario.colorModes.includes(colorMode.id))
    : colorModes;
  if (colorModeId) {
    const match = allowed.find((colorMode) => colorMode.id === colorModeId);
    if (!match) {
      throw new Error(`Promo video color mode not available for ${scenario.id}: ${colorModeId}`);
    }
    return match;
  }
  return allowed.find((colorMode) => colorMode.id === "light") ?? allowed[0];
}

function firstMatchingLocale(screenshots, scenario, localeId) {
  const defaultLocales = normalizeLocales(screenshots.locales?.length ? screenshots.locales : ["en-US"]);
  const locales = normalizeLocales(scenario.locales?.length ? scenario.locales : defaultLocales);
  if (localeId) {
    const match = locales.find((locale) => locale.id === localeId || locale.appLanguage === localeId);
    if (!match) {
      throw new Error(`Promo video locale not available for ${scenario.id}: ${localeId}`);
    }
    return match;
  }
  return locales.find((locale) => locale.appLanguage === "en" || locale.id.startsWith("en")) ?? locales[0];
}

function waitMilliseconds(milliseconds) {
  if (milliseconds > 0) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
  }
}

function recordSimulatorVideo(udid, target, durationSeconds, args) {
  const duration = Math.max(1, Number(durationSeconds));
  const script = `
set -euo pipefail
rm -f ${shellQuote(target)}
xcrun simctl io ${shellQuote(udid)} recordVideo --codec=h264 ${shellQuote(target)} &
recorder_pid=$!
sleep ${duration}
kill -INT "$recorder_pid"
wait "$recorder_pid" || status=$?
status="\${status:-0}"
if [ "$status" -ne 0 ] && [ "$status" -ne 130 ]; then
  exit "$status"
fi
`;
  runShell(script, { dryRun: args.dryRun });
}

function promoDevice(config) {
  const screenshots = config.screenshots ?? {};
  const promo = config.promoVideo ?? {};
  const devices = screenshots.devices?.length ? screenshots.devices : [{ name: "iPhone 16", os: "18.1", displayType: "APP_IPHONE_65" }];
  if (promo.deviceName) {
    const match = devices.find((device) => device.name === promo.deviceName);
    if (!match) {
      throw new Error(`Promo video device not found in screenshots.devices: ${promo.deviceName}`);
    }
    return { ...match };
  }
  return { ...(promo.device ?? devices.find((candidate) => candidate.displayType?.includes("IPHONE")) ?? devices[0]) };
}

function promoAppName(config) {
  return config.name ?? config.scheme ?? config.app;
}

function defaultPromoSegments(config, screenshots) {
  const scenarios = (screenshots.scenarios?.length ? screenshots.scenarios : [{ id: "home", filename: "01-home.png" }])
    .filter((scenario) => scenario.enabled !== false);
  const primary = scenarios.find((scenario) => ["progress", "mid-run", "level", "run-start"].some((id) => scenario.id.includes(id)))
    ?? scenarios[0];
  const secondary = scenarios.find((scenario) => ["win", "summary", "menu"].some((id) => scenario.id.includes(id)))
    ?? scenarios.find((scenario) => scenario !== primary)
    ?? primary;
  const storeLine = config.appStoreUrl ? "Available on the App Store" : "Coming soon on the App Store";
  return [
    { type: "title", durationSeconds: 1.2, title: promoAppName(config), subtitle: config.promoVideo?.subtitle ?? "A focused game." },
    { type: "capture", durationSeconds: 2.8, scenarioId: primary.id },
    { type: "card", durationSeconds: 1.2, title: "Short focused sessions", subtitle: "Clean boards, clear goals." },
    { type: "capture", durationSeconds: 3.2, scenarioId: secondary.id },
    { type: "cta", durationSeconds: 1.6, title: promoAppName(config), subtitle: storeLine }
  ];
}

function promoSegments(config, screenshots) {
  const segments = config.promoVideo?.segments?.length ? config.promoVideo.segments : defaultPromoSegments(config, screenshots);
  const total = segments.reduce((sum, segment) => sum + Number(segment.durationSeconds ?? 0), 0);
  if (Math.abs(total - 10) > 0.05) {
    throw new Error(`Promo video segments must total 10 seconds; got ${total}.`);
  }
  return segments;
}

function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function cssColor(value, fallback) {
  const color = String(value ?? fallback);
  return color.startsWith("0x") ? `#${color.slice(2)}` : color;
}

function promoCardSvg(segment, width, height) {
  const bg = cssColor(segment.backgroundColor, "#F7F3EA");
  const titleColor = cssColor(segment.titleColor, "#1F1B16");
  const subtitleColor = cssColor(segment.subtitleColor, "#645B51");
  const titleSize = Math.round(width * 0.075);
  const subtitleSize = Math.round(width * 0.038);
  const titleY = Math.round(height * 0.45);
  const subtitleY = Math.round(height * 0.53);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${bg}"/>
  <text x="50%" y="${titleY}" text-anchor="middle" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="${titleSize}" font-weight="700" letter-spacing="0" fill="${titleColor}">${xmlEscape(segment.title ?? "")}</text>
  <text x="50%" y="${subtitleY}" text-anchor="middle" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="${subtitleSize}" font-weight="400" letter-spacing="0" fill="${subtitleColor}">${xmlEscape(segment.subtitle ?? "")}</text>
</svg>
`;
}

function createPromoCardClip(segment, target, width, height, args) {
  if (!commandExists("magick")) {
    throw new Error("promo-video card segments require ImageMagick because this FFmpeg build has no drawtext filter. Install it with Homebrew: brew install imagemagick");
  }
  const svg = target.replace(/\.mp4$/, ".svg");
  const png = target.replace(/\.mp4$/, ".png");
  if (!args.dryRun) {
    writeFileSync(svg, promoCardSvg(segment, width, height));
  }
  run("magick", [svg, png], { dryRun: args.dryRun });
  run("ffmpeg", [
    "-y",
    "-framerate", "30",
    "-loop", "1",
    "-i", png,
    "-t", String(segment.durationSeconds),
    "-pix_fmt", "yuv420p",
    "-r", "30",
    "-vf", `scale=${width}:${height},setsar=1`,
    target
  ], { dryRun: args.dryRun });
}

function renderPromoSegment(source, target, durationSeconds, width, height, args) {
  run("ffmpeg", [
    "-y",
    "-stream_loop", "-1",
    "-i", source,
    "-t", String(durationSeconds),
    "-vf", `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1`,
    "-pix_fmt", "yuv420p",
    "-r", "30",
    "-an",
    target
  ], { dryRun: args.dryRun });
}

function concatPromoClips(clips, target, tempDir, args) {
  const concatFile = join(tempDir, "concat.txt");
  const contents = clips.map((clip) => `file '${clip.replaceAll("'", "'\\''")}'`).join("\n");
  if (!args.dryRun) {
    writeFileSync(concatFile, `${contents}\n`);
  }
  run("ffmpeg", [
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", concatFile,
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-r", "30",
    "-an",
    target
  ], { dryRun: args.dryRun });
}

function launchPromoScenario(config, screenshots, udid, segment, args) {
  const scenario = firstEnabledScenario(screenshots, segment.scenarioId);
  const locale = firstMatchingLocale(screenshots, scenario, segment.locale);
  const colorMode = firstMatchingColorMode(screenshots, scenario, segment.colorMode);
  const level = segment.level ?? (scenario.levels?.length ? scenario.levels[0] : null);
  const defaults = mergedUserDefaults(screenshots.userDefaults, colorMode.userDefaults, scenario.userDefaults, segment.userDefaults);
  const defaultKeys = Object.keys(defaults);
  clearUserDefaults(udid, config.bundleId, defaultKeys, args);
  applyUserDefaults(udid, config.bundleId, defaults, args);
  const context = { app: config.app, locale: locale.id, appLanguage: locale.appLanguage, colorMode, scenario, level, device: {} };
  const launchEnv = simctlChildEnv(expandObjectTemplate({
    ...screenshots.env,
    ...colorMode.env,
    ...scenario.env,
    ...segment.env
  }, context));

  const launchArgs = segment.launchArgs ?? expandLaunchArgs(config, locale, scenario, colorMode, level);
  run("xcrun", [
    "simctl", "launch", "--terminate-running-process", udid, config.bundleId, ...launchArgs
  ], { dryRun: args.dryRun, env: launchEnv });

  const waitSeconds = segment.startDelaySeconds ?? scenario.waitSeconds ?? screenshots.defaultWaitSeconds ?? 2;
  if (!args.dryRun) {
    waitMilliseconds(waitSeconds * 1000);
  }
}

function capturePromoVideo(config, args) {
  requireFields(config, ["app", "scheme", "project", "bundleId"]);
  const screenshots = config.screenshots;
  if (!screenshots) {
    throw new Error("Missing screenshots config; promo-video reuses screenshot launch setup.");
  }
  if (!commandExists("ffmpeg")) {
    throw new Error("promo-video requires ffmpeg. Install it with Homebrew: brew install ffmpeg");
  }

  const promo = config.promoVideo ?? {};
  const device = promoDevice(config);
  const segments = promoSegments(config, screenshots);
  const width = promo.width ?? 1290;
  const height = promo.height ?? 2796;
  const outputDir = promoVideoOutputDir(config, args);
  const target = join(outputDir, `${config.app}-10s-promo-${slug(device.name ?? device.displayType ?? "device")}.mp4`);
  const tempDir = join(outputDir, ".tmp", `${config.app}-${slug(device.name ?? device.displayType ?? "device")}`);

  if (!args.dryRun) {
    mkdirSync(outputDir, { recursive: true });
    rmSync(tempDir, { recursive: true, force: true });
    mkdirSync(tempDir, { recursive: true });
  }

  const udid = findSimulator(device, args);
  device.udidForBuild = udid;
  buildSimulatorApp(config, args, device);
  eraseSimulator(udid, promo.eraseBeforeCapture ?? screenshots.eraseBeforeCapture ?? false, args);
  bootSimulator(udid, args);
  setStatusBar(udid, screenshots.statusBar, args);
  run("xcrun", ["simctl", "install", udid, simulatorAppPath(config)], { dryRun: args.dryRun });

  const clips = [];
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const clip = join(tempDir, `${String(index + 1).padStart(2, "0")}-${segment.type}.mp4`);
    if (["title", "card", "cta"].includes(segment.type)) {
      createPromoCardClip(segment, clip, width, height, args);
      clips.push(clip);
      continue;
    }
    if (segment.type !== "capture") {
      throw new Error(`Unknown promo segment type: ${segment.type}`);
    }

    const raw = join(tempDir, `${String(index + 1).padStart(2, "0")}-capture-raw.mp4`);
    launchPromoScenario(config, screenshots, udid, segment, args);
    recordSimulatorVideo(udid, raw, segment.durationSeconds, args);
    renderPromoSegment(raw, clip, segment.durationSeconds, width, height, args);
    clips.push(clip);
  }

  concatPromoClips(clips, target, tempDir, args);
  resetStatusBar(udid, screenshots.statusBar, args);

  console.log(`\nPromo video written to ${target}`);
}

function archivePath(config) {
  return expandPath(config.archive?.archivePath ?? `/tmp/app-release-${config.app}/${config.scheme}.xcarchive`);
}

function exportedIpaPath(config) {
  const exportPath = expandPath(config.archive?.exportPath ?? `/tmp/app-release-${config.app}/export`);
  return config.archive?.ipaPath ? expandPath(config.archive.ipaPath) : join(exportPath, `${appProductName(config)}.ipa`);
}

function createArchive(config, args) {
  requireFields(config, ["app", "scheme", "project"]);
  runXcodegen(config, args);
  run("xcodebuild", [
    "archive",
    "-project", projectPath(config),
    "-scheme", config.scheme,
    "-configuration", config.archive?.configuration ?? "Release",
    "-destination", "generic/platform=iOS",
    "-archivePath", archivePath(config),
    "-derivedDataPath", derivedPath(config, "archive-derived-data"),
    ...(config.archive?.allowProvisioningUpdates ? ["-allowProvisioningUpdates"] : [])
  ], { cwd: iosDir(config), dryRun: args.dryRun });

  if (config.archive?.exportOptionsPlist) {
    const exportPath = expandPath(config.archive.exportPath ?? `/tmp/app-release-${config.app}/export`);
    rmSync(exportPath, { recursive: true, force: true });
    mkdirSync(exportPath, { recursive: true });
    run("xcodebuild", [
      "-exportArchive",
      "-archivePath", archivePath(config),
      "-exportPath", exportPath,
      "-exportOptionsPlist", pathFromRepo(config.archive.exportOptionsPlist),
      ...(config.archive?.allowProvisioningUpdates ? ["-allowProvisioningUpdates"] : [])
    ], { cwd: iosDir(config), dryRun: args.dryRun });
  } else {
    console.log("\nNo archive.exportOptionsPlist configured, so no IPA was exported.");
  }
}

function uploadBuild(config, args) {
  const upload = config.upload ?? {};
  const apiKey = process.env[upload.apiKeyEnv ?? "APP_STORE_CONNECT_API_KEY_ID"];
  const issuer = process.env[upload.apiIssuerEnv ?? "APP_STORE_CONNECT_API_ISSUER_ID"];
  if (!apiKey || !issuer) {
    throw new Error(`Missing App Store Connect API env vars: ${upload.apiKeyEnv ?? "APP_STORE_CONNECT_API_KEY_ID"} and ${upload.apiIssuerEnv ?? "APP_STORE_CONNECT_API_ISSUER_ID"}`);
  }

  const ipa = expandPath(upload.ipaPath ?? config.archive?.ipaPath ?? exportedIpaPath(config));
  if (!existsSync(ipa) && !args.dryRun) {
    throw new Error(`IPA not found: ${ipa}`);
  }

  run("xcrun", [
    "altool",
    "--upload-app",
    "-f", ipa,
    "-t", "ios",
    "--apiKey", apiKey,
    "--apiIssuer", issuer
  ], { dryRun: args.dryRun });
}

const metadataFieldFiles = {
  name: "name.txt",
  subtitle: "subtitle.txt",
  promotional_text: "promotional_text.txt",
  description: "description.txt",
  keywords: "keywords.txt",
  release_notes: "release_notes.txt",
  support_url: "support_url.txt",
  privacy_url: "privacy_url.txt",
  marketing_url: "marketing_url.txt",
  copyright: "copyright.txt"
};

function metadataSourceDir(config) {
  return pathFromRepo(config.metadata?.sourceDir ?? `apps/${config.app}/release/app-store`);
}

function metadataDeliverDir(config) {
  return expandPath(config.metadata?.deliverDir ?? config.upload?.deliverDir ?? `artifacts/app-store/${config.app}`);
}

function metadataLocales(config) {
  return config.metadata?.locales?.length ? config.metadata.locales : ["en-US"];
}

function prepareMetadataForDeliver(config, args) {
  const sourceDir = metadataSourceDir(config);
  const deliverDir = metadataDeliverDir(config);
  const metadataRoot = join(deliverDir, "metadata");

  if (!args.dryRun) {
    rmSync(metadataRoot, { recursive: true, force: true });
  }

  for (const locale of metadataLocales(config)) {
    const source = join(sourceDir, `${locale}.json`);
    if (!existsSync(source) && !args.dryRun) {
      throw new Error(`Metadata JSON not found: ${source}`);
    }
    const data = args.dryRun ? {} : JSON.parse(readFileSync(source, "utf8"));
    const targetDir = join(metadataRoot, locale);
    if (!args.dryRun) {
      mkdirSync(targetDir, { recursive: true });
    }

    for (const [field, filename] of Object.entries(metadataFieldFiles)) {
      const value = data[field];
      if (value == null || String(value).trim() === "") { continue; }
      if (!args.dryRun) {
        writeFileSync(join(targetDir, filename), `${String(value).trim()}\n`);
      }
    }
  }

  console.log(`\nFastlane metadata folder prepared at ${metadataRoot}`);
  return metadataRoot;
}

function uploadMetadata(config, args) {
  const metadataRoot = prepareMetadataForDeliver(config, args);
  const upload = config.upload ?? {};
  const appleId = upload.appleId ?? config.appleId ?? config.appStoreId;
  if (!appleId) {
    throw new Error("Missing upload.appleId, appleId, or appStoreId in config.");
  }

  run("fastlane", [
    "deliver",
    "--app_identifier", config.bundleId,
    "--apple_id", String(appleId),
    "--metadata_path", metadataRoot,
    "--skip_binary_upload", "true",
    "--skip_screenshots", "true",
    "--skip_app_version_update", "true",
    "--submit_for_review", "false",
    "--force", "true"
  ], { cwd: repoRoot, dryRun: args.dryRun });
}

function prepareScreenshotsForDeliver(config, args) {
  const sourceDir = screenshotOutputDir(config, args);
  const deliverDir = expandPath(config.upload?.deliverDir ?? `artifacts/app-store/${config.app}`);
  const screenshotsRoot = join(deliverDir, "screenshots");
  const locales = normalizeLocales(config.screenshots?.locales?.length ? config.screenshots.locales : ["en-US"]);
  const devices = config.screenshots?.devices?.length ? config.screenshots.devices : [{ displayType: "APP_IPHONE_65" }];
  const colorModes = config.screenshots?.colorModes?.length ? config.screenshots.colorModes : [{ id: "default" }];
  const scenarios = (config.screenshots?.scenarios ?? []).filter((scenario) => scenario.enabled !== false);

  if (!args.dryRun) {
    rmSync(screenshotsRoot, { recursive: true, force: true });
  }

  for (const device of devices) {
    const displayType = device.displayType ?? device.name?.replaceAll(" ", "-") ?? "APP_IPHONE_65";
    for (let index = 0; index < scenarios.length; index += 1) {
      const scenario = scenarios[index];
      const scenarioLocales = normalizeLocales(scenario.locales?.length ? scenario.locales : locales);
      const scenarioColorModes = scenario.colorModes?.length
        ? colorModes.filter((colorMode) => scenario.colorModes.includes(colorMode.id))
        : colorModes;

      for (const locale of scenarioLocales) {
        const localeDir = join(screenshotsRoot, locale.id);
        if (!args.dryRun) {
          mkdirSync(localeDir, { recursive: true });
        }

        for (const colorMode of scenarioColorModes) {
          const levels = scenario.levels?.length ? scenario.levels : [null];
          for (const level of levels) {
            const context = { app: config.app, locale: locale.id, appLanguage: locale.appLanguage, colorMode, scenario, level, device };
            const filenameTemplate = scenario.filename ?? `${String(index + 1).padStart(2, "0")}-{scenario}{level}-{colorMode}.png`;
            const filename = expandTemplate(filenameTemplate, context).replace(/--+/g, "-");
            const source = join(sourceDir, slug(device.name ?? device.displayType ?? "device"), filename);
            if (!existsSync(source) && !args.dryRun) {
              throw new Error(`Screenshot not found: ${source}`);
            }
            const levelPart = level == null ? "" : `_level-${level}`;
            const target = join(localeDir, `${String(index + 1).padStart(2, "0")}_${displayType}_${colorMode.id}_${scenario.id}${levelPart}.png`);
            if (!args.dryRun) {
              copyFileSync(source, target);
            }
          }
        }
      }
    }
  }

  console.log(`\nFastlane screenshot folder prepared at ${screenshotsRoot}`);
  return screenshotsRoot;
}

function uploadScreenshots(config, args) {
  const screenshotsRoot = prepareScreenshotsForDeliver(config, args);
  const upload = config.upload ?? {};
  const appleId = upload.appleId ?? config.appleId;
  if (!appleId) {
    throw new Error("Missing upload.appleId or appleId in config.");
  }

  run("fastlane", [
    "deliver",
    "--app_identifier", config.bundleId,
    "--apple_id", String(appleId),
    "--screenshots_path", screenshotsRoot,
    "--skip_binary_upload", "true",
    "--skip_metadata", "true",
    "--skip_app_version_update", "true",
    "--overwrite_screenshots", "true",
    "--submit_for_review", "false",
    "--force", "true"
  ], { cwd: repoRoot, dryRun: args.dryRun });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }
  if (!args.config) {
    usage();
    throw new Error("--config is required.");
  }

  const config = loadConfig(args.config);
  const mode = args.mode;
  if (mode !== "preflight") {
    assertModeRequirements(config, args, mode);
  }

  switch (mode) {
  case "preflight":
    preflight(config, args);
    break;
  case "validate":
  case "verify":
    runValidation(config, args);
    break;
  case "screenshots":
    captureScreenshots(config, args);
    break;
  case "site-screenshots":
    captureScreenshots(config, args, { outputDir: siteScreenshotOutputDir(config), cleanOutputDir: true });
    break;
  case "promo-video":
    capturePromoVideo(config, args);
    break;
  case "archive":
    createArchive(config, args);
    break;
  case "upload-build":
    uploadBuild(config, args);
    break;
  case "prepare-metadata":
    prepareMetadataForDeliver(config, args);
    break;
  case "upload-metadata":
    uploadMetadata(config, args);
    break;
  case "prepare-screenshots":
    prepareScreenshotsForDeliver(config, args);
    break;
  case "upload-screenshots":
    uploadScreenshots(config, args);
    break;
  case "distribute":
    uploadBuild(config, args);
    uploadMetadata(config, args);
    uploadScreenshots(config, args);
    break;
  case "all":
    if (!args.skipValidate) {
      runValidation(config, args);
    }
    captureScreenshots(config, args);
    createArchive(config, args);
    prepareMetadataForDeliver(config, args);
    prepareScreenshotsForDeliver(config, args);
    if (args.upload) {
      uploadBuild(config, args);
      uploadMetadata(config, args);
      uploadScreenshots(config, args);
    }
    break;
  default:
    throw new Error(`Unknown mode: ${mode}`);
  }
}

try {
  main();
} catch (error) {
  console.error(`\nrelease failed: ${error.message}`);
  process.exit(1);
}
