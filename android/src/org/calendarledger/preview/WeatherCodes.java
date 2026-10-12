package org.calendarledger.preview;

/** WMO codes and cache policy, independent of Android and the network. */
public final class WeatherCodes {
    public static final long STALE_AFTER = 24L * 60 * 60 * 1000;
    public static final long EXPIRES_AFTER = 72L * 60 * 60 * 1000;
    private WeatherCodes() {}
    public static String icon(int code) {
        switch (code) {
            case 0: return "sun";
            case 1: case 2: return "partly";
            case 3: return "cloud";
            case 45: case 48: return "fog";
            case 51: case 53: case 55: case 56: case 57:
            case 61: case 63: case 65: case 66: case 67:
            case 80: case 81: case 82: return "rain";
            case 71: case 73: case 75: case 77: case 85: case 86: return "snow";
            case 95: case 96: case 97: case 99: return "storm";
            default: return "";
        }
    }
    public static String describe(int code) {
        switch (code) {
            case 0: return "晴";
            case 1: return "晴间多云";
            case 2: return "多云";
            case 3: return "阴";
            case 45: return "雾";
            case 48: return "雾凇";
            case 51: return "小毛毛雨";
            case 53: return "毛毛雨";
            case 55: return "强毛毛雨";
            case 56: case 57: return "冻毛毛雨";
            case 61: return "小雨";
            case 63: return "中雨";
            case 65: return "大雨";
            case 66: case 67: return "冻雨";
            case 71: return "小雪";
            case 73: return "中雪";
            case 75: return "大雪";
            case 77: return "雪粒";
            case 80: return "小阵雨";
            case 81: return "阵雨";
            case 82: return "强阵雨";
            case 85: case 86: return "阵雪";
            case 95: return "雷雨";
            case 97: return "强雷雨";
            case 96: case 99: return "雷雨伴冰雹";
            default: return "天气未知";
        }
    }
    public static boolean expired(long updatedAt, long now) {
        return updatedAt <= 0 || updatedAt > now + 300_000L || now - updatedAt > EXPIRES_AFTER;
    }
    public static boolean stale(long updatedAt, long now) {
        return expired(updatedAt, now) || now - updatedAt > STALE_AFTER;
    }
}
