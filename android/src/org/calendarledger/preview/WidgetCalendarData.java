package org.calendarledger.preview;

import android.content.Context;
import android.graphics.Color;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.*;

/** A read-only projection of accounting, schedules and holidays. No API key or chat access. */
final class WidgetCalendarData {
    private static JSONObject festivalIndex;
    private static JSONObject lunarIndex;
    final List<LocalDate> days;
    final Map<String, List<JSONObject>> events = new HashMap<>();
    final Map<String, CalendarMoney.Day> money = new HashMap<>();
    final Map<String, Integer> calendarColors = new HashMap<>();
    final Map<String, JSONObject> holidays = new HashMap<>();
    final JSONObject festivals;
    final JSONObject lunarDays;
    final boolean dark;
    final boolean largeFont;
    final int weekStart;

    WidgetCalendarData(Context context, YearMonth month) {
        JSONObject state = new JSONObject();
        try { state = new JSONObject(SnapshotStore.read(context)).getJSONObject("state"); }
        catch (Exception ignored) {}
        JSONObject settings = state.optJSONObject("settings");
        dark = settings != null && "dark".equals(settings.optString("theme"));
        largeFont = settings != null && "large".equals(settings.optString("fontSize"));
        weekStart = settings != null && settings.optInt("weekStart", 1) == 0 ? 0 : 1;
        days = CalendarMonth.grid(month, weekStart);
        JSONArray transactions = state.optJSONArray("transactions");
        if (transactions != null) for (int i = 0; i < transactions.length(); i++) {
            JSONObject transaction = transactions.optJSONObject(i);
            if (transaction == null) continue;
            String date = transaction.optString("date");
            if (date.compareTo(days.get(0).toString()) < 0 || date.compareTo(days.get(days.size() - 1).toString()) > 0) continue;
            try {
                Object raw = transaction.opt("amount");
                // Snapshots contain integer cents, never the yuan entered into a form.
                if (!(raw instanceof Number)) continue;
                java.math.BigDecimal amount = new java.math.BigDecimal(raw.toString());
                CalendarMoney.add(money, date, transaction.optString("kind"), amount.longValueExact());
            } catch (RuntimeException damaged) { /* Preserve the other valid records. */ }
        }
        festivals = festivals(context);
        lunarDays = lunarDays(context);
        JSONObject cached = state.optJSONObject("holidayDays");
        JSONObject cachedYears = state.optJSONObject("holidayMeta");
        // Packaged official days-off data still works before the first app launch.
        Set<Integer> years = new HashSet<>();
        for (LocalDate day : days) years.add(day.getYear());
        for (int year : years) {
            // A downloaded year replaces the entire bundled year, including
            // removed dates. Merging individual days could retain a stale day off.
            if (cached != null && cachedYears != null && cachedYears.has(String.valueOf(year))) continue;
            JSONObject bundled = asset(context, "web/holidays/" + year + ".json");
            JSONArray entries = bundled.optJSONArray("days");
            if (entries == null) continue;
            for (int i = 0; i < entries.length(); i++) {
                JSONObject entry = entries.optJSONObject(i);
                if (entry != null) holidays.put(entry.optString("date"), entry);
            }
        }
        if (cached != null) {
            Iterator<String> keys = cached.keys();
            while (keys.hasNext()) {
                String key = keys.next(); JSONObject entry = cached.optJSONObject(key);
                if (entry != null) holidays.put(key, entry);
            }
        }
        JSONArray calendars = state.optJSONArray("calendars");
        if (calendars != null) for (int i = 0; i < calendars.length(); i++) {
            JSONObject calendar = calendars.optJSONObject(i);
            if (calendar == null) continue;
            try { calendarColors.put(calendar.optString("id"), Color.parseColor(calendar.optString("color"))); }
            catch (IllegalArgumentException ignored) {}
        }
        JSONArray schedules = state.optJSONArray("events");
        if (schedules != null) for (int i = 0; i < schedules.length(); i++) {
            JSONObject event = schedules.optJSONObject(i);
            if (event == null) continue;
            try {
                List<LocalDate> occurrences = ReminderDates.between(LocalDate.parse(event.getString("date")),
                        event.optString("repeat", "none"), event.optString("until"),
                        days.get(0), days.get(days.size() - 1));
                Set<String> exceptions = new HashSet<>();
                JSONArray excluded = event.optJSONArray("exceptions");
                if (excluded != null) for (int j = 0; j < excluded.length(); j++) exceptions.add(excluded.optString(j));
                for (LocalDate occurrence : occurrences) {
                    String date = occurrence.toString();
                    if (exceptions.contains(date)) continue;
                    if (!events.containsKey(date)) events.put(date, new ArrayList<>());
                    events.get(date).add(event);
                }
            } catch (Exception ignored) { /* A damaged entry must not hide the whole calendar. */ }
        }
        for (List<JSONObject> entries : events.values()) entries.sort(Comparator.comparing(e -> e.optString("time")));
    }
    String observance(String date) {
        JSONArray names = festivals.optJSONArray(date);
        if (names != null && names.length() > 0) {
            List<String> labels = new ArrayList<>();
            for (int i = 0; i < names.length(); i++) labels.add(names.optString(i));
            return String.join("·", labels);
        }
        JSONObject holiday = holidays.get(date);
        if (holiday == null) return "";
        String name = holiday.optString("name").replaceAll("节$", "");
        return name + (holiday.optBoolean("isOffDay") ? "假期" : "补班");
    }
    static synchronized JSONObject festivals(Context context) {
        if (festivalIndex == null) loadDateIndex(context);
        return festivalIndex == null ? new JSONObject() : festivalIndex;
    }
    static synchronized JSONObject lunarDays(Context context) {
        if (lunarIndex == null) loadDateIndex(context);
        return lunarIndex == null ? new JSONObject() : lunarIndex;
    }
    private static void loadDateIndex(Context context) {
        JSONObject index = asset(context, "web/widget-festivals.json");
        festivalIndex = index.optJSONObject("dates");
        lunarIndex = index.optJSONObject("lunarDays");
    }
    private static JSONObject asset(Context context, String name) {
        try (InputStream stream = context.getAssets().open(name)) {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream(); byte[] buffer = new byte[8192]; int count;
            while ((count = stream.read(buffer)) != -1) bytes.write(buffer, 0, count);
            return new JSONObject(new String(bytes.toByteArray(), StandardCharsets.UTF_8));
        } catch (Exception missing) { return new JSONObject(); }
    }
}
