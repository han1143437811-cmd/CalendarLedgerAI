import org.calendarledger.preview.CalendarMonth;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;

public class CalendarMonthTest {
    private static void check(boolean condition, String message) { if(!condition)throw new AssertionError(message); }
    public static void main(String[] args) {
        List<LocalDate> five=CalendarMonth.grid(YearMonth.of(2026,10),1);
        check(five.size()==35 && five.get(0).equals(LocalDate.of(2026,9,28)),"five weeks, Monday first");
        List<LocalDate> six=CalendarMonth.grid(YearMonth.of(2026,8),1);
        check(six.size()==42 && six.get(41).equals(LocalDate.of(2026,9,6)),"six weeks, last dates retained");
        List<LocalDate> four=CalendarMonth.grid(YearMonth.of(2027,2),1);
        check(four.size()==28 && four.get(27).equals(LocalDate.of(2027,2,28)),"four complete weeks");
        List<LocalDate> sunday=CalendarMonth.grid(YearMonth.of(2026,10),0);
        check(sunday.get(0).equals(LocalDate.of(2026,9,27)),"Sunday first");
        check(CalendarMonth.grid(YearMonth.of(2028,2),1).contains(LocalDate.of(2028,2,29)),"leap day");
        List<LocalDate> boundary=CalendarMonth.grid(YearMonth.of(2027,1),1);
        check(boundary.get(0).equals(LocalDate.of(2026,12,28)),"year boundary");
        int checked=0;
        for(int year=2020;year<=2100;year++)for(int month=1;month<=12;month++)for(int first=0;first<=1;first++) {
            YearMonth value=YearMonth.of(year,month);List<LocalDate> days=CalendarMonth.grid(value,first);
            check(days.size()%7==0 && days.size()>=28 && days.size()<=42,"whole weeks");
            check(days.get(0).getDayOfWeek().getValue()%7==first,"week alignment");
            for(int day=1;day<=value.lengthOfMonth();day++)check(days.contains(value.atDay(day)),"missing date");
            for(int i=1;i<days.size();i++)check(days.get(i).equals(days.get(i-1).plusDays(1)),"date continuity");
            checked++;
        }
        System.out.println("PASS: 6 calendar edge cases and " + checked + " month/week-start combinations");
    }
}
