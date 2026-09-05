import { Image, type ImageStyle, type StyleProp } from "react-native";

type Gender = "MALE" | "FEMALE" | null | undefined;

const maleSrc = require("../../assets/corrida-homem-mask.png");
const femaleSrc = require("../../assets/corrida-mulher-transparente.png");

export function RunnerIcon({
  size = 22,
  color,
  gender,
  style
}: {
  size?: number;
  color: string;
  gender?: Gender;
  style?: StyleProp<ImageStyle>;
}) {
  return (
    <Image
      source={gender === "FEMALE" ? femaleSrc : maleSrc}
      style={[{ width: size, height: size, tintColor: color }, style]}
      resizeMode="contain"
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}
