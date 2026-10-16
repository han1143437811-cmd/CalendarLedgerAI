package org.calendarledger.preview;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ConcurrentHashMap;
import org.json.*;

/** Cancellable foreground-only chat transport. No credentials cross the JS bridge. */
final class ChatTransport {
    static final class Failure extends IOException { final int status; Failure(int status,String message){super(message);this.status=status;} }
    interface Progress { void send(String text); }
    static final class Job { volatile boolean cancelled; volatile HttpURLConnection connection; }
    private final ConcurrentHashMap<String,Job> jobs=new ConcurrentHashMap<>();
    void begin(String id){jobs.put(id,new Job());}
    void end(String id){jobs.remove(id);}
    void cancel(String id){Job job=jobs.get(id);if(job!=null){job.cancelled=true;HttpURLConnection c=job.connection;if(c!=null)new Thread(c::disconnect,"chat-cancel").start();}}
    void close(){for(String id:jobs.keySet())cancel(id);}
    JSONObject post(String id,String address,JSONObject body,String key,Progress progress)throws Exception{
        Job job=jobs.get(id);if(job==null||job.cancelled)throw new IOException("已停止生成。");
        URL url=new URL(address);if(!"https".equals(url.getProtocol()))throw new IOException("远程接口需要 HTTPS。");
        HttpURLConnection connection=(HttpURLConnection)url.openConnection();job.connection=connection;
        try{
            if(job.cancelled)throw new IOException("已停止生成。");
            connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(20000);connection.setReadTimeout(300000);
            connection.setRequestMethod("POST");connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type","application/json; charset=utf-8");connection.setRequestProperty("Accept",body.optBoolean("stream")?"text/event-stream":"application/json");connection.setRequestProperty("Authorization","Bearer "+key);
            try(OutputStream output=connection.getOutputStream()){output.write(body.toString().getBytes(StandardCharsets.UTF_8));}
            int code=connection.getResponseCode();if(code<200||code>=300)throw new Failure(code,"API 错误 "+code+"："+errorDetail(connection,key));
            boolean streaming=String.valueOf(connection.getContentType()).contains("text/event-stream");
            StringBuilder text=new StringBuilder();char[] buffer=new char[2048];int total=0;long sent=0;
            try(Reader reader=new InputStreamReader(connection.getInputStream(),StandardCharsets.UTF_8)){
                int count;while((count=reader.read(buffer))!=-1){if(job.cancelled)throw new IOException("已停止生成。");total+=count;if(total>8_000_000)throw new IOException("回复超过接收上限。");text.append(buffer,0,count);
                    long now=System.currentTimeMillis();if(streaming&&(now-sent>=60||text.length()>=4096)){progress.send(text.toString());text.setLength(0);sent=now;}
                }
            }
            if(job.cancelled)throw new IOException("已停止生成。");
            if(streaming){if(text.length()>0)progress.send(text.toString());return new JSONObject().put("streamed",true);}
            JSONObject result=new JSONObject(text.toString()),choice=result.getJSONArray("choices").getJSONObject(0);
            return new JSONObject().put("message",choice.getJSONObject("message")).put("model",result.optString("model",body.optString("model"))).put("finishReason",choice.optString("finish_reason"));
        }finally{connection.disconnect();job.connection=null;}
    }
    private static String errorDetail(HttpURLConnection connection,String key){
        String detail="请检查所选模型和接口设置。";
        try(InputStream input=connection.getErrorStream()){
            if(input!=null){ByteArrayOutputStream bytes=new ByteArrayOutputStream();byte[] buffer=new byte[1024];int count;
                while(bytes.size()<16384&&(count=input.read(buffer,0,Math.min(buffer.length,16384-bytes.size())))>0)bytes.write(buffer,0,count);
                JSONObject data=new JSONObject(new String(bytes.toByteArray(),StandardCharsets.UTF_8));JSONObject error=data.optJSONObject("error");detail=error==null?data.optString("message",detail):error.optString("message",detail);
            }
        }catch(Exception ignored){}
        if(key!=null&&!key.isEmpty())detail=detail.replace(key,"[已隐藏]");
        detail=detail.replaceAll("\\bsk-[A-Za-z0-9_-]{12,}\\b","[已隐藏]").replaceAll("(?i)Bearer\\s+[^\\s\"<>]+","Bearer [已隐藏]");
        return detail.substring(0,Math.min(detail.length(),400));
    }
}
