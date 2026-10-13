package org.calendarledger.preview;
import android.content.SharedPreferences;
import android.util.Base64;
import org.json.*;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.io.IOException;
/** Keys remain encrypted and are bound to one normalized service endpoint. */
final class ApiConnections {
    interface KeyProvider {javax.crypto.SecretKey key()throws Exception;}
    private final SharedPreferences preferences;private final KeyProvider keys;
    ApiConnections(SharedPreferences preferences,KeyProvider keys){this.preferences=preferences;this.keys=keys;}
    private String id(String base)throws Exception {byte[] bytes=MessageDigest.getInstance("SHA-256").digest(base.getBytes(StandardCharsets.UTF_8));StringBuilder result=new StringBuilder();for(byte item:bytes)result.append(String.format(java.util.Locale.ROOT,"%02x",item&255));return result.toString();}
    private JSONObject profiles()throws Exception {
        JSONObject rows=new JSONObject(preferences.getString("profiles","{}"));
        if(!preferences.getString("keyCipher","").isEmpty()){
            String raw=preferences.getString("baseURL","https://api.deepseek.com"),provider=preferences.getString("provider",ApiEndpoints.infer(raw)),base=ApiEndpoints.normalize(raw,provider);
            rows.put(id(base),new JSONObject().put("baseURL",base).put("provider",provider).put("model",preferences.getString("model","deepseek-flash")).put("thinkingFormat",preferences.getString("thinkingFormat","auto")).put("keyIV",preferences.getString("keyIV","")).put("keyCipher",preferences.getString("keyCipher","")));
        }
        return rows;
    }
    synchronized JSONObject publicConfig()throws Exception {
        String raw=preferences.getString("baseURL","https://api.deepseek.com"),provider=preferences.getString("provider",ApiEndpoints.infer(raw));JSONArray list=new JSONArray();JSONObject rows=profiles();
        java.util.Iterator<String> names=rows.keys();while(names.hasNext()){JSONObject row=rows.getJSONObject(names.next());list.put(new JSONObject().put("baseURL",row.getString("baseURL")).put("provider",row.getString("provider")).put("model",row.getString("model")).put("thinkingFormat",row.optString("thinkingFormat","auto")).put("configured",!row.optString("keyCipher").isEmpty()));}
        return new JSONObject().put("baseURL",ApiEndpoints.normalize(raw,provider)).put("provider",provider).put("model",preferences.getString("model","deepseek-flash")).put("thinkingFormat",preferences.getString("thinkingFormat","auto")).put("configured",!preferences.getString("keyCipher","").isEmpty()).put("profiles",list);
    }
    synchronized JSONObject configure(JSONObject input)throws Exception {
        String raw=input.optString("baseURL",preferences.getString("baseURL","https://api.deepseek.com")),provider=input.optString("provider",ApiEndpoints.infer(raw));
        String base=ApiEndpoints.normalize(raw,provider),model=input.optString("model",preferences.getString("model","deepseek-flash")).trim(),format=ApiEndpoints.thinking(input.optString("thinkingFormat","auto"));
        if(model.isEmpty()||model.length()>128)throw new IOException("请填写有效模型名称。");String key=input.optString("apiKey","").trim();if(key.length()>2000||key.contains("\n")||key.contains("\r"))throw new IOException("API Key 长度或格式异常。");
        JSONObject rows=profiles();String connection=id(base);JSONObject old=rows.optJSONObject(connection);
        if(old==null&&rows.length()>=8)throw new IOException("最多保存8个接口地址，请使用已保存的接口。");
        if(key.isEmpty()&&(old==null||old.optString("keyCipher").isEmpty()))throw new IOException("这是新的接口地址，请填写这个服务的 API Key；不会复用其他服务的密钥。");
        JSONObject row=new JSONObject().put("baseURL",base).put("provider",provider).put("model",model).put("thinkingFormat",format);
        if(key.isEmpty()){row.put("keyIV",old.getString("keyIV")).put("keyCipher",old.getString("keyCipher"));}
        else {Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,keys.key());row.put("keyIV",Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP)).put("keyCipher",Base64.encodeToString(cipher.doFinal(key.getBytes(StandardCharsets.UTF_8)),Base64.NO_WRAP));}
        rows.put(connection,row);
        preferences.edit().putString("profiles",rows.toString()).putString("baseURL",base).putString("provider",provider).putString("model",model).putString("thinkingFormat",format).putString("keyIV",row.getString("keyIV")).putString("keyCipher",row.getString("keyCipher")).apply();
        return publicConfig();
    }
    synchronized String readActiveKey()throws Exception {String value=preferences.getString("keyCipher","");if(value.isEmpty())return "";Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,keys.key(),new GCMParameterSpec(128,Base64.decode(preferences.getString("keyIV",""),Base64.NO_WRAP)));return new String(cipher.doFinal(Base64.decode(value,Base64.NO_WRAP)),StandardCharsets.UTF_8);}
    synchronized JSONObject queryConnection(JSONObject input)throws Exception {
        if(input.length()==0)return new JSONObject().put("baseURL",publicConfig().getString("baseURL")).put("apiKey",readActiveKey());
        String raw=input.optString("baseURL"),base=ApiEndpoints.normalize(raw,input.optString("provider",ApiEndpoints.infer(raw))),key=input.optString("apiKey","").trim();
        if(key.length()>2000||key.contains("\n")||key.contains("\r"))throw new IOException("API Key 长度或格式异常。");
        if(key.isEmpty()){JSONObject row=profiles().optJSONObject(id(base));if(row!=null){Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,keys.key(),new GCMParameterSpec(128,Base64.decode(row.getString("keyIV"),Base64.NO_WRAP)));key=new String(cipher.doFinal(Base64.decode(row.getString("keyCipher"),Base64.NO_WRAP)),StandardCharsets.UTF_8);}}
        if(key.isEmpty())throw new IOException("请填写这个服务的 Key / 网关令牌。");return new JSONObject().put("baseURL",base).put("apiKey",key);
    }
}
