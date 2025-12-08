import { useEffect } from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { ThemeProvider, useAppTheme } from "../src/theme";
import { setupDatabase } from "../src/lib/db";

const TabsLayout = () => {
  const { colors, mode } = useAppTheme();

  useEffect(() => {
    setupDatabase();
  }, []);

  return (
    <>
      <StatusBar style={mode === "dark" ? "light" : "dark"} />
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.muted,
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
          },
          tabBarLabelStyle: { fontWeight: "600" },
          sceneContainerStyle: { backgroundColor: colors.background },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Поиск",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="search" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="history"
          options={{
            title: "История",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="time" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="player"
          options={{
            title: "Плеер",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="play-circle" color={color} size={size} />
            ),
          }}
        />
      </Tabs>
    </>
  );
};

export default function RootLayout() {
  return (
    <ThemeProvider>
      <TabsLayout />
    </ThemeProvider>
  );
}
