package org.mouthlife.plaque;

import android.content.res.AssetFileDescriptor;
import android.content.res.AssetManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.WindowManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import androidx.core.view.WindowCompat;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(MouthLifePlugin.class);
        super.onCreate(savedInstanceState);

        // Edge-to-edge layout across system bars and display cutouts; Capacitor's SystemBars plugin
        // injects --safe-area-inset-* CSS variables and sets dark bar appearance.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.layoutInDisplayCutoutMode =
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
                    ? WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
                    : WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(lp);
        }

        if (getBridge() != null && getBridge().getWebView() != null) {
            WebView webView = getBridge().getWebView();
            webView.setBackgroundColor(Color.parseColor("#041320"));
            // Allow bundled audio tracks and Web Audio to start cleanly inside the app.
            webView.getSettings().setMediaPlaybackRequiresUserGesture(false);
            getBridge().setWebViewClient(new MouthLifeWebViewClient(getBridge(), getAssets()));
        }
    }

    /**
     * Serves bundled music files from uncompressed APK assets with proper RFC 7233 byte-range
     * seeking (Capacitor's default WebViewLocalServer sends 206 Content-Range headers without
     * skipping to the requested start byte, which breaks <audio> seeking and looping).
     * Also blocks ungated external navigation inside the WebView (all external links go through
     * the grown-up math gate and MouthLifePlugin.openExternalUrl).
     */
    private static final class MouthLifeWebViewClient extends BridgeWebViewClient {

        private final Bridge appBridge;
        private final AssetManager assets;

        MouthLifeWebViewClient(Bridge bridge, AssetManager assets) {
            super(bridge);
            this.appBridge = bridge;
            this.assets = assets;
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            WebResourceResponse musicResponse = maybeServeMusicAsset(request);
            if (musicResponse != null) {
                return musicResponse;
            }
            return super.shouldInterceptRequest(view, request);
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request != null ? request.getUrl() : null;
            if (uri != null && appBridge.getHost() != null && appBridge.getHost().equalsIgnoreCase(uri.getHost())) {
                return false;
            }
            // Never navigate out of the WebView silently; external links must pass the parent gate.
            return true;
        }

        private WebResourceResponse maybeServeMusicAsset(WebResourceRequest request) {
            if (request == null || !"GET".equalsIgnoreCase(request.getMethod())) {
                return null;
            }
            Uri uri = request.getUrl();
            if (uri == null || appBridge.getHost() == null || !appBridge.getHost().equalsIgnoreCase(uri.getHost())) {
                return null;
            }
            String path = uri.getPath();
            if (path == null || !path.startsWith("/music/")) {
                return null;
            }
            String fileName = path.substring("/music/".length());
            if (fileName.isEmpty() || fileName.contains("/") || fileName.contains("\\") || fileName.contains("..")) {
                return null;
            }
            String mimeType = musicMimeType(fileName);
            if (mimeType == null) {
                return null;
            }

            AssetFileDescriptor afd = null;
            try {
                afd = assets.openFd("public/music/" + fileName);
                long totalLength = afd.getLength();
                if (totalLength <= 0) {
                    afd.close();
                    return null;
                }

                String rangeHeader = getRangeHeader(request.getRequestHeaders());
                if (rangeHeader == null || !rangeHeader.toLowerCase(Locale.ROOT).startsWith("bytes=")) {
                    Log.d("MouthLifeMusic", "200 " + fileName + " len=" + totalLength);
                    Map<String, String> headers = new HashMap<>();
                    headers.put("Accept-Ranges", "bytes");
                    headers.put("Content-Length", String.valueOf(totalLength));
                    headers.put("Cache-Control", "no-cache");
                    InputStream stream = afd.createInputStream();
                    afd = null; // Ownership transferred to AutoCloseInputStream.
                    return new WebResourceResponse(mimeType, null, 200, "OK", headers, stream);
                }

                long[] bounds = parseByteRange(rangeHeader.substring(6).trim(), totalLength);
                if (bounds == null) {
                    afd.close();
                    afd = null;
                    Map<String, String> headers = new HashMap<>();
                    headers.put("Content-Range", "bytes */" + totalLength);
                    return new WebResourceResponse(
                        "text/plain",
                        "UTF-8",
                        416,
                        "Range Not Satisfiable",
                        headers,
                        new ByteArrayInputStream(new byte[0])
                    );
                }

                long start = bounds[0];
                long end = bounds[1];
                long contentLength = end - start + 1;
                InputStream raw = afd.createInputStream();
                afd = null; // Ownership transferred to AutoCloseInputStream.
                skipFully(raw, start);
                InputStream bounded = new BoundedInputStream(raw, contentLength);

                Map<String, String> headers = new HashMap<>();
                headers.put("Accept-Ranges", "bytes");
                headers.put("Content-Range", "bytes " + start + "-" + end + "/" + totalLength);
                headers.put("Content-Length", String.valueOf(contentLength));
                headers.put("Cache-Control", "no-cache");
                Log.d("MouthLifeMusic", "206 " + fileName + " bytes=" + start + "-" + end + "/" + totalLength);
                return new WebResourceResponse(mimeType, null, 206, "Partial Content", headers, bounded);
            } catch (IOException ex) {
                Log.w("MouthLifeMusic", "Failed to open asset public/music/" + fileName, ex);
                if (afd != null) {
                    try {
                        afd.close();
                    } catch (IOException ignored) {
                        // Ignore close failure.
                    }
                }
                return null;
            }
        }

        private static String getRangeHeader(Map<String, String> headers) {
            if (headers == null) return null;
            for (Map.Entry<String, String> entry : headers.entrySet()) {
                if ("range".equalsIgnoreCase(entry.getKey())) {
                    return entry.getValue();
                }
            }
            return null;
        }

        private static long[] parseByteRange(String spec, long totalLength) {
            // Only single ranges (the only kind Chromium <audio> sends).
            int comma = spec.indexOf(',');
            if (comma >= 0) spec = spec.substring(0, comma).trim();
            int dash = spec.indexOf('-');
            if (dash < 0) return null;
            String startStr = spec.substring(0, dash).trim();
            String endStr = spec.substring(dash + 1).trim();
            try {
                long start;
                long end;
                if (startStr.isEmpty()) {
                    long suffix = Long.parseLong(endStr);
                    if (suffix <= 0) return null;
                    start = Math.max(0, totalLength - suffix);
                    end = totalLength - 1;
                } else {
                    start = Long.parseLong(startStr);
                    end = endStr.isEmpty() ? totalLength - 1 : Math.min(totalLength - 1, Long.parseLong(endStr));
                }
                if (start < 0 || start >= totalLength || end < start) return null;
                return new long[] { start, end };
            } catch (NumberFormatException ex) {
                return null;
            }
        }

        private static void skipFully(InputStream in, long bytes) throws IOException {
            long remaining = bytes;
            while (remaining > 0) {
                long skipped = in.skip(remaining);
                if (skipped > 0) {
                    remaining -= skipped;
                } else {
                    if (in.read() < 0) break;
                    remaining--;
                }
            }
        }

        private static String musicMimeType(String name) {
            String lower = name.toLowerCase(Locale.ROOT);
            if (lower.endsWith(".m4a")) return "audio/mp4";
            if (lower.endsWith(".mp3")) return "audio/mpeg";
            if (lower.endsWith(".ogg")) return "audio/ogg";
            if (lower.endsWith(".wav")) return "audio/wav";
            if (lower.endsWith(".aac")) return "audio/aac";
            return null;
        }
    }

    private static final class BoundedInputStream extends InputStream {

        private final InputStream delegate;
        private long remaining;

        BoundedInputStream(InputStream delegate, long length) {
            this.delegate = delegate;
            this.remaining = Math.max(0, length);
        }

        @Override
        public int read() throws IOException {
            if (remaining <= 0) return -1;
            int b = delegate.read();
            if (b >= 0) remaining--;
            return b;
        }

        @Override
        public int read(byte[] b, int off, int len) throws IOException {
            if (remaining <= 0) return -1;
            int toRead = (int) Math.min(len, remaining);
            int n = delegate.read(b, off, toRead);
            if (n > 0) remaining -= n;
            return n;
        }

        @Override
        public int available() throws IOException {
            return (int) Math.min(remaining, Integer.MAX_VALUE);
        }

        @Override
        public void close() throws IOException {
            delegate.close();
        }
    }
}
