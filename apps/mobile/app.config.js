/**
 * Expo dynamic config — injeta Google Maps API key em android/ios.config.
 * (react-native-maps 1.20.x no SDK 54 não tem config plugin válido.)
 * Defina EXPO_PUBLIC_GOOGLE_MAPS_API_KEY (ou GOOGLE_MAPS_API_KEY) no .env / EAS secrets.
 */
const appJson = require("./app.json");

const googleMapsApiKey =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  process.env.GOOGLE_MAPS_API_KEY ||
  "";

const expo = { ...appJson.expo };

/**
 * HTTP em texto puro só existe para o servidor de dev na LAN. Em build de
 * produção ele é removido: libera MITM e a Apple exige justificativa para
 * NSAllowsArbitraryLoads na revisão da App Store.
 */
const isProductionBuild =
  process.env.EAS_BUILD_PROFILE === "production" || process.env.APP_ENV === "production";

if (isProductionBuild) {
  const { NSAppTransportSecurity, ...iosInfoPlist } = expo.ios.infoPlist || {};
  expo.ios = { ...expo.ios, infoPlist: iosInfoPlist };
  expo.android = { ...expo.android, usesCleartextTraffic: false };
}

if (googleMapsApiKey) {
  expo.android = {
    ...(expo.android || {}),
    config: {
      ...((expo.android && expo.android.config) || {}),
      googleMaps: { apiKey: googleMapsApiKey }
    }
  };
  expo.ios = {
    ...(expo.ios || {}),
    config: {
      ...((expo.ios && expo.ios.config) || {}),
      googleMapsApiKey
    }
  };
}

module.exports = { expo };
