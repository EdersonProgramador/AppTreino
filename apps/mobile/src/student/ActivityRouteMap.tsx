import { useMemo } from "react";
import { Platform, StyleSheet, View } from "react-native";
import MapView, { Polyline, PROVIDER_GOOGLE, type LatLng, type Region } from "react-native-maps";

type Point = { lat: number; lng: number };

function regionFromPoints(coords: LatLng[]): Region {
  if (!coords.length) {
    return { latitude: -23.5505, longitude: -46.6333, latitudeDelta: 0.02, longitudeDelta: 0.02 };
  }
  if (coords.length === 1) {
    return {
      latitude: coords[0].latitude,
      longitude: coords[0].longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01
    };
  }
  let minLat = coords[0].latitude;
  let maxLat = coords[0].latitude;
  let minLng = coords[0].longitude;
  let maxLng = coords[0].longitude;
  for (const point of coords) {
    minLat = Math.min(minLat, point.latitude);
    maxLat = Math.max(maxLat, point.latitude);
    minLng = Math.min(minLng, point.longitude);
    maxLng = Math.max(maxLng, point.longitude);
  }
  const latDelta = Math.max(0.004, (maxLat - minLat) * 1.6);
  const lngDelta = Math.max(0.004, (maxLng - minLng) * 1.6);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: latDelta,
    longitudeDelta: lngDelta
  };
}

export function ActivityRouteMap({
  points,
  height = 180,
  mapType = "standard",
  is3d = false,
  strokeColor = "#E85D04"
}: {
  points: Point[];
  height?: number;
  mapType?: "standard" | "satellite" | "hybrid";
  is3d?: boolean;
  strokeColor?: string;
}) {
  const coords = useMemo(
    () => points.map((point) => ({ latitude: point.lat, longitude: point.lng })),
    [points]
  );
  const region = useMemo(() => regionFromPoints(coords), [coords]);

  if (coords.length < 1) return null;

  return (
    <View style={[styles.wrap, { height }]}>
      <MapView
        style={styles.fill}
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        mapType={mapType}
        initialRegion={region}
        region={region}
        liteMode={!is3d}
        pitchEnabled={is3d}
        rotateEnabled={false}
        camera={
          is3d
            ? {
                center: { latitude: region.latitude, longitude: region.longitude },
                pitch: 45,
                heading: 0,
                zoom: 15,
                altitude: 800
              }
            : undefined
        }
        scrollEnabled={false}
        zoomEnabled={false}
        toolbarEnabled={false}
        pointerEvents="none"
      >
        {coords.length > 1 ? (
          <Polyline coordinates={coords} strokeColor={strokeColor} strokeWidth={4} lineCap="round" lineJoin="round" />
        ) : null}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#0b1a12"
  },
  fill: { flex: 1 }
});
