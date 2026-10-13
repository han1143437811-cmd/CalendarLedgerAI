package org.calendarledger.preview.test;
import java.net.*;import java.io.*;import java.nio.charset.StandardCharsets;import org.json.*;
/** A test-only OpenAI-compatible gateway; no external model request. */
final class FakeGatewayConnection extends HttpURLConnection {
    static String lastUrl="",lastAuthorization="";static JSONObject lastPayload;static int chats,models;
    private final ByteArrayOutputStream body=new ByteArrayOutputStream();
    private FakeGatewayConnection(URL url){super(url);}
    static void install(){URL.setURLStreamHandlerFactory(protocol->"https".equals(protocol)?new URLStreamHandler(){protected URLConnection openConnection(URL url)throws IOException{if(!url.getHost().equals("8.8.8.8")&&!url.getHost().equals("8.8.4.4"))throw new IOException("Unexpected test API host");return new FakeGatewayConnection(url);}}:null);}
    public void connect(){}public void disconnect(){}public boolean usingProxy(){return false;}
    public OutputStream getOutputStream(){return body;}public int getResponseCode(){return 200;}public String getContentType(){return "application/json";}
    public InputStream getInputStream()throws IOException {try{
        lastUrl=url.toString();lastAuthorization=getRequestProperty("Authorization");JSONObject response;
        if(url.getPath().endsWith("/models")){models++;response=new JSONObject().put("data",new JSONArray().put(new JSONObject().put("id","tenant-model")));}
        else {chats++;lastPayload=new JSONObject(new String(body.toByteArray(),StandardCharsets.UTF_8));JSONArray messages=lastPayload.getJSONArray("messages");JSONObject last=messages.getJSONObject(messages.length()-1),message=new JSONObject().put("role","assistant");
            if(lastPayload.has("tools")&&!"tool".equals(last.optString("role"))){message.put("content",JSONObject.NULL).put("reasoning_content","查询本地实际账目。").put("tool_calls",new JSONArray().put(new JSONObject().put("id","native_gateway_"+chats).put("type","function").put("function",new JSONObject().put("name","query_cashflow").put("arguments","{\"start\":\"2026-10-01\",\"end\":\"2026-10-31\"}"))));}
            else message.put("content","已查询当前实际收支，以本地工具结果为准。").put("reasoning_content","核对工具返回结果。");
            response=new JSONObject().put("model","tenant-model").put("choices",new JSONArray().put(new JSONObject().put("message",message)));
        }
        return new ByteArrayInputStream(response.toString().getBytes(StandardCharsets.UTF_8));
    }catch(JSONException error){throw new IOException(error);}}
}
