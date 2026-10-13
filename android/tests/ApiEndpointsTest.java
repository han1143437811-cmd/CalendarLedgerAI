package org.calendarledger.preview;
public class ApiEndpointsTest {
    public static void main(String[] args)throws Exception {int checks=0;for(String value:new String[]{"https://gateway.example","https://gateway.example/","https://gateway.example/v1/","https://gateway.example/v1/chat/completions"}){check(ApiEndpoints.normalize(value,"newapi").equals("https://gateway.example/v1"));checks++;}
        check(ApiEndpoints.endpoint("https://gateway.example/tenant/v1/chat/completions","models").equals("https://gateway.example/tenant/v1/models"));checks++;
        check(ApiEndpoints.endpoint("https://api.deepseek.com","chat/completions").equals("https://api.deepseek.com/chat/completions"));checks++;
        check(ApiEndpoints.endpoint("https://openrouter.ai/api/v1","chat/completions").equals("https://openrouter.ai/api/v1/chat/completions"));checks++;
        for(String value:new String[]{"http://gateway.example/v1","https://user:pass@gateway.example/v1","https://gateway.example/v1?key=x","https://gateway.example/v1#key"}){boolean failed=false;try{ApiEndpoints.normalize(value,"newapi");}catch(Exception expected){failed=true;}check(failed);checks++;}
        System.out.println("PASS: "+checks+" native API endpoint checks");}
    private static void check(boolean value){if(!value)throw new AssertionError("API endpoint check failed");}
}
