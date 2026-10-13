package org.calendarledger.preview;
import org.json.JSONObject;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.time.Instant;

/** Reads public HTTPS text only. API credentials are never attached. */
final class PublicWebReader {
    static boolean publicAddress(InetAddress address){
        if(address.isAnyLocalAddress()||address.isLoopbackAddress()||address.isLinkLocalAddress()||address.isSiteLocalAddress()||address.isMulticastAddress())return false;
        byte[] bytes=address.getAddress();int a=bytes[0]&255,b=bytes.length>1?bytes[1]&255:0;
        if(bytes.length==4)return !(a==0||a>=224||a==100&&b>=64&&b<=127||a==198&&(b==18||b==19));
        return (a&254)!=252;
    }
    static URL validate(String value)throws Exception{
        if(value==null||value.length()>2048)throw new IOException("网页地址无效。");
        URL url=new URL(value);String host=url.getHost().toLowerCase(java.util.Locale.ROOT);
        if(!"https".equals(url.getProtocol())||url.getUserInfo()!=null||url.getPort()!=-1&&url.getPort()!=443||host.isEmpty()||host.equals("localhost")||host.endsWith(".localhost")||host.endsWith(".local")||host.endsWith(".internal"))throw new IOException("只支持公开 HTTPS 网页。");
        InetAddress[] addresses=InetAddress.getAllByName(host);
        for(InetAddress address:addresses)if(!publicAddress(address))throw new IOException("不读取本机或内网网页。");
        return url;
    }
    static JSONObject read(String value)throws Exception{return read(value,0);}
    private static JSONObject read(String value,int redirects)throws Exception{
        URL url=validate(value);HttpURLConnection connection=(HttpURLConnection)url.openConnection();
        connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(12000);connection.setReadTimeout(15000);
        connection.setRequestProperty("User-Agent","CalendarLedgerAI/0.3.6 (+public-page-reader)");connection.setRequestProperty("Accept","text/html,application/rss+xml,text/plain;q=0.9");
        try{
            int status=connection.getResponseCode();
            if(status==301||status==302||status==303||status==307||status==308){if(redirects>=2)throw new IOException("网页跳转次数过多。");String location=connection.getHeaderField("Location");if(location==null)throw new IOException("网页跳转地址无效。");return read(new URL(url,location).toString(),redirects+1);}
            if(status!=200)throw new IOException("网页读取失败，HTTP "+status);
            ByteArrayOutputStream bytes=new ByteArrayOutputStream();byte[] buffer=new byte[8192];
            try(InputStream stream=connection.getInputStream()){int count;while((count=stream.read(buffer))!=-1){bytes.write(buffer,0,count);if(bytes.size()>750000)throw new IOException("网页超过读取大小上限。");}}
            return new JSONObject().put("url",url.toString()).put("contentType",connection.getContentType()==null?"text/html":connection.getContentType()).put("content",new String(bytes.toByteArray(),StandardCharsets.UTF_8)).put("retrievedAt",Instant.now().toString());
        }finally{connection.disconnect();}
    }
    static JSONObject search(String query)throws Exception{
        if(query==null||query.trim().isEmpty()||query.length()>200)throw new IOException("搜索词应为1—200字。");
        String encoded=URLEncoder.encode(query.trim(),"UTF-8");String[] urls={"https://html.duckduckgo.com/html/?q="+encoded,"https://www.bing.com/search?format=rss&setlang=zh-hans&q="+encoded};String[] names={"DuckDuckGo","Bing RSS"};Exception last=null;
        for(int i=0;i<urls.length;i++)try{JSONObject result=read(urls[i]);String content=result.getString("content");if(i==0&&(!content.contains("result__a")||content.contains("anomaly-modal")||content.contains("challenge-form"))||i==1&&!content.contains("<item>"))throw new IOException("搜索源没有可用结果。");return result.put("provider",names[i]);}catch(Exception error){last=error;}
        throw new IOException("联网搜索未取得结果。"+(last==null?"":last.getMessage()));
    }
}
