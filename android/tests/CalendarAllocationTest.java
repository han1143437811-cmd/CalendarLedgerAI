import org.calendarledger.preview.CalendarAllocation;
import java.time.LocalDate;

public class CalendarAllocationTest {
    private static int checks;
    private static void check(boolean value, String message) { checks++; if (!value) throw new AssertionError(message); }
    public static void main(String[] args) {
        check(CalendarAllocation.days("2026-10-01", "2026-10-31") == 31, "31-day month");
        check(CalendarAllocation.days("2024-02-01", "2024-02-29") == 29, "leap February");
        check(CalendarAllocation.amountForDay(3000,"2026-10-01","2026-10-31","2026-10-01") == 97, "remainder goes to first days");
        check(CalendarAllocation.amountForDay(3000,"2026-10-01","2026-10-31","2026-10-31") == 96, "last day exact cents");
        check(CalendarAllocation.amountForDay(3000,"2026-10-01","2026-10-31","2026-11-01") == 0, "outside period omitted");
        check(!CalendarAllocation.validPeriod("2026-02-30","2026-03-01"), "impossible date rejected");
        check(!CalendarAllocation.validPeriod("2026-10-02","2026-10-01"), "reversed range rejected");
        check(!CalendarAllocation.validPeriod("2026-01-01","2027-02-01"), "range bounded");
        for (int count = 1; count <= 366; count++) {
            LocalDate start = LocalDate.of(2024,1,1), end = start.plusDays(count-1);
            for (long total : new long[]{1, 7, 3000, 99999, 100000000000L}) {
                long sum = 0;
                for (int day = 0; day < count; day++) sum += CalendarAllocation.amountForDay(total,start.toString(),end.toString(),start.plusDays(day).toString());
                check(sum == total, "allocation conserves exact total");
            }
        }
        System.out.println("PASS: " + checks + " native allocation checks");
    }
}
