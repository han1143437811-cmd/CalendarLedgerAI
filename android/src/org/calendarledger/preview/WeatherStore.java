package org.calendarledger.preview;

import android.content.Context;
import android.util.AtomicFile;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;

/** A bounded local cache, separate from the ledger, AI configuration and backups.
 * Reading, projecting and updating widget views never performs a network request.
 */
final class WeatherStore {
    private static final Object LOCK = new Object();
    private static final int LIMIT = 32_768;
    private static AtomicFile file(Context context) {
        return new AtomicFile(new File(context.getFilesDir(), "weather-cache-v1.json"));
    }
    static JSONObject read(Context context) {
        synchronized (LOCK) {
            try (InputStream input = file(context).openRead()) {
                ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                byte[] buffer = new byte[2048]; int count;
                while ((count = input.read(buffer)) != -1) {
                    bytes.write(buffer, 0, count);
                    if (bytes.size() > LIMIT) throw new IOException("Weather cache too large");
                }
                JSONObject cache = new JSONObject(new String(bytes.toByteArray(), StandardCharsets.UTF_8));
                if (cache.optInt("version") != 1) throw new IOException("Unknown weather cache");
                if (cache.optJSONObject("city") != null) normalizeCity(cache.getJSONObject("city"));
                return cache;
            } catch (Exception missingOrDamaged) { return empty(null); }
        }
    }
    private static JSONObject empty(JSONObject city) {
        JSONObject result = new JSONObject();
        try { result.put("version", 1).put("city", city == null ? JSONObject.NULL : city)
                .put("updatedAt", 0).put("lastAttemptAt", 0).put("lastError", "")
                .put("days", new JSONArray()); }
        catch (JSONException impossible) { throw new IllegalStateException(impossible); }
        return result;
    }
    private static void write(Context context, JSONObject cache) throws IOException {
        byte[] bytes = cache.toString().getBytes(StandardCharsets.UTF_8);
        if (bytes.length > LIMIT) throw new IOException("天气缓存过大，未保存。");
        AtomicFile target = file(context); FileOutputStream output = null;
        try {
            output = target.startWrite(); output.write(bytes); target.finishWrite(output);
        } catch (IOException error) { if (output != null) target.failWrite(output); throw error; }
    }
    static JSONObject normalizeCity(JSONObject source) throws Exception {
        String name = source.getString("name").trim();
        double lat = source.getDouble("latitude"), lon = source.getDouble("longitude");
        String timezone = source.getString("timezone");
        ZoneId.of(timezone);
        if (name.isEmpty() || name.length() > 80 || name.matches("(?s).*[\\p{Cntrl}].*")
                || !Double.isFinite(lat) || !Double.isFinite(lon)
                || lat < -90 || lat > 90 || lon < -180 || lon > 180)
            throw new IOException("城市信息无效，请重新搜索并选择。");
        return new JSONObject().put("name", name).put("latitude", lat).put("longitude", lon)
                .put("timezone", timezone).put("admin1", source.optString("admin1").substring(0, Math.min(80, source.optString("admin1").length())))
                .put("country", source.optString("country").substring(0, Math.min(80, source.optString("country").length())));
    }
    static String cityKey(JSONObject city) {
        return city == null ? "" : city.optString("name") + "|" + city.optDouble("latitude")
                + "|" + city.optDouble("longitude") + "|" + city.optString("timezone");
    }
    static void configure(Context context, JSONObject source) throws Exception {
        JSONObject city = source == null ? null : normalizeCity(source);
        synchronized (LOCK) {
            JSONObject before = read(context);
            if (cityKey(before.optJSONObject("city")).equals(cityKey(city))) return;
            write(context, empty(city)); // Never show a previous city's forecast under a new city.
        }
    }
    static JSONArray normalizeForecast(JSONObject response, JSONObject city, long now) throws Exception {
        JSONObject daily = response.getJSONObject("daily");
        JSONArray dates = daily.getJSONArray("time"), codes = daily.getJSONArray("weather_code");
        JSONArray highs = daily.getJSONArray("temperature_2m_max"), lows = daily.getJSONArray("temperature_2m_min");
        if (dates.length() == 0 || dates.length() > 16 || dates.length() != codes.length()
                || dates.length() != highs.length() || dates.length() != lows.length())
            throw new IOException("天气预报格式不完整。");
        if (!"°C".equals(response.getJSONObject("daily_units").optString("temperature_2m_max"))
                || !"°C".equals(response.getJSONObject("daily_units").optString("temperature_2m_min")))
            throw new IOException("天气温度单位不正确。");
        LocalDate today = Instant.ofEpochMilli(now).atZone(ZoneId.of(city.getString("timezone"))).toLocalDate();
        JSONArray result = new JSONArray();
        for (int i = 0; i < dates.length(); i++) {
            LocalDate date = LocalDate.parse(dates.getString(i));
            if (!date.equals(today.plusDays(i))) throw new IOException("天气预报日期不正确。");
            Object raw = codes.opt(i);
            if (!(raw instanceof Number)) continue; // Missing data is never converted into a sunny day.
            double value = ((Number)raw).doubleValue();
            int code = ((Number)raw).intValue();
            if (value != code || WeatherCodes.icon(code).isEmpty()) continue;
            JSONObject day = new JSONObject().put("date", date.toString()).put("code", code);
            if (highs.opt(i) instanceof Number && lows.opt(i) instanceof Number) {
                double max = highs.getDouble(i), min = lows.getDouble(i);
                if (Double.isFinite(max) && Double.isFinite(min) && min >= -100 && max <= 70 && min <= max)
                    day.put("min", min).put("max", max);
            }
            result.put(day);
        }
        if (result.length() == 0) throw new IOException("天气接口未返回有效预报。");
        return result;
    }
    static boolean commit(Context context, JSONObject city, JSONArray days, long now) throws Exception {
        synchronized (LOCK) {
            JSONObject cache = read(context);
            if (!cityKey(cache.optJSONObject("city")).equals(cityKey(city))) return false;
            cache.put("days", days).put("updatedAt", now).put("lastAttemptAt", now).put("lastError", "");
            write(context, cache); return true;
        }
    }
    static void failed(Context context, JSONObject city, long now) throws Exception {
        synchronized (LOCK) {
            JSONObject cache = read(context);
            if (!cityKey(cache.optJSONObject("city")).equals(cityKey(city))) return;
            cache.put("lastAttemptAt", now).put("lastError", "本次天气更新未成功，请检查网络；已有缓存会保留。");
            write(context, cache); // Keep the previous successful update time and forecast.
        }
    }
    static JSONObject status(Context context, boolean refreshing) {
        JSONObject cache = read(context); long now = System.currentTimeMillis(), updated = cache.optLong("updatedAt");
        JSONObject city = cache.optJSONObject("city");
        JSONArray visible = new JSONArray(); String today = ""; String end = "";
        try {
            if (city != null) today = Instant.ofEpochMilli(now).atZone(ZoneId.of(city.getString("timezone"))).toLocalDate().toString();
            if (city != null && !WeatherCodes.expired(updated, now)) {
                JSONArray days = cache.optJSONArray("days");
                LocalDate last = LocalDate.parse(today).plusDays(15);
                if (days != null) for (int i = 0; i < Math.min(16, days.length()); i++) {
                    JSONObject day = days.optJSONObject(i);
                    if (day == null || !(day.opt("code") instanceof Number)) continue;
                    int code = day.optInt("code", -1); String date = day.optString("date");
                    if (WeatherCodes.icon(code).isEmpty() || day.optDouble("code") != code) continue;
                    LocalDate parsed = LocalDate.parse(date);
                    if (date.compareTo(today) < 0 || parsed.isAfter(last)) continue;
                    JSONObject copy = new JSONObject(day.toString()).put("icon", WeatherCodes.icon(code)).put("description", WeatherCodes.describe(code));
                    visible.put(copy);
                    if (date.compareTo(end) > 0) end = date;
                }
            }
            return new JSONObject().put("city", city == null ? JSONObject.NULL : city).put("today", today)
                    .put("updatedAt", updated).put("lastAttemptAt", cache.optLong("lastAttemptAt"))
                    .put("lastError", cache.optString("lastError")).put("refreshing", refreshing)
                    .put("stale", WeatherCodes.stale(updated, now)).put("expired", WeatherCodes.expired(updated, now))
                    .put("days", visible).put("forecastEnd", end);
        } catch (Exception damaged) { return empty(city); }
    }
}
