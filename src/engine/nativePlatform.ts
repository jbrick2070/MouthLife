import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

interface MouthLifeAndroidPlugin {
  ttsGetLocalLanguages(): Promise<{ ready: boolean; languages: string[] }>;
  ttsSpeak(options: {
    text: string;
    lang: string;
    volume: number;
    rate: number;
    pitch: number;
    utteranceId: string;
  }): Promise<{ spoken: boolean }>;
  ttsStop(): Promise<void>;
  setKeepScreenOn(options: { enabled: boolean }): Promise<void>;
  openExternalUrl(options: { url: string }): Promise<void>;
  setBackInterceptEnabled(options: { enabled: boolean }): Promise<void>;
  moveTaskToBack(): Promise<void>;
  hapticImpact(options: { strength01: number; durationMs: number }): Promise<void>;
  addListener(
    eventName: 'backPressed',
    listenerFunc: () => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'appLifecycle',
    listenerFunc: (event: { active: boolean }) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'ttsReady',
    listenerFunc: (event: { ready: boolean; languages: string[] }) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'ttsUtterance',
    listenerFunc: (event: { utteranceId: string; state: 'done' | 'error' | 'stop' }) => void
  ): Promise<PluginListenerHandle>;
}

let cachedBridge: MouthLifeAndroidPlugin | null = null;

function getNativeBridge(): MouthLifeAndroidPlugin | null {
  if (!isNativeApp()) return null;
  if (!cachedBridge) {
    cachedBridge = registerPlugin<MouthLifeAndroidPlugin>('MouthLifeAndroid');
  }
  return cachedBridge;
}

/** True when running inside the Capacitor native shell (Android app), false in web browsers & tests. */
export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** True when running inside the Capacitor Android app specifically. */
export function isNativeAndroid(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

/**
 * Opens an approved outbound URL (only called after the grown-up gate passes).
 * On Android native, hands it to the phone's browser via ACTION_VIEW; on web, uses window.open.
 */
export function openExternalUrl(href: string): void {
  const bridge = getNativeBridge();
  if (bridge) {
    void bridge.openExternalUrl({ url: href }).catch(() => {});
    return;
  }
  window.open(href, '_blank', 'noopener,noreferrer');
}

/** Keeps the screen awake via native FLAG_KEEP_SCREEN_ON during brushing and finales. */
export function setNativeKeepScreenOn(enabled: boolean): void {
  void getNativeBridge()?.setKeepScreenOn({ enabled }).catch(() => {});
}

/** Subtle phone haptics on Android (never runs on web or desktop browsers). */
export function triggerNativeHaptic(strength01: number, durationMs: number): void {
  void getNativeBridge()?.hapticImpact({ strength01, durationMs }).catch(() => {});
}

/**
 * Controls whether Android's OnBackPressedCallback intercepts Back.
 * False on Home with nothing open so Android 16 plays the native predictive back-to-home gesture.
 */
export function setNativeBackIntercept(enabled: boolean): void {
  void getNativeBridge()?.setBackInterceptEnabled({ enabled }).catch(() => {});
}

/** Moves the Android app to the background when Back is pressed on Home with nothing left to close. */
export function moveNativeAppToBack(): void {
  void getNativeBridge()?.moveTaskToBack().catch(() => {});
}

export function onNativeBackPressed(listener: () => void): () => void {
  const bridge = getNativeBridge();
  if (!bridge) return () => {};
  let disposed = false;
  let handle: PluginListenerHandle | null = null;
  void bridge
    .addListener('backPressed', listener)
    .then((h) => {
      if (disposed) void h.remove();
      else handle = h;
    })
    .catch(() => {});
  return () => {
    disposed = true;
    void handle?.remove();
  };
}

export function onNativeLifecycleChanged(listener: (active: boolean) => void): () => void {
  const bridge = getNativeBridge();
  if (!bridge) return () => {};
  let disposed = false;
  let handle: PluginListenerHandle | null = null;
  void bridge
    .addListener('appLifecycle', (ev) => listener(Boolean(ev?.active)))
    .then((h) => {
      if (disposed) void h.remove();
      else handle = h;
    })
    .catch(() => {});
  return () => {
    disposed = true;
    void handle?.remove();
  };
}

export function getNativeLocalTtsLanguages(): Promise<{ ready: boolean; languages: string[] }> {
  const bridge = getNativeBridge();
  if (!bridge) return Promise.resolve({ ready: false, languages: [] });
  return bridge.ttsGetLocalLanguages().catch(() => ({ ready: false, languages: [] }));
}

export function speakNativeTts(options: {
  text: string;
  lang: string;
  volume: number;
  rate: number;
  pitch: number;
  utteranceId: string;
}): Promise<{ spoken: boolean }> {
  const bridge = getNativeBridge();
  if (!bridge) return Promise.resolve({ spoken: false });
  return bridge.ttsSpeak(options).catch(() => ({ spoken: false }));
}

export function stopNativeTts(): void {
  void getNativeBridge()?.ttsStop().catch(() => {});
}

export function onNativeTtsReady(listener: (languages: string[]) => void): () => void {
  const bridge = getNativeBridge();
  if (!bridge) return () => {};
  let disposed = false;
  let handle: PluginListenerHandle | null = null;
  void bridge
    .addListener('ttsReady', (ev) => {
      if (ev?.ready && Array.isArray(ev.languages)) listener(ev.languages);
    })
    .then((h) => {
      if (disposed) void h.remove();
      else handle = h;
    })
    .catch(() => {});
  return () => {
    disposed = true;
    void handle?.remove();
  };
}

export function onNativeTtsUtterance(
  listener: (event: { utteranceId: string; state: 'done' | 'error' | 'stop' }) => void
): () => void {
  const bridge = getNativeBridge();
  if (!bridge) return () => {};
  let disposed = false;
  let handle: PluginListenerHandle | null = null;
  void bridge
    .addListener('ttsUtterance', listener)
    .then((h) => {
      if (disposed) void h.remove();
      else handle = h;
    })
    .catch(() => {});
  return () => {
    disposed = true;
    void handle?.remove();
  };
}
