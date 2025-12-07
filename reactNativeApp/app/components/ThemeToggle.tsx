import { Ionicons } from "@expo/vector-icons";
import { TouchableOpacity, View, Text, StyleSheet } from "react-native";
import { useAppTheme } from "../theme";

export const ThemeToggle = () => {
  const { mode, toggle, colors } = useAppTheme();
  return (
    <TouchableOpacity style={styles.btn} onPress={toggle}>
      <View style={[styles.iconWrap, { backgroundColor: colors.card }]}>
        <Ionicons
          name={mode === "dark" ? "sunny" : "moon"}
          size={18}
          color={colors.accent}
        />
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconWrap: {
    padding: 6,
    borderRadius: 999,
  },
  label: {
    fontWeight: "600",
  },
});
