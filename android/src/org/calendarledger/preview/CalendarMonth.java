package org.calendarledger.preview;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;

/** Date-only calculations, independent of locale, daylight saving and WebView. */
public final class CalendarMonth {
    private CalendarMonth() {}
    public static List<LocalDate> grid(YearMonth month, int weekStart) {
        if (weekStart != 0 && weekStart != 1) throw new IllegalArgumentException("weekStart");
        LocalDate first = month.atDay(1);
        int offset = (first.getDayOfWeek().getValue() % 7 - weekStart + 7) % 7;
        int count = ((offset + month.lengthOfMonth() + 6) / 7) * 7;
        List<LocalDate> days = new ArrayList<>();
        for (int i = 0; i < count; i++) days.add(first.plusDays(i - offset));
        return days;
    }
}
