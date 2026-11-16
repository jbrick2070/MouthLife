/// <reference types="vite/client" />

declare module 'virtual:bundled-music' {
  /**
   * Bare file names found in native-apple/MouthLifeApp/Music when the app was built. The Vite
   * plugin in vite.config.ts serves that folder as `music/` in dev and copies it into `dist/`.
   */
  export const BUNDLED_MUSIC_FILES: readonly string[];
}
