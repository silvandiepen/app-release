#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = process.env.APP_RELEASE_REPO_ROOT
  ? resolve(process.env.APP_RELEASE_REPO_ROOT)
  : process.cwd();
const releaseScript = resolve(dirname(fileURLToPath(import.meta.url)), "app-release.mjs");
const defaultManifestPath = (() => {
  const releaseConfigPath = resolve(repoRoot, "release.config.json");
  return existsSync(releaseConfigPath) ? releaseConfigPath : resolve(repoRoot, "apps.config.json");
})();

function loadAppManifest(manifestPath = defaultManifestPath) {
  if (!existsSync(manifestPath)) {
    return { apps: [] };
  }
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

function parseArgs(argv) {
  const defaultManifest = loadAppManifest();
  const args = {
    apps: process.env.npm_config_app
      ? [process.env.npm_config_app]
      : process.env.npm_config_apps
        ? process.env.npm_config_apps.split(",").map((value) => value.trim()).filter(Boolean)
        : defaultManifest.apps.map((app) => app.slug ?? app.id).filter(Boolean),
    mode: "all",
    manifest: defaultManifestPath,
    outputRoot: process.env.npm_config_output_root ?? null,
    extra: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const [name, value] = arg.split("=", 2);

    switch (arg) {
    case "--app":
      args.apps = [argv[++index]];
      break;
    case "--apps":
      args.apps = argv[++index].split(",").map((value) => value.trim()).filter(Boolean);
      break;
    case "--mode":
      args.mode = argv[++index];
      break;
    case "--manifest":
      args.manifest = resolve(repoRoot, argv[++index]);
      if (!process.env.npm_config_app && !process.env.npm_config_apps) {
        args.apps = loadAppManifest(args.manifest).apps.map((app) => app.slug ?? app.id).filter(Boolean);
      }
      break;
    case "--output-root":
      args.outputRoot = argv[++index];
      break;
    default:
      if (name === "--app" && value) {
        args.apps = [value];
      } else if (name === "--apps" && value) {
        args.apps = value.split(",").map((entry) => entry.trim()).filter(Boolean);
      } else if (name === "--mode" && value) {
        args.mode = value;
      } else if (name === "--manifest" && value) {
        args.manifest = resolve(repoRoot, value);
        if (!process.env.npm_config_app && !process.env.npm_config_apps) {
          args.apps = loadAppManifest(args.manifest).apps.map((app) => app.slug ?? app.id).filter(Boolean);
        }
      } else if (name === "--output-root" && value) {
        args.outputRoot = value;
      } else if (!arg.startsWith("-")) {
        args.apps = arg.split(",").map((entry) => entry.trim()).filter(Boolean);
      } else {
        args.extra.push(arg);
      }
      break;
    }
  }

  return args;
}

const args = parseArgs(process.argv.slice(2));
const manifest = loadAppManifest(args.manifest);
const manifestDir = dirname(args.manifest);
if (args.apps.length === 0) {
  throw new Error(`No apps configured. Add release.config.json or apps.config.json in ${repoRoot}, or pass --manifest.`);
}

for (const app of args.apps) {
  const appDetails = manifest.apps.find((entry) => (entry.slug ?? entry.id) === app);
  const configPath = appDetails?.releaseConfig ?? appDetails?.config ?? `apps/${app}/release/ios.json`;
  const config = isAbsolute(configPath) ? configPath : resolve(manifestDir, configPath);
  if (!existsSync(config)) {
    throw new Error(`Missing release config for ${app}: ${config}`);
  }

  console.log(`\n== ${app}: ${args.mode} ==`);
  const outputArgs = args.outputRoot ? ["--output", `${args.outputRoot.replace(/\/$/, "")}/${app}`] : [];
  const result = spawnSync(process.execPath, [
    releaseScript,
    "--config", config,
    "--mode", args.mode,
    ...outputArgs,
    ...args.extra
  ], {
    cwd: repoRoot,
    stdio: "inherit"
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
