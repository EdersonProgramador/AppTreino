import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useCallback } from "react";
import { tabBarStyleFor, useSt } from "./theme";

/** Hide the bottom tab bar while an immersive social screen is focused. */
export function useHideTabBar(hidden = true) {
  const navigation = useNavigation();
  const { st } = useSt();

  useFocusEffect(
    useCallback(() => {
      if (!hidden) return;
      const parent = navigation.getParent();
      parent?.setOptions({ tabBarStyle: { display: "none" } });
      return () => {
        parent?.setOptions({ tabBarStyle: tabBarStyleFor(st) });
      };
    }, [hidden, navigation, st])
  );
}
