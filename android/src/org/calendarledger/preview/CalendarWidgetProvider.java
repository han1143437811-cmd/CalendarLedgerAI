package org.calendarledger.preview;

import android.app.*;
import android.appwidget.*;
import android.content.*;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.*;
import android.text.Layout;
import android.text.StaticLayout;
import android.text.TextPaint;
import android.text.TextUtils;
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
        // Drafts and chat history do not redraw an unchanged month. Bookkeeping does.
        // Work is serialized with receiver updates; the newest committed file wins.
        Context app = context.getApplicationContext();
        WORK.execute(() -> {
            try {
                JSONObject projection = new JSONObject();
                for (String key : new String[]{"transactions", "events", "calendars", "settings", "holidayDays", "holidayMeta"}) projection.put(key, state.opt(key));
                byte[] digest = MessageDigest.getInstance("SHA-256").digest(projection.toString().getBytes(StandardCharsets.UTF_8));
                String fingerprint = Base64.encodeToString(digest, Base64.NO_WRAP);
                if (fingerprint.equals(lastDigest)) return;
                refresh(app, ids(app));
                lastDigest = fingerprint;
            } catch (Exception error) { Log.e("CalendarWidget", "Cannot refresh saved calendar data", error); }
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
        float height = Math.max(460, options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 540));
        if (Build.VERSION.SDK_INT >= 31) {
            ArrayList<SizeF> sizes = options.getParcelableArrayList(AppWidgetManager.OPTION_APPWIDGET_SIZES);
            Map<SizeF, RemoteViews> layouts = new LinkedHashMap<>();
            if (sizes != null) for (SizeF size : sizes) {
                if (layouts.size() == 4) break;
                if (size.getWidth() > 0 && size.getHeight() > 0)
                    layouts.put(size, render(context, id, month, data, size.getWidth(), size.getHeight()));
            }
            if (layouts.isEmpty()) {
                layouts.put(new SizeF(230, 460), render(context, id, month, data, 230, 460));
                layouts.put(new SizeF(width, height), render(context, id, month, data, width, height));
            }
            if (layouts.size() == 1) return layouts.values().iterator().next();
            return new RemoteViews(layouts);
        }
        return render(context, id, month, data, width, height);
    }
    private static RemoteViews render(Context context, int id, YearMonth month, WidgetCalendarData data, float width, float height) {
        boolean compactRoot = width < 300 || height < 500;
        RemoteViews root = new RemoteViews(context.getPackageName(), compactRoot ? R.layout.calendar_widget_compact : R.layout.calendar_widget);
        float scale = Math.max(1, context.getResources().getConfiguration().fontScale);
        int text = Color.parseColor(data.dark ? "#E9E8E1" : "#37433F");
        int muted = Color.parseColor(data.dark ? "#B3BBB2" : "#636B65");
        int weekend = Color.parseColor(data.dark ? "#D7AAA1" : "#A36F69");
        root.setInt(R.id.widget_root, "setBackgroundResource", data.dark ? R.drawable.widget_background_dark : R.drawable.widget_background);
        root.setTextViewText(R.id.widget_month, month.getMonthValue() + "月");
        root.setTextViewText(R.id.widget_year, String.valueOf(month.getYear()));
        root.setTextColor(R.id.widget_month, text); root.setTextColor(R.id.widget_year, muted);
        root.setTextViewTextSize(R.id.widget_month, TypedValue.COMPLEX_UNIT_DIP, compactRoot ? 16 : 18);
        root.setTextViewTextSize(R.id.widget_year, TypedValue.COMPLEX_UNIT_DIP, compactRoot ? 8.5f : 10);
        root.setTextViewTextSize(R.id.widget_ai_text, TypedValue.COMPLEX_UNIT_DIP, compactRoot ? 9 : 10);
        root.setInt(R.id.widget_weekday_rule, "setBackgroundColor", Color.parseColor(data.dark ? "#485149" : "#E5E8E0"));
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
            label.setTextViewTextSize(R.id.widget_weekday, TypedValue.COMPLEX_UNIT_DIP, compactRoot ? 8.5f : 9);
            label.setInt(R.id.widget_weekday, "setGravity", android.view.Gravity.START | android.view.Gravity.CENTER_VERTICAL);
            int inset = Math.round((compactRoot ? 5 : 10) * context.getResources().getDisplayMetrics().density);
            label.setViewPadding(R.id.widget_weekday, inset, 0, 0, 0);
            root.addView(R.id.widget_weekdays, label);
        }
        float rowHeight = (height - (compactRoot ? 69 : 87)) / (data.days.size() / 7);
        boolean compactDay = compactRoot || rowHeight < 72;
        LocalDate today = LocalDate.now();
        for (int start = 0; start < data.days.size(); start += 7) {
            RemoteViews week = new RemoteViews(context.getPackageName(), R.layout.widget_week);
            week.setInt(R.id.widget_week_rule, "setBackgroundColor", Color.parseColor(data.dark ? "#414B43" : "#EBEDE6"));
            // The inset date surfaces create both horizontal and vertical boundaries.
            week.setViewVisibility(R.id.widget_week_rule, View.GONE);
            for (int column = 0; column < 7; column++) {
                LocalDate day = data.days.get(start + column); String date = day.toString();
                boolean outside = !YearMonth.from(day).equals(month);
                RemoteViews cell = new RemoteViews(context.getPackageName(), compactDay ? R.layout.widget_day_compact : R.layout.widget_day);
                cell.setTextViewText(R.id.widget_date, String.valueOf(day.getDayOfMonth()));
                cell.setTextViewTextSize(R.id.widget_date, TypedValue.COMPLEX_UNIT_DIP, compactDay ? (data.largeFont ? 11.5f : 11) : (data.largeFont ? 15 : 14));
                cell.setTextColor(R.id.widget_date, outside ? Color.parseColor(data.dark ? "#667169" : "#BBBFB5")
                        : day.equals(today) ? Color.WHITE : day.getDayOfWeek().getValue() >= 6 ? weekend : text);
                int background = day.equals(today) ? (data.dark ? R.drawable.widget_day_today_dark : R.drawable.widget_day_today)
                        : outside ? (data.dark ? R.drawable.widget_day_outside_dark : R.drawable.widget_day_outside)
                        : day.getDayOfWeek().getValue() >= 6 ? (data.dark ? R.drawable.widget_day_weekend_dark : R.drawable.widget_day_weekend)
                        : (data.dark ? R.drawable.widget_day_background_dark : R.drawable.widget_day_background);
                cell.setInt(R.id.widget_day_surface, "setBackgroundResource", background);
                if (day.equals(today)) cell.setInt(R.id.widget_date, "setBackgroundResource", R.drawable.widget_today);
                String observance = data.observance(date);
                String lunar = data.lunarDays.optString(date);
                String sublabel = observance.isEmpty() ? lunar : observance;
                cell.setViewVisibility(R.id.widget_observance, sublabel.isEmpty() ? View.GONE : View.VISIBLE);
                cell.setTextViewText(R.id.widget_observance, sublabel);
                cell.setTextViewTextSize(R.id.widget_observance, TypedValue.COMPLEX_UNIT_DIP, compactDay ? 6.5f : 7);
                cell.setTextColor(R.id.widget_observance, outside ? Color.parseColor(data.dark ? "#667169" : "#BBBFB5")
                        : observance.isEmpty() ? muted : weekend);
                JSONObject holiday = data.holidays.get(date);
                if (holiday != null) {
                    cell.setViewVisibility(R.id.widget_holiday_badge, View.VISIBLE);
                    cell.setTextViewText(R.id.widget_holiday_badge, holiday.optBoolean("isOffDay") ? "休" : "班");
                    cell.setTextViewTextSize(R.id.widget_holiday_badge, TypedValue.COMPLEX_UNIT_DIP, compactDay ? 6 : 6.5f);
                    cell.setTextColor(R.id.widget_holiday_badge, data.dark ? Color.parseColor("#BDCDC0") : Color.parseColor("#526B61"));
                }
                CalendarMoney.Day amounts = outside ? null : data.money.get(date);
                int moneyLines = 0;
                if (amounts != null) {
                    if (amounts.hasExpense()) {
                        moneyLines++;
                        cell.setViewVisibility(R.id.widget_expense, View.VISIBLE);
                        moneyText(context, cell, R.id.widget_expense, CalendarMoney.expenseLabel(amounts), compactDay, compactRoot, width, scale);
                        cell.setTextColor(R.id.widget_expense, Color.parseColor(amounts.expense() < 0
                                ? (data.dark ? "#BDCDC0" : "#526F5D") : (data.dark ? "#D7AAA1" : "#965E57")));
                    }
                    if (amounts.incomeCount > 0 || amounts.transferOnly()) {
                        moneyLines++;
                        cell.setViewVisibility(R.id.widget_income, View.VISIBLE);
                        moneyText(context, cell, R.id.widget_income, (amounts.transferOnly() ? "转" : "+") + CalendarMoney.amount(amounts.transferOnly() ? amounts.transfers : amounts.income), compactDay, compactRoot, width, scale);
                        cell.setTextColor(R.id.widget_income, amounts.transferOnly() ? muted : Color.parseColor(data.dark ? "#BDCDC0" : "#526F5D"));
                    }
                }
                float used = (compactDay ? 4 : 6) + (compactDay ? 14 : 18)
                        + (sublabel.isEmpty() ? 0 : compactDay ? 8 : 9) + moneyLines * (compactDay ? 9 : 10);
                int lines = Math.min(2, Math.max(0, (int)((rowHeight - used) / (compactDay ? 19 : 21))));
                List<JSONObject> events = data.events.get(date);
                int shown = events == null || outside ? 0 : Math.min(lines, events.size());
                if (events != null && !outside && events.size() > shown) {
                    cell.setViewVisibility(R.id.widget_event_more, View.VISIBLE);
                    cell.setTextViewText(R.id.widget_event_more, "+" + (events.size() - shown));
                    cell.setTextViewTextSize(R.id.widget_event_more, TypedValue.COMPLEX_UNIT_DIP, compactDay ? 6 : 7);
                    cell.setTextColor(R.id.widget_event_more, muted);
                }
                if (events != null && !outside) for (int i = 0; i < Math.min(lines, events.size()); i++) {
                    JSONObject event = events.get(i); int viewId = i == 0 ? R.id.widget_event : R.id.widget_event_second;
                    String title = event.optString("title");
                    cell.setViewVisibility(viewId, View.VISIBLE); cell.setTextViewText(viewId, title);
                    cell.setTextViewTextSize(viewId, TypedValue.COMPLEX_UNIT_PX,
                            scheduleTextSize(context, title, compactDay, compactRoot, width));
                    cell.setInt(viewId, "setBackgroundResource", data.dark ? R.drawable.widget_event_background_dark : R.drawable.widget_event_background);
                    int eventColor = data.calendarColors.containsKey(event.optString("calendar")) ? data.calendarColors.get(event.optString("calendar")) : Color.parseColor("#6882D8");
                    cell.setTextColor(viewId, data.dark ? Color.parseColor("#D2DBD2") : readable(eventColor));
                }
                String description = day.getMonthValue() + "月" + day.getDayOfMonth() + "日"
                        + (lunar.isEmpty() ? "" : "，农历" + lunar) + (observance.isEmpty() ? "" : "，" + observance);
                if (holiday != null) description += holiday.optBoolean("isOffDay") ? "，放假" : "，调休上班";
                if (amounts != null) description += amounts.description();
                if (events != null) for (JSONObject event : events) description += "，" + event.optString("time") + " " + event.optString("title");
                cell.setContentDescription(R.id.widget_day, description);
                cell.setOnClickPendingIntent(R.id.widget_day, open(context, id, "date", date));
                week.addView(R.id.widget_week, cell);
            }
            root.addView(R.id.widget_weeks, week);
        }
        return root;
    }
    private static float scheduleTextSize(Context context, String title, boolean compactDay, boolean compactRoot, float width) {
        float density = context.getResources().getDisplayMetrics().density;
        int column = (int)Math.floor((Math.round(width * density)
                - 2 * Math.round((compactRoot ? 8 : 12) * density)) / 7f)
                - 2 * Math.round((compactDay ? 2 : 4) * density);
        int availableWidth = Math.max(1, column - Math.round(2 * density) - Math.round(density) - 1);
        int availableHeight = Math.max(1, Math.round((compactDay ? 18 : 20) * density) - 1);
        TextPaint paint = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        paint.setTypeface(Typeface.create("sans-serif", Typeface.NORMAL));
        paint.setTextLocales(context.getResources().getConfiguration().getLocales());
        paint.setElegantTextHeight(Build.VERSION.SDK_INT >= 35);
        float size = (compactDay ? 8 : 8.5f) * density;
        String measuredText = title;
        // Measure the actual title. Short titles keep their readable size; long
        // Chinese titles still fit both fallback-font lines inside the slot.
        for (int attempt = 0; attempt < 5; attempt++) {
            paint.setTextSize(size);
            StaticLayout.Builder builder = StaticLayout.Builder.obtain(measuredText, 0, measuredText.length(), paint, availableWidth)
                    .setIncludePad(false).setMaxLines(2).setBreakStrategy(Layout.BREAK_STRATEGY_SIMPLE)
                    .setHyphenationFrequency(Layout.HYPHENATION_FREQUENCY_NONE)
                    .setEllipsize(TextUtils.TruncateAt.END).setEllipsizedWidth(availableWidth);
            if (Build.VERSION.SDK_INT >= 28) builder.setUseLineSpacingFromFallbacks(true);
            int measured = builder.build().getHeight();
            if (measured <= availableHeight) break;
            size *= availableHeight / (float)measured * .98f;
        }
        return size;
    }
    private static void moneyText(Context context, RemoteViews cell, int id, String label, boolean compactDay, boolean compactRoot, float width, float scale) {
        float density = context.getResources().getDisplayMetrics().density;
        // Android rounds each padding and each weighted column separately.
        // Reserve one pixel after those roundings instead of using an average dp width.
        float available = Math.max(1, (float)Math.floor((Math.round(width * density)
                - 2 * Math.round((compactRoot ? 8 : 12) * density)) / 7f)
                - 2 * Math.round((compactDay ? 2 : 4) * density) - 1);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        float size = (compactDay ? 8 : 9) * density;
        paint.setTextSize(size);
        // Small extra allowance for host font hinting and text measurement rounding.
        size *= Math.min(1, available * .95f / Math.max(1, paint.measureText(label)));
        // RemoteViews/TextView auto-size can retain the previous size on reapply.
        // Measure the actual label on each render; exact cents must never be cut off.
        paint.setTextSize(size);
        float line = paint.getFontSpacing();
        size *= Math.min(1, (compactDay ? 9 : 10) * density / Math.max(1, line));
        cell.setTextViewText(id, label);
        cell.setTextViewTextSize(id, TypedValue.COMPLEX_UNIT_PX, size);
    }
    private static int readable(int color) {
        // Calendar colors chosen for chips can be pale; keep their hue with darker text.
        return Color.rgb((int)(Color.red(color) * .35 + 82 * .65),
                (int)(Color.green(color) * .35 + 103 * .65), (int)(Color.blue(color) * .35 + 95 * .65));
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
