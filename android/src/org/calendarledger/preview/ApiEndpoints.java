package org.calendarledger.preview;
import java.net.*;
import java.io.IOException;
import java.util.Arrays;
final class ApiEndpoints {
    static String infer(String value){try{String host=new URL(value).getHost();return "api.deepseek.com".equalsIgnoreCase(host)?"deepseek":"api.siliconflow.cn".equalsIgnoreCase(host)?"siliconflow":"openrouter.ai".equalsIgnoreCase(host)?"openrouter":"compatible";}catch(Exception ignored){return "compatible";}}
    static String normalize(String value,String provider)throws Exception {
        if(!Arrays.asList("deepseek","newapi","siliconflow","openrouter","compatible").contains(provider))throw new IOException("接口类型无效。");
        if(value==null||value.length()>2048)throw new IOException("API 地址无效。");URL url=new URL(value.trim());
        if(!"https".equals(url.getProtocol())||url.getUserInfo()!=null||url.getQuery()!=null||url.getRef()!=null||url.getHost().isEmpty())throw new IOException("请填写不含凭据、查询参数或锚点的 HTTPS API 地址。");
        String path=url.getPath().replaceAll("/+$","").replaceAll("/chat/completions$","");
        if(path.isEmpty())path="deepseek".equals(provider)?"":"/v1";
        return new URI("https",null,url.getHost().toLowerCase(java.util.Locale.ROOT),url.getPort()==443?-1:url.getPort(),path,null,null).toASCIIString();
    }
    static String endpoint(String base,String suffix)throws Exception{return normalize(base,infer(base))+"/"+suffix;}
    static String thinking(String value)throws IOException{if(!Arrays.asList("auto","none","deepseek").contains(value))throw new IOException("思考参数格式无效。");return value;}
}
