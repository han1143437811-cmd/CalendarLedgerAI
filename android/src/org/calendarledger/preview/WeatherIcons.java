package org.calendarledger.preview;

final class WeatherIcons {
    private WeatherIcons() {}
    static int resource(String icon, boolean dark) {
        switch (icon) {
            case "sun": return dark ? R.drawable.weather_sun_dark : R.drawable.weather_sun;
            case "partly": return dark ? R.drawable.weather_partly_dark : R.drawable.weather_partly;
            case "cloud": return dark ? R.drawable.weather_cloud_dark : R.drawable.weather_cloud;
            case "fog": return dark ? R.drawable.weather_fog_dark : R.drawable.weather_fog;
            case "rain": return dark ? R.drawable.weather_rain_dark : R.drawable.weather_rain;
            case "snow": return dark ? R.drawable.weather_snow_dark : R.drawable.weather_snow;
            case "storm": return dark ? R.drawable.weather_storm_dark : R.drawable.weather_storm;
            default: throw new IllegalArgumentException("Unknown weather icon");
        }
    }
}
