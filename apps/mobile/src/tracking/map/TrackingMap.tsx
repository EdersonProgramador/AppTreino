import { useEffect, useMemo, useRef } from "react";
import { Platform, StyleSheet, View } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type LatLng, type Region } from "react-native-maps";
import { useLiveMapTrack } from "./useLiveMapTrack";

type Props = {
  followUser?: boolean;
  strokeColor?: string;
  onMapPress?: (coord: { lat: number; lng: number }) => void;
  pickMode?: boolean;
  lapMarker?: { lat: number; lng: number } | null;
  mapType?: "standard" | "satellite" | "hybrid";
  is3d?: boolean;
  heatTracks?: Array<Array<{ lat: number; lng: number }>>;
};

/**
 * Mapa nativo (Google Maps no Android / Apple Maps no iOS).
 * Polyline vem do liveMapStore ← TRACKING_LOCATION_TASK + pipeline filtrado.
 */
export function TrackingMap({
  followUser = true,
  strokeColor = "#E85D04",
  onMapPress,
  pickMode = false,
  lapMarker = null,
  mapType = "standard",
  is3d = false,
  heatTracks = []
}: Props) {
  const mapRef = useRef<MapView>(null);
  const { points, cursor } = useLiveMapTrack();
  const coords: LatLng[] = useMemo(
    () => points.map((p) => ({ latitude: p.lat, longitude: p.lng })),
    [points]
  );

  const initialRegion: Region = useMemo(() => {
    const c = cursor ?? points[points.length - 1];
    return {
      latitude: c?.lat ?? -23.5505,
      longitude: c?.lng ?? -46.6333,
      latitudeDelta: 0.012,
      longitudeDelta: 0.012
    };
  }, []);

  useEffect(() => {
    if (!followUser || !cursor || !mapRef.current) return;
    mapRef.current.animateCamera(
      {
        center: { latitude: cursor.lat, longitude: cursor.lng },
        pitch: is3d ? 45 : 0,
        zoom: 16.5
      },
      { duration: 400 }
    );
  }, [cursor?.lat, cursor?.lng, followUser, is3d]);

  return (
    <View style={styles.fill}>
      <MapView
        ref={mapRef}
        style={styles.fill}
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        mapType={mapType}
        initialRegion={initialRegion}
        pitchEnabled={is3d}
        rotateEnabled={is3d}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        followsUserLocation={false}
        onPress={(e) => {
          if (!pickMode || !onMapPress) return;
          const { latitude, longitude } = e.nativeEvent.coordinate;
          onMapPress({ lat: latitude, lng: longitude });
        }}
      >
        {heatTracks.map((track, idx) =>
          track.length > 1 ? (
            <Polyline
              key={`heat-${idx}`}
              coordinates={track.map((p) => ({ latitude: p.lat, longitude: p.lng }))}
              strokeColor="rgba(59,130,246,0.35)"
              strokeWidth={3}
              lineCap="round"
              lineJoin="round"
            />
          ) : null
        )}
        {coords.length > 1 ? (
          <Polyline coordinates={coords} strokeColor={strokeColor} strokeWidth={5} lineCap="round" lineJoin="round" />
        ) : null}
        {cursor ? (
          <Marker
            coordinate={{ latitude: cursor.lat, longitude: cursor.lng }}
            pinColor={strokeColor}
            title="Agora"
          />
        ) : null}
        {lapMarker ? (
          <Marker
            coordinate={{ latitude: lapMarker.lat, longitude: lapMarker.lng }}
            pinColor="#2563eb"
            title="Volta"
          />
        ) : null}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 }
});
