/** Web preview stub — mapas nativos exigem build ou Expo Go no dispositivo. */
const React = require("react");
const { View } = require("react-native");

const MapView = React.forwardRef(function MapViewStub(props, ref) {
  const { style, children, ...rest } = props;
  return React.createElement(
    View,
    {
      ...rest,
      ref,
      style: [{ minHeight: 220, backgroundColor: "#0b101c", borderRadius: 12 }, style]
    },
    children
  );
});

function Marker(props) {
  return React.createElement(View, props);
}

function Polyline() {
  return null;
}

const PROVIDER_GOOGLE = "google";

module.exports = MapView;
module.exports.default = MapView;
module.exports.Marker = Marker;
module.exports.Polyline = Polyline;
module.exports.PROVIDER_GOOGLE = PROVIDER_GOOGLE;
