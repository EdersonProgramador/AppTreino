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
