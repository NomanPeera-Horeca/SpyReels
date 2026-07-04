import type { CapacitorConfig } from "@capacitor/cli";

const serverUrl =
  process.env.CAPACITOR_SERVER_URL?.trim() || "https://spyreels.ai";

const config: CapacitorConfig = {
  appId: "ai.spyreels.app",
  appName: "SpyReels",
  webDir: "dist/public",
  server: {
    url: serverUrl,
    cleartext: false,
    androidScheme: "https",
  },
  ios: {
    contentInset: "automatic",
    allowsLinkPreview: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: "#121218",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#121218",
    },
  },
};

export default config;
