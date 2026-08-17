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
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
