export const API_PROVIDERS=[
  {id:'deepseek',name:'DeepSeek 官方',baseURL:'https://api.deepseek.com',model:'deepseek-flash'},
  {id:'newapi',name:'New API / One API 网关',baseURL:'',model:''},
  {id:'siliconflow',name:'硅基流动',baseURL:'https://api.siliconflow.cn/v1',model:''},
  {id:'openrouter',name:'OpenRouter',baseURL:'https://openrouter.ai/api/v1',model:''},
  {id:'compatible',name:'其他 Chat Completions 兼容接口',baseURL:'',model:''}
];
export function inferProvider(baseURL){try{const host=new URL(baseURL).hostname;return host==='api.deepseek.com'?'deepseek':host==='api.siliconflow.cn'?'siliconflow':host==='openrouter.ai'?'openrouter':'compatible';}catch{return 'compatible';}}
export function providerLabel(provider){return ({deepseek:'DeepSeek',newapi:'New API',siliconflow:'硅基流动',openrouter:'OpenRouter',compatible:'兼容 API'})[provider]??'兼容 API';}
export function normalizeAPIBase(value,provider=inferProvider(value)){
  if(!API_PROVIDERS.some(row=>row.id===provider))throw new Error('接口类型无效。');
  if(typeof value!=='string'||value.length>2048)throw new Error('API 地址无效。');let url;try{url=new URL(value.trim());}catch{throw new Error('请输入完整的 HTTPS API 地址。');}
  if(url.username||url.password||url.search||url.hash)throw new Error('API 地址不能包含账号、密码、查询参数或锚点。');
  if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw new Error('远程 API 请使用 HTTPS 地址。');
  url.pathname=url.pathname.replace(/\/+$/,'').replace(/\/chat\/completions$/,'');
  if(!url.pathname||url.pathname==='/')url.pathname=provider==='deepseek'?'':'/v1';
  return url.href.replace(/\/$/,'');
}
export function apiEndpoint(baseURL,kind='chat/completions'){return normalizeAPIBase(baseURL,inferProvider(baseURL))+'/'+kind;}
export function thinkingEnabled(config){return config.thinkingFormat==='deepseek'||config.thinkingFormat!=='none'&&inferProvider(config.baseURL)==='deepseek';}
export function bindProviderForm(form,config,{escape}){
  const select=form.elements.provider,base=form.elements.baseURL,model=form.elements.model,key=form.elements.apiKey;
  const update=()=>{const provider=API_PROVIDERS.find(row=>row.id===select.value);form.querySelector('[data-provider-help]').textContent=select.value==='newapi'?'填写你的网关地址，例如 https://你的域名/v1；使用网关令牌和网关允许的模型名称。':'支持 Chat Completions、工具调用与按需获取模型列表；图片需要视觉模型。';
    form.querySelector('[data-api-paths]').textContent=(()=>{try{const root=normalizeAPIBase(base.value,select.value);return '聊天：'+root+'/chat/completions\n模型：'+root+'/models';}catch{return '填写地址后显示请求路径。';}})();
  };
  select.addEventListener('change',()=>{const provider=API_PROVIDERS.find(row=>row.id===select.value);base.value=provider.baseURL;model.value=provider.model;key.value='';form.elements.thinkingFormat.value='auto';update();});
  base.addEventListener('input',update);update();
  form.querySelector('[data-saved-api]').addEventListener('change',event=>{if(event.target.value==='')return;const profile=(config.profiles??[])[Number(event.target.value)];if(!profile)return;select.value=profile.provider;base.value=profile.baseURL;model.value=profile.model;key.value='';form.elements.thinkingFormat.value=profile.thinkingFormat??'auto';update();});
}
