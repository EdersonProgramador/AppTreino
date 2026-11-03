const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { resolve: resolveRequest } = require("metro-resolver");

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
// Hierarchical lookup is required for react-native-web (dist/modules/*) on web.
config.resolver.disableHierarchicalLookup = false;
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  "event-target-shim": path.resolve(projectRoot, "node_modules/event-target-shim"),
  "react-native-web": path.resolve(projectRoot, "node_modules/react-native-web"),
  "react-dom": path.resolve(projectRoot, "node_modules/react-dom")
};

const webShims = {
  "react-native-track-player": "src/shims/react-native-track-player.web.js",
  "react-native-webrtc": "src/shims/react-native-webrtc.web.js",
  "react-native-maps": "src/shims/react-native-maps.web.js"
};

const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const activePlatform = platform ?? context.platform;
  if (activePlatform === "web" && webShims[moduleName]) {
    return {
      filePath: path.resolve(projectRoot, webShims[moduleName]),
      type: "sourceFile"
    };
  }
  if (upstreamResolveRequest) {
    return upstreamResolveRequest(context, moduleName, platform);
  }
  return resolveRequest(context, moduleName, platform);
};

module.exports = config;
