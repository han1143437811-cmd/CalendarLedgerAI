package org.calendarledger.preview;

import android.content.Context;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

/** Owned by the visible activity. No service, polling, timer or widget networking. */
final class WeatherController {
    private final Context app;
    private final ExecutorService executor;
    private final Runnable changed;
    private boolean foreground, refreshing;
    private int generation;
    private final Set<HttpURLConnection> connections = new HashSet<>();
    WeatherController(Context context, ExecutorService executor, Runnable changed) {
        app = context.getApplicationContext(); this.executor = executor; this.changed = changed;
    }
    void opened() {
        synchronized (this) { if (foreground) return; foreground = true; generation++; }
        refresh();
    }
    void stopped() {
        List<HttpURLConnection> cancel;
        synchronized (this) {
            foreground = false; generation++; refreshing = false;
            cancel = new ArrayList<>(connections); connections.clear();
        }
        for (HttpURLConnection connection : cancel) connection.disconnect();
    }
    synchronized JSONObject status() { return WeatherStore.status(app, refreshing); }
    private synchronized void active(int token) throws IOException {
        if (!foreground || token != generation) throw new InterruptedIOException("天气更新已暂停，重新打开应用时再更新。");
    }
    JSONObject configure(JSONObject source) throws Exception {
        List<HttpURLConnection> cancel;
        synchronized (this) {
            if (!foreground) throw new IOException("请在打开应用时设置天气城市。");
            WeatherStore.configure(app, source);
            generation++; refreshing = false;
            cancel = new ArrayList<>(connections); connections.clear();
        }
        for (HttpURLConnection connection : cancel) connection.disconnect();
        changed.run(); refresh(); return status();
    }
    private void refresh() {
        final int token; final JSONObject city;
        synchronized (this) {
            city = WeatherStore.read(app).optJSONObject("city");
            if (!foreground || refreshing || city == null) return;
            refreshing = true; token = generation;
        }
        changed.run();
        executor.execute(() -> {
            try {
                String address = "https://api.open-meteo.com/v1/forecast?latitude=" + city.optDouble("latitude")
                        + "&longitude=" + city.optDouble("longitude")
                        + "&daily=weather_code,temperature_2m_max,temperature_2m_min"
                        + "&forecast_days=16&timezone=" + URLEncoder.encode(city.optString("timezone"), "UTF-8");
                JSONObject response = get(address, token);
                long now = System.currentTimeMillis();
                JSONArray days = WeatherStore.normalizeForecast(response, city, now);
                synchronized (this) { active(token); WeatherStore.commit(app, city, days, now); }
            } catch (Exception error) {
                synchronized (this) {
                    if (foreground && token == generation) {
                        try { WeatherStore.failed(app, city, System.currentTimeMillis()); }
                        catch (Exception ignored) {}
                    }
                }
            } finally {
                boolean current;
                synchronized (this) { current = token == generation; if (current) refreshing = false; }
                if (current) changed.run();
            }
        });
    }
    JSONObject search(String name) throws Exception {
        name = name.trim();
        if (name.length() < 2 || name.length() > 60 || name.matches("(?s).*[\\p{Cntrl}].*"))
            throw new IOException("请输入 2～60 个字的城市名称，也可以使用拼音或英文。");
        int token;
        synchronized (this) { token = generation; active(token); }
        JSONObject data;
        try {
            data = get("https://geocoding-api.open-meteo.com/v1/search?name="
                    + URLEncoder.encode(name, "UTF-8") + "&count=10&language=zh&format=json", token);
        } catch (IOException error) { active(token); throw new IOException("城市搜索未成功，请检查网络后重试。"); }
        JSONArray results = new JSONArray(), rows = data.optJSONArray("results");
        if (rows != null) for (int i = 0; i < Math.min(10, rows.length()); i++) {
            try { results.put(WeatherStore.normalizeCity(rows.getJSONObject(i))); }
            catch (Exception invalid) {}
        }
        active(token);
        return new JSONObject().put("results", results);
    }
    private JSONObject get(String address, int token) throws Exception {
        HttpURLConnection connection = (HttpURLConnection)new URL(address).openConnection();
        connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(8000); connection.setReadTimeout(8000);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("User-Agent", "CalendarLedgerAI/0.3.3 (non-commercial personal calendar)");
        synchronized (this) { active(token); connections.add(connection); }
        try {
            active(token);
            int code = connection.getResponseCode();
            if (code != 200) throw new IOException("天气服务暂时不可用，请稍后重新打开应用。");
            try (InputStream input = connection.getInputStream()) {
                ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                byte[] buffer = new byte[2048]; int count;
                while ((count = input.read(buffer)) != -1) {
                    active(token); bytes.write(buffer, 0, count);
                    if (bytes.size() > 65_536) throw new IOException("天气服务返回内容过大。");
                }
                active(token);
                return new JSONObject(new String(bytes.toByteArray(), StandardCharsets.UTF_8));
            }
        } finally {
            synchronized (this) { connections.remove(connection); }
            connection.disconnect();
        }
    }
}
