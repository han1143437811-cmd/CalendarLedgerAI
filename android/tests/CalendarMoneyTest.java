import org.calendarledger.preview.CalendarMoney;
import java.util.HashMap;
import java.util.Map;

public class CalendarMoneyTest {
    private static int checks;
    private static void check(boolean value, String message) { checks++; if (!value) throw new AssertionError(message); }
    public static void main(String[] args) {
        Map<String, CalendarMoney.Day> days = new HashMap<>();
        String date = "2026-10-10";
        CalendarMoney.add(days,date,"expense",2580); CalendarMoney.add(days,date,"expense",1230);
        CalendarMoney.add(days,date,"income",650000); CalendarMoney.add(days,date,"refund",500);
        CalendarMoney.add(days,date,"transfer",100000);
        CalendarMoney.Day day = days.get(date);
        check(day.expense()==3310 && day.income==650000, "sum cents; refunds reduce expenses; transfers excluded");
        check(day.expenseCount==2 && day.incomeCount==1 && day.transferCount==1, "counts retain actual records");
        check("−33.1".equals(CalendarMoney.expenseLabel(day)), "exact small expense has a single minus");
        check("6.5千".equals(CalendarMoney.amount(day.income)), "large amounts use a labeled abbreviated unit");
        check(day.description().contains("33.10 元") && day.description().contains("6500.00 元"), "accessible totals remain exact");
        CalendarMoney.add(days,"2026-10-11","refund",2088);
        CalendarMoney.Day refund = days.get("2026-10-11");
        check(refund.expense()==-2088 && "退20.88".equals(CalendarMoney.expenseLabel(refund)), "refund-only day is not double-negated or counted as income");
        CalendarMoney.add(days,"2026-10-12","expense",1200); CalendarMoney.add(days,"2026-10-12","refund",1200);
        check(days.get("2026-10-12").hasExpense() && "−0".equals(CalendarMoney.expenseLabel(days.get("2026-10-12"))), "fully refunded record still appears");
        CalendarMoney.add(days,"2026-10-13","transfer",9900);
        check(days.get("2026-10-13").transferOnly() && days.get("2026-10-13").expense()==0, "transfer-only day has its own marker");
        check(!CalendarMoney.add(days,"2026-02-30","expense",100), "reject impossible dates");
        check(!CalendarMoney.add(days,date,"expense",-100) && !CalendarMoney.add(days,date,"income",100000000001L), "reject invalid amounts");
        check(!CalendarMoney.add(days,date,"unknown",100), "unknown types never change totals");
        check(CalendarMoney.amount(1000000).equals("1万") && CalendarMoney.amount(1).equals("0.01"), "unit boundary and one cent");
        for(int i=0;i<20000;i++)CalendarMoney.add(days,"2026-10-14","expense",100000000000L);
        check(days.get("2026-10-14").expense()==2000000000000000L, "maximum supported imported record count does not overflow 32-bit totals");
        System.out.println("PASS: " + checks + " native accounting checks");
    }
}
