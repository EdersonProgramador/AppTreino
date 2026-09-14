import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

export function ActivateStepTransition({ stepKey, children }: { stepKey: string; children: ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(14)).current;

  useEffect(() => {
    opacity.setValue(0);
    translateY.setValue(14);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      })
    ]).start();
  }, [opacity, stepKey, translateY]);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
}

export function ActivateScanOverlay() {
  const scanY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanY, {
          toValue: 1,
          duration: 4200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true
        }),
        Animated.timing(scanY, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true
        })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [scanY]);

  const translateY = scanY.interpolate({
    inputRange: [0, 1],
    outputRange: ["-20%", "120%"]
  });

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View
        style={[
          styles.scan,
          {
            transform: [{ translateY }]
          }
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  scan: {
    position: "absolute",
    left: 0,
    right: 0,
    height: "22%",
    backgroundColor: "rgba(255,210,170,0.04)",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(255,210,170,0.08)"
  }
});
