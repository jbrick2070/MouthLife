import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'org.mouthlife.plaque',
  appName: 'MouthLife',
  webDir: 'dist',
  server: {
    // Keep scheme and hostname fixed so WebView localStorage is never orphaned across updates.
    androidScheme: 'https',
    hostname: 'localhost',
  },
  android: {
    backgroundColor: '#041320',
  },
  plugins: {
    SystemBars: {
      style: 'DARK',
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
    },
  },
};

export default config;
