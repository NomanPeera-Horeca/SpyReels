/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_PUBLIC_POSTHOG_TOKEN: string;
  readonly VITE_PUBLIC_POSTHOG_HOST: string;
  readonly VITE_PUBLIC_CLARITY_PROJECT_ID: string;
  readonly VITE_APP_ORIGIN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
