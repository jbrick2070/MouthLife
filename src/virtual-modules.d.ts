/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" in a build made with `npm run build:test`: the test diary (src/engine/diagnostics/testDiary.ts). */
  readonly VITE_TEST_BUILD?: string;
  /** package.json's version, set in vite.config.ts. */
  readonly VITE_APP_VERSION?: string;
}

declare module 'virtual:bundled-music' {
  /**
   * Bare file names found in native-apple/MouthLifeApp/Music when the app was built. The Vite
   * plugin in vite.config.ts serves that folder as `music/` in dev and copies it into `dist/`.
   */
  export const BUNDLED_MUSIC_FILES: readonly string[];
}
