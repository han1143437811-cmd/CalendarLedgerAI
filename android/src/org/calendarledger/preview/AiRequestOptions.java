package org.calendarledger.preview;
import java.net.URL;
import java.io.IOException;
import org.json.JSONObject;

/** Provider options are allow-listed rather than forwarded from arbitrary UI JSON. */
final class AiRequestOptions {
    static void apply(JSONObject payload,JSONObject body,String base)throws Exception {
        String effort=body.optString("effort","none");
        if(!"none".equals(effort)&&!"low".equals(effort)&&!"high".equals(effort)&&!"max".equals(effort))throw new IOException("思考强度无效。");
        boolean summary="summary".equals(body.optString("purpose"));
        String format=ApiEndpoints.thinking(body.optString("thinkingFormat","auto"));
        boolean deepseek="deepseek".equals(format)||!"none".equals(format)&&"api.deepseek.com".equalsIgnoreCase(new URL(base).getHost());
        int tokens=body.optInt("maxTokens",8192);
        if(tokens!=2048&&tokens!=4096&&tokens!=8192&&tokens!=16384&&tokens!=32768)throw new IOException("回复长度上限无效。");
        if(summary){tokens=1600;payload.put("response_format",new JSONObject().put("type","json_object"));effort="none";}
        else if(deepseek){tokens=Math.max(tokens,"max".equals(effort)?32768:"high".equals(effort)?16384:"low".equals(effort)?8192:2048);}
        if(deepseek)payload.put("thinking",new JSONObject().put("type","none".equals(effort)?"disabled":"enabled")).put("reasoning_effort",effort);
        payload.put("max_tokens",tokens);
    }
}
