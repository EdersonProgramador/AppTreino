const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

/** @type {import('expo/metro-config').MetroConfig} */
const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Mobile não está no workspace npm; deps ficam em apps/mobile/node_modules.
// Sem isso o Expo sobe o Metro na raiz do monorepo e não acha expo-file-system etc.
config.watchFolders = [projectRoot, monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules")
];
// Nested deps (e.g. abort-controller → event-target-shim@5) are not visible with
// hierarchical lookup disabled — pin event-target-shim@5 as a direct dependency.
config.resolver.disableHierarchicalLookup = true;
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  "event-target-shim": path.resolve(projectRoot, "node_modules/event-target-shim")
};

module.exports = config;
