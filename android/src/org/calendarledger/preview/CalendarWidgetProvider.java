package org.calendarledger.preview;

import android.app.*;
import android.appwidget.*;
import android.content.*;
import android.graphics.Color;
import android.net.Uri;
import android.os.*;
import android.util.Base64;
import android.util.Log;
import android.util.SizeF;
import android.util.TypedValue;
import android.view.View;
import android.widget.RemoteViews;
import org.json.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;

/** A native launcher widget. Rendering never starts a WebView or contacts an AI. */
public class CalendarWidgetProvider extends AppWidgetProvider {
    static final String OPEN = "org.calendarledger.preview.WIDGET_OPEN";
    private static final String PREVIOUS = "org.calendarledger.preview.WIDGET_PREVIOUS";
    private static final String NEXT = "org.calendarledger.preview.WIDGET_NEXT";
    private static final String MIDNIGHT = "org.calendarledger.preview.WIDGET_MIDNIGHT";
    private static final ExecutorService WORK = Executors.newSingleThreadExecutor();
    private static String lastDigest = "";

    @Override public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (PREVIOUS.equals(action) || NEXT.equals(action)) {
            int id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, -1);
            if (!owns(context, id)) return;
            YearMonth next = month(context, id).plusMonths(PREVIOUS.equals(action) ? -1 : 1);
            if (next.getYear() < 2020 || next.getYear() > 2100) return;
            preferences(context).edit().putString("month-" + id, next.toString()).apply();
            updateAsync(context, new int[]{id});
            return;
        }
        if (MIDNIGHT.equals(action) || Intent.ACTION_DATE_CHANGED.equals(action)
                || Intent.ACTION_TIME_CHANGED.equals(action) || Intent.ACTION_TIMEZONE_CHANGED.equals(action)
                || Intent.ACTION_BOOT_COMPLETED.equals(action) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            updateAsync(context, ids(context));
            return;
        }
        super.onReceive(context, intent);
    }
    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) { updateAsync(context, ids); }
    @Override public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        updateAsync(context, new int[]{id});
    }
    @Override public void onDeleted(Context context, int[] ids) {
        SharedPreferences.Editor edit = preferences(context).edit();
        for (int id : ids) edit.remove("month-" + id);
        edit.apply();
    }
    @Override public void onDisabled(Context context) {
        ((AlarmManager)context.getSystemService(Context.ALARM_SERVICE)).cancel(midnightIntent(context));
    }
    private void updateAsync(Context context, int[] ids) {
        final PendingResult pending = goAsync(); final Context app = context.getApplicationContext();
        WORK.execute(() -> {
            try { refresh(app, ids); }
            catch (Exception error) { Log.e("CalendarWidget", "Cannot update widget", error); }
            finally { if (pending != null) pending.finish(); }
        });
    }
    static void snapshotChanged(Context context, JSONObject state) {
        // Drafts, chat history and bookkeeping do not redraw an unchanged month.
        // Work is serialized with receiver updates; the newest committed file wins.
        Context app = context.getApplicationContext();
        WORK.execute(() -> {
            try {
                JSONObject projection = new JSONObject();
                for (String key : new String[]{"events", "calendars", "settings", "holidayDays"}) projection.put(key, state.opt(key));
                byte[] digest = MessageDigest.getInstance("SHA-256").digest(projection.toString().getBytes(StandardCharsets.UTF_8));
                String fingerprint = Base64.encodeToString(digest, Base64.NO_WRAP);
                if (fingerprint.equals(lastDigest)) return;
                refresh(app, ids(app));
                lastDigest = fingerprint;
            } catch (Exception error) { Log.e("CalendarWidget", "Cannot refresh saved schedules", error); }
        });
    }
    private static SharedPreferences preferences(Context context) { return context.getSharedPreferences("calendar-widget", Context.MODE_PRIVATE); }
    private static int[] ids(Context context) {
        return AppWidgetManager.getInstance(context).getAppWidgetIds(new ComponentName(context, CalendarWidgetProvider.class));
    }
    private static boolean owns(Context context, int id) {
        AppWidgetProviderInfo info = AppWidgetManager.getInstance(context).getAppWidgetInfo(id);
        return info != null && new ComponentName(context, CalendarWidgetProvider.class).equals(info.provider);
    }
    private static YearMonth month(Context context, int id) {
        try { return YearMonth.parse(preferences(context).getString("month-" + id, YearMonth.now().toString())); }
        catch (RuntimeException invalid) { return YearMonth.now(); }
    }
    private static void refresh(Context context, int[] ids) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        for (int id : ids) {
            if (!owns(context, id)) continue;
            YearMonth month = month(context, id);
            WidgetCalendarData data = new WidgetCalendarData(context, month);
            Bundle options = manager.getAppWidgetOptions(id);
            manager.updateAppWidget(id, responsive(context, id, month, data, options));
        }
        if (CalendarWidgetProvider.ids(context).length > 0) scheduleMidnight(context);
    }
    private static RemoteViews responsive(Context context, int id, YearMonth month, WidgetCalendarData data, Bundle options) {
        float width = Math.max(230, options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 360));
        float height = Math.max(390, options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 540));
        if (Build.VERSION.SDK_INT >= 31) {
            ArrayList<SizeF> sizes = options.getParcelableArrayList(AppWidgetManager.OPTION_APPWIDGET_SIZES);
            Map<SizeF, RemoteViews> layouts = new LinkedHashMap<>();
            if (sizes != null) for (SizeF size : sizes) {
                if (layouts.size() == 4) break;
                if (size.getWidth() > 0 && size.getHeight() > 0)
                    layouts.put(size, render(context, id, month, data, size.getWidth(), size.getHeight()));
            }
            if (layouts.isEmpty()) {
                layouts.put(new SizeF(230, 390), render(context, id, month, data, 230, 390));
                layouts.put(new SizeF(width, height), render(context, id, month, data, width, height));
            }
            if (layouts.size() == 1) return layouts.values().iterator().next();
            return new RemoteViews(layouts);
        }
        return render(context, id, month, data, width, height);
    }
    private static RemoteViews render(Context context, int id, YearMonth month, WidgetCalendarData data, float width, float height) {
        RemoteViews root = new RemoteViews(context.getPackageName(), R.layout.calendar_widget);
        int text = Color.parseColor(data.dark ? "#E3EEE5" : "#203B30");
        int muted = Color.parseColor(data.dark ? "#9DB3A6" : "#71847A");
        int weekend = Color.parseColor(data.dark ? "#DBA995" : "#AC7563");
        root.setInt(R.id.widget_root, "setBackgroundResource", data.dark ? R.drawable.widget_background_dark : R.drawable.widget_background);
        root.setTextViewText(R.id.widget_month, month.getMonthValue() + "月");
        root.setTextViewText(R.id.widget_year, String.valueOf(month.getYear()));
        root.setTextColor(R.id.widget_month, text); root.setTextColor(R.id.widget_year, muted);
        root.setTextViewTextSize(R.id.widget_month, TypedValue.COMPLEX_UNIT_SP, width < 290 ? 23 : 27);
        root.setOnClickPendingIntent(R.id.widget_ai, open(context, id, "ai", ""));
        root.setOnClickPendingIntent(R.id.widget_previous, move(context, id, PREVIOUS));
        root.setOnClickPendingIntent(R.id.widget_next, move(context, id, NEXT));
        root.setOnClickPendingIntent(R.id.widget_month_home, open(context, id, "date", month.atDay(1).toString()));
        root.setContentDescription(R.id.widget_month_home, month.getYear() + "年" + month.getMonthValue() + "月，打开月历");
        root.removeAllViews(R.id.widget_weekdays); root.removeAllViews(R.id.widget_weeks);
        String[] weekdays = {"日", "一", "二", "三", "四", "五", "六"};
        for (int i = 0; i < 7; i++) {
            int day = (data.weekStart + i) % 7;
            RemoteViews label = new RemoteViews(context.getPackageName(), R.layout.widget_weekday);
            label.setTextViewText(R.id.widget_weekday, weekdays[day]);
            label.setTextColor(R.id.widget_weekday, day == 0 || day == 6 ? weekend : muted);
            root.addView(R.id.widget_weekdays, label);
        }
        float rowHeight = (height - 118) / (data.days.size() / 7);
        float scale = Math.max(1, context.getResources().getConfiguration().fontScale);
        int lines = rowHeight >= 84 * scale ? 2 : rowHeight >= 66 * scale ? 1 : 0;
        LocalDate today = LocalDate.now();
        for (int start = 0; start < data.days.size(); start += 7) {
            RemoteViews week = new RemoteViews(context.getPackageName(), R.layout.widget_week);
            for (int column = 0; column < 7; column++) {
                LocalDate day = data.days.get(start + column); String date = day.toString();
                boolean outside = !YearMonth.from(day).equals(month);
                RemoteViews cell = new RemoteViews(context.getPackageName(), R.layout.widget_day);
                cell.setTextViewText(R.id.widget_date, String.valueOf(day.getDayOfMonth()));
                cell.setTextViewTextSize(R.id.widget_date, TypedValue.COMPLEX_UNIT_SP, data.largeFont ? 18 : 16);
                cell.setTextColor(R.id.widget_date, outside ? Color.parseColor(data.dark ? "#61786B" : "#BBC8BD")
                        : day.equals(today) ? Color.WHITE : day.getDayOfWeek().getValue() >= 6 ? weekend : text);
                if (day.equals(today)) cell.setInt(R.id.widget_date, "setBackgroundResource", R.drawable.widget_today);
                String observance = data.observance(date);
                cell.setTextViewText(R.id.widget_observance, observance);
                cell.setTextColor(R.id.widget_observance, outside ? muted : weekend);
                JSONObject holiday = data.holidays.get(date);
                if (holiday != null) {
                    cell.setViewVisibility(R.id.widget_holiday_badge, View.VISIBLE);
                    cell.setTextViewText(R.id.widget_holiday_badge, holiday.optBoolean("isOffDay") ? "休" : "班");
                    cell.setTextColor(R.id.widget_holiday_badge, data.dark ? Color.parseColor("#BFD4C4") : Color.parseColor("#507C63"));
                }
                List<JSONObject> events = data.events.get(date);
                if (events != null && !outside) for (int i = 0; i < Math.min(lines, events.size()); i++) {
                    JSONObject event = events.get(i); int viewId = i == 0 ? R.id.widget_event : R.id.widget_event_second;
                    String title = event.optString("title");
                    if (i == lines - 1 && events.size() > lines) title += " · +" + (events.size() - lines);
                    cell.setViewVisibility(viewId, View.VISIBLE); cell.setTextViewText(viewId, title);
                    cell.setInt(viewId, "setBackgroundResource", data.dark ? R.drawable.widget_event_background_dark : R.drawable.widget_event_background);
                    int eventColor = data.calendarColors.containsKey(event.optString("calendar")) ? data.calendarColors.get(event.optString("calendar")) : Color.parseColor("#6882D8");
                    cell.setTextColor(viewId, data.dark ? Color.parseColor("#D4E2D5") : readable(eventColor));
                }
                String description = day.getMonthValue() + "月" + day.getDayOfMonth() + "日" + (observance.isEmpty() ? "" : "，" + observance);
                if (holiday != null) description += holiday.optBoolean("isOffDay") ? "，放假" : "，调休上班";
                if (events != null) for (JSONObject event : events) description += "，" + event.optString("time") + " " + event.optString("title");
                cell.setContentDescription(R.id.widget_day, description);
                cell.setOnClickPendingIntent(R.id.widget_day, open(context, id, "date", date));
                week.addView(R.id.widget_week, cell);
            }
            root.addView(R.id.widget_weeks, week);
        }
        return root;
    }
    private static int readable(int color) {
        // Calendar colors chosen for chips can be pale; keep their hue with darker text.
        return Color.rgb((int)(Color.red(color) * .70), (int)(Color.green(color) * .70), (int)(Color.blue(color) * .70));
    }
    private static PendingIntent open(Context context, int id, String target, String date) {
        Intent intent = new Intent(context, MainActivity.class).setAction(OPEN)
                .setData(Uri.parse("calendarledger://widget/" + id + "/" + target + "/" + date))
                .putExtra("widgetTarget", target).putExtra("widgetDate", date)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    private static PendingIntent move(Context context, int id, String action) {
        Intent intent = new Intent(context, CalendarWidgetProvider.class).setAction(action)
                .setData(Uri.parse("calendarledger://widget/" + id + "/" + action))
                .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
        return PendingIntent.getBroadcast(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    private static PendingIntent midnightIntent(Context context) {
        return PendingIntent.getBroadcast(context, 0, new Intent(context, CalendarWidgetProvider.class).setAction(MIDNIGHT),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    private static void scheduleMidnight(Context context) {
        long tomorrow = LocalDate.now().plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli();
        // This is deliberately inexact. A date highlight does not need alarm permission.
        ((AlarmManager)context.getSystemService(Context.ALARM_SERVICE)).setAndAllowWhileIdle(AlarmManager.RTC, tomorrow, midnightIntent(context));
    }
}
