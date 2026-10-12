package org.calendarledger.preview;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;

/** Same integer-cent remainder rule as expense-allocation.mjs. No stored payments. */
public final class CalendarAllocation {
    private CalendarAllocation() {}
    private static LocalDate date(String value) {
        if (value == null || !value.matches("\\d{4}-\\d{2}-\\d{2}")) throw new IllegalArgumentException("Invalid date");
        LocalDate parsed = LocalDate.parse(value);
        if (!parsed.toString().equals(value)) throw new IllegalArgumentException("Invalid date");
        return parsed;
    }
    public static long days(String start, String end) {
        long count = ChronoUnit.DAYS.between(date(start), date(end)) + 1;
        if (count < 1 || count > 366) throw new IllegalArgumentException("Period must be 1-366 days");
        return count;
    }
    public static boolean validPeriod(String start, String end) {
        try { days(start, end); return true; } catch (RuntimeException invalid) { return false; }
    }
    public static long amountForDay(long cents, String start, String end, String target) {
        if (cents <= 0 || cents > 100000000000L) throw new IllegalArgumentException("Invalid cents");
        long count = days(start, end), offset = ChronoUnit.DAYS.between(date(start), date(target));
        return offset < 0 || offset >= count ? 0 : cents / count + (offset < cents % count ? 1 : 0);
    }
}
