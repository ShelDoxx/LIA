/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_MP_CHECKOUT_URL?: string;
  readonly VITE_MP_CHECKOUT_SELF_URL?: string;
  readonly VITE_MP_CHECKOUT_SETUP_URL?: string;
  readonly VITE_SETUP_WHATSAPP?: string;
  readonly VITE_CHECKOUT_OPTIMISTIC_ACTIVATE?: string;
  readonly VITE_STRIPE_CHECKOUT_URL?: string;
  readonly VITE_BOT_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
