package org.calendarledger.preview.test;

import org.json.*;
import java.io.*;
import java.net.*;
import java.time.*;
import java.util.concurrent.atomic.AtomicInteger;

/** Synthetic HTTPS responses exist only in the instrumentation APK. */
final class FakeWeatherConnection extends HttpURLConnection {
    static final AtomicInteger requests = new AtomicInteger();
    static final AtomicInteger forecasts = new AtomicInteger();
    static volatile boolean fail, block;
    private volatile boolean cancelled;
    private FakeWeatherConnection(URL url) { super(url); }
    static void install() {
        URL.setURLStreamHandlerFactory(protocol -> "https".equals(protocol) ? new URLStreamHandler() {
            @Override protected URLConnection openConnection(URL url) { return new FakeWeatherConnection(url); }
        } : null);
    }
    @Override public void connect() {}
    @Override public boolean usingProxy() { return false; }
    @Override public void disconnect() { cancelled = true; }
    @Override public int getResponseCode() throws IOException {
        if (!"api.open-meteo.com".equals(url.getHost()) && !"geocoding-api.open-meteo.com".equals(url.getHost()))
            throw new IOException("Unrelated network is blocked in this test");
        requests.incrementAndGet();
        if ("api.open-meteo.com".equals(url.getHost())) {
            forecasts.incrementAndGet();
            while (block && !cancelled) {
                try { Thread.sleep(25); } catch (InterruptedException error) { throw new InterruptedIOException(); }
            }
        }
        if (cancelled) throw new InterruptedIOException("cancelled fixture");
        return fail ? 503 : 200;
    }
    @Override public InputStream getInputStream() throws IOException {
        if (cancelled) throw new InterruptedIOException("cancelled fixture");
        try {
            JSONObject response = "geocoding-api.open-meteo.com".equals(url.getHost())
                    ? new JSONObject().put("results", new JSONArray().put(city("北京",39.9075,116.39723)).put(city("上海",31.22222,121.45806)))
                    : forecast();
            return new ByteArrayInputStream(response.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
        } catch (Exception error) { throw new IOException(error); }
    }
    static JSONObject city(String name, double latitude, double longitude) throws Exception {
        return new JSONObject().put("name",name).put("latitude",latitude).put("longitude",longitude)
                .put("timezone","Asia/Shanghai").put("admin1",name+"市").put("country","中国");
    }
    static JSONObject forecast() throws Exception {
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Shanghai"));
        JSONArray dates=new JSONArray(),codes=new JSONArray(),highs=new JSONArray(),lows=new JSONArray();
        int[] cycle={0,2,3,61,95,71,45};
        for(int i=0;i<16;i++) {
            dates.put(today.plusDays(i).toString());codes.put(i==8?JSONObject.NULL:i==9?999:cycle[i%cycle.length]);
            highs.put(i==7?JSONObject.NULL:24+i%3);lows.put(i==7?JSONObject.NULL:13+i%3);
        }
        return new JSONObject().put("daily_units",new JSONObject().put("temperature_2m_max","°C").put("temperature_2m_min","°C"))
                .put("daily",new JSONObject().put("time",dates).put("weather_code",codes)
                        .put("temperature_2m_max",highs).put("temperature_2m_min",lows));
    }
}
