package org.mouthlife.plaque;

import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.view.WindowManager;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;

/**
 * Native Android bridge for MouthLife Phase 1:
 * - On-device TextToSpeech for the hands-free brushing coach (strictly offline voices only)
 * - Android 16 predictive back (OnBackPressedCallback)
 * - FLAG_KEEP_SCREEN_ON during brushing and city finales
 * - Outbound ACTION_VIEW intents for charity links (only after the grown-up gate passes)
 * - Subtle tactile haptics and app background/foreground lifecycle notifications
 */
@CapacitorPlugin(name = "MouthLifeAndroid")
public class MouthLifePlugin extends Plugin {

    private final Object ttsLock = new Object();
    private TextToSpeech tts;
    private boolean ttsReady = false;
    private OnBackPressedCallback backCallback;

    @Override
    public void load() {
        super.load();

        // Register AndroidX OnBackPressedCallback for predictive back support (API 33+/36).
        getBridge().executeOnMainThread(() -> {
            backCallback = new OnBackPressedCallback(true) {
                @Override
                public void handleOnBackPressed() {
                    notifyListeners("backPressed", new JSObject());
                }
            };
            getActivity().getOnBackPressedDispatcher().addCallback(getActivity(), backCallback);
        });

        // Warm up the system's on-device TextToSpeech engine.
        Context appCtx = getContext().getApplicationContext();
        TextToSpeech instance = new TextToSpeech(appCtx, status -> {
            JSArray langs = new JSArray();
            synchronized (ttsLock) {
                if (status == TextToSpeech.SUCCESS && tts != null) {
                    ttsReady = true;
                    tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                        @Override
                        public void onStart(String utteranceId) {
                            // Music is already ducked before speak() is called.
                        }

                        @Override
                        public void onDone(String utteranceId) {
                            emitTtsUtterance(utteranceId, "done");
                        }

                        @Override
                        @SuppressWarnings("deprecation")
                        public void onError(String utteranceId) {
                            emitTtsUtterance(utteranceId, "error");
                        }

                        @Override
                        public void onError(String utteranceId, int errorCode) {
                            emitTtsUtterance(utteranceId, "error");
                        }

                        @Override
                        public void onStop(String utteranceId, boolean interrupted) {
                            emitTtsUtterance(utteranceId, "stop");
                        }
                    });
                    for (String tag : collectLocalLanguageTagsLocked()) {
                        langs.put(tag);
                    }
                }
            }
            JSObject payload = new JSObject();
            payload.put("ready", status == TextToSpeech.SUCCESS);
            payload.put("languages", langs);
            notifyListeners("ttsReady", payload, true);
        });
        synchronized (ttsLock) {
            tts = instance;
        }
    }

    private void emitTtsUtterance(String utteranceId, String state) {
        if (utteranceId == null) return;
        JSObject payload = new JSObject();
        payload.put("utteranceId", utteranceId);
        payload.put("state", state);
        notifyListeners("ttsUtterance", payload);
    }

    private static boolean isLocalVoice(Voice voice) {
        if (voice == null || voice.getLocale() == null) return false;
        if (voice.isNetworkConnectionRequired()) return false;
        Set<String> features = voice.getFeatures();
        if (features != null && features.contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)) {
            return false;
        }
        return true;
    }

    private Set<String> collectLocalLanguageTagsLocked() {
        Set<String> tags = new LinkedHashSet<>();
        if (tts == null || !ttsReady) return tags;
        try {
            Set<Voice> voices = tts.getVoices();
            if (voices != null) {
                for (Voice v : voices) {
                    if (isLocalVoice(v)) {
                        tags.add(v.getLocale().toLanguageTag());
                    }
                }
            }
        } catch (Exception ignored) {
            // Some stripped-down OEM engines throw if TTS data isn't installed yet.
        }
        return tags;
    }

    private Voice pickBestLocalVoiceLocked(String bcp47) {
        if (tts == null || !ttsReady || bcp47 == null || bcp47.isEmpty()) return null;
        String want = bcp47.toLowerCase(Locale.ROOT).replace('_', '-');
        String wantLang = want.split("-")[0];
        Voice best = null;
        int bestScore = 0;
        int bestQuality = -1;
        try {
            Set<Voice> voices = tts.getVoices();
            if (voices == null) return null;
            for (Voice v : voices) {
                if (!isLocalVoice(v)) continue;
                String tag = v.getLocale().toLanguageTag().toLowerCase(Locale.ROOT).replace('_', '-');
                int score = 0;
                if (tag.equals(want)) {
                    score = 2;
                } else if (tag.split("-")[0].equals(wantLang)) {
                    score = 1;
                }
                if (score == 0) continue;
                int quality = v.getQuality();
                if (score > bestScore || (score == bestScore && quality > bestQuality)) {
                    best = v;
                    bestScore = score;
                    bestQuality = quality;
                }
            }
        } catch (Exception ignored) {
            return null;
        }
        return best;
    }

    private void stopTtsInternal() {
        synchronized (ttsLock) {
            if (tts != null && ttsReady) {
                try {
                    tts.stop();
                } catch (Exception ignored) {
                    // Best-effort silence on stop/pause.
                }
            }
        }
    }

    @PluginMethod
    public void ttsGetLocalLanguages(PluginCall call) {
        JSArray langs = new JSArray();
        boolean ready;
        synchronized (ttsLock) {
            ready = ttsReady;
            for (String tag : collectLocalLanguageTagsLocked()) {
                langs.put(tag);
            }
        }
        JSObject ret = new JSObject();
        ret.put("ready", ready);
        ret.put("languages", langs);
        call.resolve(ret);
    }

    @PluginMethod
    public void ttsSpeak(PluginCall call) {
        String text = call.getString("text", "");
        String lang = call.getString("lang", "en-US");
        Double volObj = call.getDouble("volume", 1.0);
        Double rateObj = call.getDouble("rate", 1.0);
        Double pitchObj = call.getDouble("pitch", 1.03);
        String utteranceId = call.getString("utteranceId", "ml_" + System.nanoTime());

        float volume = (float) Math.max(0.0, Math.min(1.0, volObj != null ? volObj : 1.0));
        float rate = (float) Math.max(0.5, Math.min(2.0, rateObj != null ? rateObj : 1.0));
        float pitch = (float) Math.max(0.5, Math.min(2.0, pitchObj != null ? pitchObj : 1.03));

        boolean spoken = false;
        if (text != null && !text.isEmpty() && volume > 0.001f) {
            synchronized (ttsLock) {
                Voice voice = pickBestLocalVoiceLocked(lang);
                if (tts != null && ttsReady && voice != null) {
                    try {
                        tts.setVoice(voice);
                        tts.setSpeechRate(rate);
                        tts.setPitch(pitch);
                        Bundle params = new Bundle();
                        params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, volume);
                        params.putString(TextToSpeech.Engine.KEY_FEATURE_NETWORK_SYNTHESIS, "false");
                        int result = tts.speak(text, TextToSpeech.QUEUE_FLUSH, params, utteranceId);
                        spoken = (result == TextToSpeech.SUCCESS);
                    } catch (Exception ignored) {
                        spoken = false;
                    }
                }
            }
        }

        JSObject ret = new JSObject();
        ret.put("spoken", spoken);
        call.resolve(ret);
    }

    @PluginMethod
    public void ttsStop(PluginCall call) {
        stopTtsInternal();
        call.resolve();
    }

    @PluginMethod
    public void setKeepScreenOn(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        getBridge().executeOnMainThread(() -> {
            if (getActivity() != null && getActivity().getWindow() != null) {
                if (enabled) {
                    getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                } else {
                    getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                }
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void openExternalUrl(PluginCall call) {
        String raw = call.getString("url", "");
        if (raw == null || raw.isEmpty()) {
            call.reject("Missing url");
            return;
        }
        Uri uri = Uri.parse(raw);
        String scheme = uri.getScheme();
        if (scheme == null || (!"https".equalsIgnoreCase(scheme) && !"http".equalsIgnoreCase(scheme))) {
            call.reject("Only http/https URLs are allowed");
            return;
        }
        getBridge().executeOnMainThread(() -> {
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                intent.addCategory(Intent.CATEGORY_BROWSABLE);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getActivity().startActivity(intent);
                call.resolve();
            } catch (ActivityNotFoundException ex) {
                call.reject("No browser installed to open external link");
            }
        });
    }

    @PluginMethod
    public void setBackInterceptEnabled(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", true));
        getBridge().executeOnMainThread(() -> {
            if (backCallback != null) {
                backCallback.setEnabled(enabled);
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void moveTaskToBack(PluginCall call) {
        getBridge().executeOnMainThread(() -> {
            if (getActivity() != null) {
                getActivity().moveTaskToBack(true);
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void hapticImpact(PluginCall call) {
        Double strengthObj = call.getDouble("strength01", 0.5);
        Integer durObj = call.getInt("durationMs", 40);
        double strength = Math.max(0.05, Math.min(1.0, strengthObj != null ? strengthObj : 0.5));
        int rawMs = durObj != null ? durObj : 40;
        // Scale gamepad-sized rumble durations down to crisp phone haptics.
        int ms = Math.max(12, Math.min(65, Math.round(rawMs * 0.35f)));
        int amplitude = Math.max(20, Math.min(220, (int) Math.round(strength * 200.0)));

        getBridge().executeOnMainThread(() -> {
            try {
                Vibrator vibrator = getVibrator();
                if (vibrator != null && vibrator.hasVibrator()) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        int amp = vibrator.hasAmplitudeControl() ? amplitude : VibrationEffect.DEFAULT_AMPLITUDE;
                        vibrator.vibrate(VibrationEffect.createOneShot(ms, amp));
                    } else {
                        @SuppressWarnings("deprecation")
                        long legacyMs = ms;
                        vibrator.vibrate(legacyMs);
                    }
                } else if (getBridge() != null && getBridge().getWebView() != null) {
                    View view = getBridge().getWebView();
                    view.performHapticFeedback(HapticFeedbackConstants.CONTEXT_CLICK);
                }
            } catch (Exception ignored) {
                // Haptics are optional; never crash if the device denies vibration.
            }
            call.resolve();
        });
    }

    private Vibrator getVibrator() {
        Context ctx = getContext();
        if (ctx == null) return null;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager vm = (VibratorManager) ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            return vm != null ? vm.getDefaultVibrator() : null;
        }
        @SuppressWarnings("deprecation")
        Vibrator v = (Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
        return v;
    }

    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        stopTtsInternal();
        JSObject payload = new JSObject();
        payload.put("active", false);
        notifyListeners("appLifecycle", payload);
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        JSObject payload = new JSObject();
        payload.put("active", true);
        notifyListeners("appLifecycle", payload);
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        synchronized (ttsLock) {
            if (tts != null) {
                try {
                    tts.stop();
                    tts.shutdown();
                } catch (Exception ignored) {
                    // Ignore shutdown errors on teardown.
                }
                tts = null;
                ttsReady = false;
            }
        }
        if (backCallback != null) {
            backCallback.remove();
            backCallback = null;
        }
    }
}
