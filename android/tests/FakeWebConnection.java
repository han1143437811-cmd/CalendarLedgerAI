package org.calendarledger.preview.test;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
/** Test APK only: deterministic public-page transport, with no external request. */
final class FakeWebConnection extends HttpURLConnection {
    static boolean credentialsAttached;
    private FakeWebConnection(URL url){super(url);}
    static void install(){URL.setURLStreamHandlerFactory(protocol->"https".equals(protocol)?new URLStreamHandler(){protected URLConnection openConnection(URL url)throws IOException{if(!"8.8.8.8".equals(url.getHost()))throw new IOException("Unexpected test host");return new FakeWebConnection(url);}}:null);}
    public void connect(){}public void disconnect(){}public boolean usingProxy(){return false;}
    public int getResponseCode(){credentialsAttached|=getRequestProperty("Authorization")!=null||getRequestProperty("Cookie")!=null;return url.getPath().contains("redirect-private")?302:200;}
    public String getHeaderField(String name){return "Location".equals(name)?"https://127.0.0.1/private":null;}
    public String getContentType(){return "text/html; charset=utf-8";}
    public InputStream getInputStream(){return new ByteArrayInputStream("<html><title>公开日历资料</title><script>neverExecute()</script><p>这里是公开页面的正文，用于核对日历资料，来源和抓取时间会一同返回给模型。</p></html>".getBytes(StandardCharsets.UTF_8));}
}
