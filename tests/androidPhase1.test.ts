import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..');
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

describe('Android Phase 1 Capacitor packaging & privacy invariants', () => {
  it('fixes app id, origin scheme/hostname, and dark SystemBars in capacitor.config.ts', () => {
    const cfg = read('capacitor.config.ts');
    expect(cfg).toContain("appId: 'org.mouthlife.plaque'");
    expect(cfg).toContain("androidScheme: 'https'");
    expect(cfg).toContain("hostname: 'localhost'");
    expect(cfg).toContain("style: 'DARK'");
    expect(cfg).toContain("insetsHandling: 'css'");
  });

  it('targets API 36 and keeps bundled audio uncompressed in APK', () => {
    const vars = read('android/variables.gradle');
    expect(vars).toContain('compileSdkVersion = 36');
    expect(vars).toContain('targetSdkVersion = 36');

    const appGradle = read('android/app/build.gradle');
    expect(appGradle).toContain('noCompress');
    for (const ext of ['m4a', 'mp3', 'ogg']) {
      expect(appGradle).toContain(`'${ext}'`);
    }
  });

  it('removes INTERNET, disables Auto Backup, enables predictive back, and declares TTS queries', () => {
    const manifest = read('android/app/src/main/AndroidManifest.xml');
    expect(manifest).toMatch(/android\.permission\.INTERNET"[^>]*tools:node="remove"/);
    expect(manifest).toContain('android:allowBackup="false"');
    expect(manifest).toContain('android:dataExtractionRules="@xml/data_extraction_rules"');
    expect(manifest).toContain('android:fullBackupContent="@xml/backup_rules"');
    expect(manifest).toContain('android:enableOnBackInvokedCallback="true"');
    expect(manifest).toContain('android.intent.action.TTS_SERVICE');
    expect(manifest).toContain('android.intent.action.VIEW');

    const rules = read('android/app/src/main/res/xml/data_extraction_rules.xml');
    expect(rules).toContain('<cloud-backup>');
    expect(rules).toContain('<exclude domain="root" />');
    expect(rules).toContain('<device-transfer>');
  });

  it('guards service worker registration against native Capacitor runs', () => {
    const main = read('src/main.ts');
    expect(main).toMatch(/import\.meta\.env\.PROD\s*&&\s*!isNativeApp\(\)/);
  });

  it('routes external links through openExternalUrl after the grown-up gate', () => {
    const gate = read('src/ui/parentGate.ts');
    expect(gate).toContain('askGrownUp(() => openExternalUrl(href))');
  });

  it('hides blob JSON download in native WebView and names Android in public/privacy.html', () => {
    const hub = read('src/ui/CompanionHubOverlay.ts');
    expect(hub).toContain("isNativeApp() ? '' : '<button type=\"button\" id=\"btn-download-json\"");

    const privacy = read('public/privacy.html');
    expect(privacy).toContain('Applies to Web, iOS & Android builds');
  });

  it('enables media playback without user gesture and Range-safe local music serving in MainActivity', () => {
    const activity = read('android/app/src/main/java/org/mouthlife/plaque/MainActivity.java');
    expect(activity).toContain('registerPlugin(MouthLifePlugin.class)');
    expect(activity).toContain('setMediaPlaybackRequiresUserGesture(false)');
    expect(activity).toContain('Partial Content');
    expect(activity).toContain('skipFully');
  });

  it('keeps native TTS strictly on-device and uses FLAG_KEEP_SCREEN_ON + OnBackPressedCallback', () => {
    const plugin = read('android/app/src/main/java/org/mouthlife/plaque/MouthLifePlugin.java');
    expect(plugin).toContain('isNetworkConnectionRequired()');
    expect(plugin).toContain('KEY_FEATURE_NETWORK_SYNTHESIS, "false"');
    expect(plugin).toContain('FLAG_KEEP_SCREEN_ON');
    expect(plugin).toContain('OnBackPressedCallback');
  });

  it('pauses a running brush on Android Back rather than exiting to Hub', () => {
    const brush = read('src/ui/BrushAlongOverlay.ts');
    expect(brush).toMatch(/handleBackPress\(\): boolean \{[\s\S]*?this\.togglePause\(\);[\s\S]*?\}/);
  });

  it('starts the bundled soundtrack immediately on native launch without waiting for a tap', () => {
    const main = read('src/main.ts');
    expect(main).toContain('sound.startOnNativeLaunch()');
    expect(main).toContain('sound.toggleMute()');
    expect(main).toContain('nudgeBrushOrbit');
    const sound = read('src/engine/audio/SoundEngine.ts');
    expect(sound).toContain('startOnNativeLaunch(): void');
    expect(sound).toContain('toggleMute(): boolean');
  });

  it('first click on speaker button starts audio instead of muting when browser blocked autoplay', async () => {
    const { SoundEngine } = await import('../src/engine/audio/SoundEngine');
    const storage = new Map<string, string>();
    const fakeStorage = {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => {
        storage.set(k, v);
      },
    };
    const sound = new SoundEngine(fakeStorage);
    expect(sound.isMuted()).toBe(false);
    // Simulate first tap on the speaker button before Web Audio is running:
    // toggleMute() starts audio rather than muting and forcing a second tap.
    expect(sound.toggleMute()).toBe(false);
    expect(sound.isMuted()).toBe(false);
    // Once AudioContext is running, the next deliberate click mutes and unmutes cleanly.
    (sound as unknown as { ctx: { state: string } }).ctx = { state: 'running' };
    expect(sound.toggleMute()).toBe(true);
    expect(sound.isMuted()).toBe(true);
    expect(sound.toggleMute()).toBe(false);
    expect(sound.isMuted()).toBe(false);
  });
});
