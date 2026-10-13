import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateHolidays} from './holiday-data.mjs';
import {completionOptions} from './ai-options.mjs';
import {fetchPublicPage} from './web-server.mjs';
import {validateWebURL,validateWebQuery,parseSearchResults} from './web-tools.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.json':'application/json; charset=utf-8'};
function validateBaseURL(value){const url=new URL(value);if(url.username||url.password||url.search||url.hash)throw new Error('API 地址不能包含账号、密码、查询参数或锚点。');if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw new Error('远程 API 请使用 HTTPS 地址。');return url.href.replace(/\/$/,'');}
async function readJSON(request){if(!request.headers['content-type']?.startsWith('application/json'))throw new Error('请求需要使用 JSON。');let body='';for await(const chunk of request){body+=chunk;if(body.length>12_000_000)throw new Error('请求内容过大，请清空对话后重试。');}return JSON.parse(body||'{}');}
function sendJSON(response,status,value){response.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});response.end(JSON.stringify(value));}
export function createPreviewServer({upstreamFetch=globalThis.fetch,webFetch=fetchPublicPage}={}){
  let config={baseURL:'https://api.deepseek.com',model:'deepseek-flash',apiKey:''};
  const publicConfig=()=>({baseURL:config.baseURL,model:config.model,configured:!!config.apiKey});
  async function completion(payload){if(!config.apiKey)throw new Error('请先配置 API Key。');const url=config.baseURL.endsWith('/chat/completions')?config.baseURL:`${config.baseURL}/chat/completions`;
    const body={model:config.model,messages:payload.messages,stream:false,...completionOptions(config.baseURL,payload.effort??'none',{summary:payload.purpose==='summary'}),...(payload.tools?.length&&payload.purpose!=='summary'?{tools:payload.tools,tool_choice:'auto'}:{})};
    const upstream=await upstreamFetch(url,{method:'POST',headers:{Authorization:`Bearer ${config.apiKey}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(payload.effort&&payload.effort!=='none'?300000:110000)});
    let data;try{data=await upstream.json();}catch{throw new Error(`API 返回了无法解析的内容（HTTP ${upstream.status}）。`);}
    if(!upstream.ok){const detail=String(data.error?.message??data.message??'请求失败').split(config.apiKey).join('[已隐藏]').slice(0,400);throw new Error(`API 错误 ${upstream.status}：${detail}`);}
    if(data.choices?.[0]?.finish_reason==='length')throw new Error('模型输出达到长度上限，尚未收到完整回复；已完成的本地操作保留。');
    const message=data.choices?.[0]?.message;if(!message)throw new Error('API 未返回有效回复；请确认该服务支持 Chat Completions。');return{message,model:data.model??config.model,usage:data.usage??null};
  }
  const server=http.createServer(async(request,response)=>{
    response.setHeader('X-Content-Type-Options','nosniff');response.setHeader('Referrer-Policy','no-referrer');response.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    try{const requestURL=new URL(request.url,'http://127.0.0.1');const route=requestURL.pathname;
      if(route.startsWith('/api/')){const origin=request.headers.origin;if(origin){const parsed=new URL(origin);if(!['127.0.0.1','localhost'].includes(parsed.hostname)||parsed.port!==String(server.address().port)){sendJSON(response,403,{error:'不允许其他网页访问本机 API 配置。'});return;}}
        if(route==='/api/health'&&request.method==='GET'){sendJSON(response,200,{ok:true,app:'calendar-ledger-ai-preview',version:'0.3.6'});return;}
        if(route==='/api/config'&&request.method==='GET'){sendJSON(response,200,publicConfig());return;}
        if(route==='/api/models'&&request.method==='GET'){
          if(!config.apiKey)throw new Error('请先配置 API Key。');
          const base=config.baseURL.replace(/\/chat\/completions$/,'');
          const upstream=await upstreamFetch(base+'/models',{headers:{Authorization:`Bearer ${config.apiKey}`},signal:AbortSignal.timeout(20000)});
          if(!upstream.ok)throw new Error('服务未提供模型列表，可手动填写模型 ID。');
          const result=await upstream.json();sendJSON(response,200,{items:(result.data??[]).map(row=>row.id).filter(id=>typeof id==='string'&&id.length<=128).slice(0,80)});return;
        }
        if(route==='/api/holidays'&&request.method==='GET'){
          const year=Number(requestURL.searchParams.get('year'));if(!Number.isInteger(year)||year<2020||year>2100)throw new Error('节假日年份无效。');
          const sources=[`https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/${year}.json`,`https://fastly.jsdelivr.net/gh/NateScarlet/holiday-cn@master/${year}.json`,`https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/${year}.json`];let last;
          for(const source of sources){try{const reply=await upstreamFetch(source,{signal:AbortSignal.timeout(12000)});if(!reply.ok)throw new Error(`HTTP ${reply.status}`);const data=validateHolidays(await reply.json(),year);sendJSON(response,200,{...data,dataURL:source});return;}catch(error){last=error;}}
          throw new Error('节假日联网更新失败，仍可使用缓存。'+(last?.message??''));
        }
        if(request.method!=='POST'){sendJSON(response,405,{error:'请求方法不支持。'});return;}
        const body=await readJSON(request);
        if(route==='/api/web-search'){
          const query=validateWebQuery(body.query),sources=[{provider:'DuckDuckGo',url:'https://html.duckduckgo.com/html/?q='+encodeURIComponent(query)},{provider:'Bing RSS',url:'https://www.bing.com/search?format=rss&setlang=zh-hans&q='+encodeURIComponent(query)}];let last;
          for(const source of sources)try{const data=await webFetch(source.url);if(!parseSearchResults(data.content,source.provider).length)throw new Error('搜索源没有可用结果。');sendJSON(response,200,{...data,provider:source.provider});return;}catch(error){last=error;}
          throw new Error('联网搜索未取得结果。'+(last?.message??''));
        }
        if(route==='/api/web-read'){sendJSON(response,200,await webFetch(validateWebURL(body.url)));return;}
        if(route==='/api/config'){const baseURL=validateBaseURL(body.baseURL??config.baseURL);const model=String(body.model??config.model).trim();if(!model||model.length>128)throw new Error('请填写有效模型名称。');const apiKey=typeof body.apiKey==='string'&&body.apiKey.trim()?body.apiKey.trim():config.apiKey;if(!apiKey)throw new Error('请在设置中填写 API Key。');if(apiKey.length>2000)throw new Error('API Key 长度异常。');config={baseURL,model,apiKey};sendJSON(response,200,publicConfig());return;}
        if(route==='/api/test'){const result=await completion({messages:[{role:'user',content:'请只回复 OK，用于测试 API 连接。'}]});sendJSON(response,200,{ok:true,model:result.model});return;}
        if(route==='/api/chat'){if(!Array.isArray(body.messages)||body.messages.length<1||body.messages.length>300)throw new Error('会话长度不符合要求，请开始新会话。');if(body.tools!==undefined&&(!Array.isArray(body.tools)||body.tools.length>96))throw new Error('操作接口数量异常。');const result=await completion({messages:body.messages,tools:body.tools,effort:body.effort,purpose:body.purpose});sendJSON(response,200,result);return;}
        sendJSON(response,404,{error:'没有这个接口。'});return;
      }
      if(!['GET','HEAD'].includes(request.method)){sendJSON(response,405,{error:'请求方法不支持。'});return;}
      const relative=decodeURIComponent(route==='/'?'/index.html':route),file=path.resolve(root,'.'+relative);if(!file.startsWith(root+path.sep)||relative.includes('\0')){sendJSON(response,403,{error:'路径不允许访问。'});return;}
      const ext=path.extname(file);if(!types[ext]||relative.includes('/tests/')||relative.endsWith('/server.mjs')){sendJSON(response,404,{error:'文件不存在。'});return;}
      try{const data=await readFile(file);response.writeHead(200,{'Content-Type':types[ext],'Cache-Control':'no-cache'});response.end(request.method==='HEAD'?undefined:data);}catch{sendJSON(response,404,{error:'文件不存在。'});}
    }catch(error){const message=error.name==='TimeoutError'?'API 请求超时，已完成的本地操作仍然保留。':error.message;sendJSON(response,400,{error:message});}
  });return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const port=Number(process.env.CALENDAR_LEDGER_PORT??8788);if(!Number.isInteger(port)||port<1||port>65535)throw new Error('预览端口无效。');const server=createPreviewServer();server.listen(port,'127.0.0.1',()=>console.log(`日历账本预览已启动：http://127.0.0.1:${port}`));server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`端口 ${port} 已被使用。请打开现有预览或换一个端口。`:error.message);process.exitCode=1;});
}
