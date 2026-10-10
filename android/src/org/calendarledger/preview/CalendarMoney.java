package org.calendarledger.preview;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.Map;

/** Integer-cent projection using the same accounting rules as core.mjs.cashflow. */
public final class CalendarMoney {
    private CalendarMoney() {}
    public static final class Day {
        public long income, spending, refunds, transfers;
        public int incomeCount, expenseCount, refundCount, transferCount;
        public long expense() { return spending - refunds; }
        public boolean hasExpense() { return expenseCount + refundCount > 0; }
        public boolean transferOnly() { return transferCount > 0 && !hasExpense() && incomeCount == 0; }
        public String description() {
            String value = "";
            if (hasExpense()) value += "，支出 " + exact(expense()) + " 元";
            if (refundCount > 0) value += "（含退款 " + exact(refunds) + " 元抵减）";
            if (incomeCount > 0) value += "，收入 " + exact(income) + " 元";
            if (transferCount > 0) value += "，转账 " + exact(transfers) + " 元，不计入收支";
            return value;
        }
    }
    public static boolean add(Map<String, Day> days, String date, String kind, long cents) {
        if (cents <= 0 || cents > 100000000000L || date == null || !date.matches("\\d{4}-\\d{2}-\\d{2}")) return false;
        try { if (!LocalDate.parse(date).toString().equals(date)) return false; }
        catch (RuntimeException invalid) { return false; }
        if (!"income".equals(kind) && !"expense".equals(kind) && !"refund".equals(kind) && !"transfer".equals(kind)) return false;
        Day day = days.get(date);
        if (day == null) day = new Day();
        // Compute first so an invalid overflowing entry never partially changes a day.
        switch (kind) {
            case "income": day.income = Math.addExact(day.income, cents); day.incomeCount++; break;
            case "expense": day.spending = Math.addExact(day.spending, cents); day.expenseCount++; break;
            case "refund": day.refunds = Math.addExact(day.refunds, cents); day.refundCount++; break;
            case "transfer": day.transfers = Math.addExact(day.transfers, cents); day.transferCount++; break;
            default: return false;
        }
        days.put(date, day);
        return true;
    }
    public static String exact(long cents) { return BigDecimal.valueOf(cents, 2).toPlainString(); }
    public static String amount(long cents) {
        BigDecimal value = BigDecimal.valueOf(cents, 2).abs();
        if (value.compareTo(BigDecimal.valueOf(1000)) < 0) return value.stripTrailingZeros().toPlainString();
        BigDecimal unit = value.compareTo(BigDecimal.valueOf(10000)) < 0 ? BigDecimal.valueOf(1000) : BigDecimal.valueOf(10000);
        String suffix = unit.intValue() == 1000 ? "千" : "万";
        return value.divide(unit, 1, RoundingMode.HALF_UP).stripTrailingZeros().toPlainString() + suffix;
    }
    public static String expenseLabel(Day day) { return (day.expense() < 0 ? "退" : "−") + amount(day.expense()); }
}
