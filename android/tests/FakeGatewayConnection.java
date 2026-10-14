package org.calendarledger.preview.test;
import java.net.*;import java.io.*;import java.nio.charset.StandardCharsets;import org.json.*;
/** A test-only OpenAI-compatible gateway; no external model request. */
final class FakeGatewayConnection extends HttpURLConnection {
    static String lastUrl="",lastAuthorization="";static JSONObject lastPayload;static int chats,models;static String chatMode="";static boolean cancelled;static boolean clockCase;static int clockDelayMillis;static final java.util.List<JSONObject> chatPayloads=new java.util.ArrayList<>();private boolean disconnected;
    private final ByteArrayOutputStream body=new ByteArrayOutputStream();
    private FakeGatewayConnection(URL url){super(url);}
    static void install(){URL.setURLStreamHandlerFactory(protocol->"https".equals(protocol)?new URLStreamHandler(){protected URLConnection openConnection(URL url)throws IOException{if(!url.getHost().equals("8.8.8.8")&&!url.getHost().equals("8.8.4.4"))throw new IOException("Unexpected test API host");return new FakeGatewayConnection(url);}}:null);}
    public void connect(){}public void disconnect(){disconnected=true;cancelled=true;}public boolean usingProxy(){return false;}
    public OutputStream getOutputStream(){return body;}public int getResponseCode(){return 200;}public String getContentType(){return chatMode.isEmpty()||url.getPath().endsWith("/models")?"application/json":"text/event-stream";}
    static byte[] event(JSONObject delta,String finish)throws JSONException{return ("data: "+new JSONObject().put("model","tenant-model").put("choices",new JSONArray().put(new JSONObject().put("index",0).put("delta",delta).put("finish_reason",finish==null?JSONObject.NULL:finish))).toString()+"\n\n").getBytes(StandardCharsets.UTF_8);}
    static JSONObject clockContext(JSONObject payload)throws JSONException{JSONArray rows=payload.getJSONArray("messages");for(int i=0;i<rows.length();i++){JSONObject row=rows.getJSONObject(i);String content=row.optString("content");if(row.optString("role").equals("system")&&content.startsWith("[应用提供的实时设备时间]"))return new JSONObject(content.split("\n")[1]);}throw new JSONException("Missing device clock context");}
    public InputStream getInputStream()throws IOException {try{
        lastUrl=url.toString();lastAuthorization=getRequestProperty("Authorization");JSONObject response;
        if(url.getPath().endsWith("/models")){models++;response=new JSONObject().put("data",new JSONArray().put(new JSONObject().put("id","tenant-model")));}
        else {chats++;lastPayload=new JSONObject(new String(body.toByteArray(),StandardCharsets.UTF_8));chatPayloads.add(lastPayload);if(clockDelayMillis>0)try{Thread.sleep(clockDelayMillis);}catch(InterruptedException e){throw new IOException(e);}if(!chatMode.isEmpty()){
                java.util.List<byte[]> chunks=new java.util.ArrayList<>();
                chunks.add(event(new JSONObject().put("reasoning_content","先理解目标，再分解学习路线。"),null));
                chunks.add(event(new JSONObject().put("content","## 从一个小项目开始\n\n先确定你想解决的问题，再选择学习内容。\n\n"),null));
                String[] pieces={"### 三个阶段\n\n","1. 用 Python 完成一个小工具。\n2. 学会拆分问题并检查结果。\n3. 回顾困难，逐步扩展。\n\n","| 阶段 | 重点 |\n| --- | --- |\n| 起步 | 每天30分钟 |\n| 实践 | 完成一个项目 |\n\n","```python\nprint('一步一步来')\n```\n\n"};
                for(int i=0;i<(chatMode.equals("stop")?40:16);i++)chunks.add(event(new JSONObject().put("content",pieces[i%pieces.length]),null));
                chunks.add(event(new JSONObject(),"stop"));chunks.add("data: [DONE]\n\n".getBytes(StandardCharsets.UTF_8));
                return new InputStream(){int index=0,offset=0;public int read()throws IOException{byte[] one=new byte[1];return read(one,0,1)<0?-1:one[0]&255;}public int read(byte[] target,int start,int length)throws IOException{if(disconnected)throw new IOException("cancelled");if(index>=chunks.size())return -1;if(offset==0)try{Thread.sleep(130);}catch(InterruptedException e){throw new IOException(e);}byte[] chunk=chunks.get(index);int count=Math.min(length,chunk.length-offset);System.arraycopy(chunk,offset,target,start,count);offset+=count;if(offset==chunk.length){index++;offset=0;}return count;}};
            }
            JSONArray messages=lastPayload.getJSONArray("messages");JSONObject last=messages.getJSONObject(messages.length()-1),message=new JSONObject().put("role","assistant");
            if(lastPayload.has("tools")&&!"tool".equals(last.optString("role"))){message.put("content",JSONObject.NULL).put("reasoning_content","查询本地实际账目。").put("tool_calls",new JSONArray().put(new JSONObject().put("id","native_gateway_"+chats).put("type","function").put("function",new JSONObject().put("name","query_cashflow").put("arguments","{\"start\":\"2026-10-01\",\"end\":\"2026-10-31\"}"))));}
            else message.put("content","已查询当前实际收支，以本地工具结果为准。").put("reasoning_content","核对工具返回结果。");
            if(clockCase&&!message.has("tool_calls")){JSONObject clock=clockContext(lastPayload).getJSONObject("currentRequestTime");message.put("content","本次请求的手机时间是 **"+clock.getString("date")+" "+clock.getString("time")+"**，"+clock.getString("weekday")+"，时区 "+clock.getString("timeZone")+"（UTC"+clock.getString("utcOffset")+"）。\n\n已查询本地收支，使用的是手机提供的当前时间。");}
            response=new JSONObject().put("model","tenant-model").put("choices",new JSONArray().put(new JSONObject().put("message",message)));
        }
        return new ByteArrayInputStream(response.toString().getBytes(StandardCharsets.UTF_8));
    }catch(JSONException error){throw new IOException(error);}}
}
