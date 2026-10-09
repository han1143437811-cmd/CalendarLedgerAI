import org.calendarledger.preview.ReminderDates;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
public class ReminderDatesTest {
    private static LocalDate date(String value) { return LocalDate.parse(value); }
    private static void require(boolean passed, String message) { if(!passed)throw new AssertionError(message); }
    public static void main(String[] args) {
        List<LocalDate> daily=ReminderDates.between(date("2020-01-01"),"daily","",date("2026-10-05"),date("2026-10-07"));
        require(daily.size()==3 && daily.get(0).equals(date("2026-10-05")),"historical daily fast-forward");
        List<LocalDate> weekly=ReminderDates.between(date("2020-01-06"),"weekly","",date("2026-10-05"),date("2026-10-15"));
        require(weekly.equals(Arrays.asList(date("2026-10-05"),date("2026-10-12"))),"weekly original weekday");
        List<LocalDate> monthly=ReminderDates.between(date("2020-01-31"),"monthly","",date("2026-01-01"),date("2026-03-31"));
        require(monthly.equals(Arrays.asList(date("2026-01-31"),date("2026-03-31"))),"missing monthly day is skipped");
        require(ReminderDates.between(date("2020-01-01"),"daily","2026-10-04",date("2026-10-05"),date("2026-10-15")).isEmpty(),"ended series");
        require(ReminderDates.between(date("2026-10-08"),"none","",date("2026-10-05"),date("2026-10-15")).size()==1,"one-time future event");
        require(ReminderDates.between(date("2026-10-01"),"none","",date("2026-10-05"),date("2026-10-15")).isEmpty(),"past event");
        System.out.println("PASS: 6 native recurrence checks");
    }
}
