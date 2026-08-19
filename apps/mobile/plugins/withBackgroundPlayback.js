const { withAndroidManifest, withInfoPlist } = require("expo/config-plugins");

function ensurePermission(androidManifest, permission) {
  const perms = androidManifest.manifest["uses-permission"] ?? [];
  if (!perms.some((item) => item.$?.["android:name"] === permission)) {
    perms.push({ $: { "android:name": permission } });
    androidManifest.manifest["uses-permission"] = perms;
  }
}

/**
 * Garante Background Audio nativo (iOS UIBackgroundModes + permissões Android).
 * O serviço do Track Player entra via autolinking no prebuild.
 */
function withBackgroundPlayback(config) {
  config = withInfoPlist(config, (mod) => {
    const modes = new Set(mod.modResults.UIBackgroundModes ?? []);
    modes.add("audio");
    mod.modResults.UIBackgroundModes = [...modes];
    return mod;
  });

  config = withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults;
    ensurePermission(manifest, "android.permission.WAKE_LOCK");
    ensurePermission(manifest, "android.permission.FOREGROUND_SERVICE");
    ensurePermission(manifest, "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK");
    ensurePermission(manifest, "android.permission.POST_NOTIFICATIONS");
    return mod;
  });

  return config;
}

module.exports = withBackgroundPlayback;
