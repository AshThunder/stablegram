/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CIRCLE_APP_ID: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_CIRCLE_CLIENT_KEY?: string;
  readonly VITE_CIRCLE_CLIENT_URL?: string;
  readonly VITE_ARC_NETWORK?: 'testnet' | 'mainnet';
  readonly VITE_BOT_USERNAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
