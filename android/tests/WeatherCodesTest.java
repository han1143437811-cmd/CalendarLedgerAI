import org.calendarledger.preview.WeatherCodes;

public final class WeatherCodesTest {
    private static int checks;
    private static void check(boolean value) { checks++; if(!value)throw new AssertionError("weather check "+checks); }
    public static void main(String[] args) {
        check(WeatherCodes.icon(0).equals("sun") && WeatherCodes.describe(0).equals("晴"));
        check(WeatherCodes.icon(1).equals("partly") && WeatherCodes.icon(2).equals("partly"));
        check(WeatherCodes.icon(3).equals("cloud") && WeatherCodes.icon(48).equals("fog"));
        check(WeatherCodes.icon(67).equals("rain") && WeatherCodes.describe(67).equals("冻雨"));
        check(WeatherCodes.icon(86).equals("snow") && WeatherCodes.icon(99).equals("storm"));
        check(WeatherCodes.icon(-1).isEmpty() && WeatherCodes.icon(999).isEmpty());
        check(WeatherCodes.describe(97).equals("强雷雨"));
        long now=1_000_000_000L;
        check(!WeatherCodes.stale(now,now));
        check(!WeatherCodes.stale(now-WeatherCodes.STALE_AFTER,now) && WeatherCodes.stale(now-WeatherCodes.STALE_AFTER-1,now));
        check(!WeatherCodes.expired(now-WeatherCodes.EXPIRES_AFTER,now) && WeatherCodes.expired(now-WeatherCodes.EXPIRES_AFTER-1,now));
        check(WeatherCodes.expired(0,now) && WeatherCodes.expired(now+300_001,now));
        check(!WeatherCodes.expired(now+300_000,now));
        System.out.println("WeatherCodesTest passed "+checks+" checks");
    }
}
