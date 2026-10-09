package org.calendarledger.preview;

import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

/** Same recurrence rules as the UI: a monthly day missing in a month is skipped. */
public final class ReminderDates {
    public static List<LocalDate> between(LocalDate first, String repeat, String until,
                                           LocalDate from, LocalDate to) {
        List<LocalDate> dates = new ArrayList<>();
        if (!until.isEmpty()) {
            LocalDate last = LocalDate.parse(until);
            if (last.isBefore(to)) to = last;
        }
        if (to.isBefore(from) || first.isAfter(to)) return dates;
        if ("none".equals(repeat)) {
            if (!first.isBefore(from)) dates.add(first);
            return dates;
        }
        if ("monthly".equals(repeat)) {
            YearMonth initialMonth = YearMonth.from(first);
            long offset = Math.max(0, ChronoUnit.MONTHS.between(initialMonth, YearMonth.from(from)));
            int day = first.getDayOfMonth();
            for (int step = 0; step < 400; step++, offset++) {
                YearMonth month = initialMonth.plusMonths(offset);
                if (month.atDay(1).isAfter(to)) break;
                if (month.lengthOfMonth() < day) continue;
                LocalDate occurrence = month.atDay(day);
                if (!occurrence.isBefore(from) && !occurrence.isAfter(to)) dates.add(occurrence);
            }
            return dates;
        }
        int interval = "daily".equals(repeat) ? 1 : "weekly".equals(repeat) ? 7 : 0;
        if (interval == 0) return dates;
        long elapsed = Math.max(0, ChronoUnit.DAYS.between(first, from));
        LocalDate occurrence = first.plusDays(((elapsed + interval - 1) / interval) * interval);
        for (int step = 0; step < 400 && !occurrence.isAfter(to); step++) {
            dates.add(occurrence);
            occurrence = occurrence.plusDays(interval);
        }
        return dates;
    }
}
