import {API_PROVIDERS,inferProvider} from './api-providers.mjs';
export function providerSettings({config,escape,field,input}){
  const provider=config.provider??inferProvider(config.baseURL);
  return field('接口类型',`<select name="provider">${API_PROVIDERS.map(row=>`<option value="${row.id}" ${row.id===provider?'selected':''}>${row.name}</option>`).join('')}</select>`,true)
    +`<div class="form-field full"><label for="saved-api">已保存接口</label><select id="saved-api" data-saved-api><option value="">选择已有服务，也可填写新地址</option>${(config.profiles??[]).map((row,index)=>`<option value="${index}">${escape(row.provider==='newapi'?'New API':row.provider)} · ${escape(new URL(row.baseURL).host+new URL(row.baseURL).pathname)}</option>`).join('')}</select></div>`
    +field('API 地址',input('baseURL',config.baseURL,'url','required placeholder="https://你的网关域名/v1"'),true)
    +'<p class="settings-note full" data-provider-help></p><p class="api-paths full" data-api-paths></p>'
    +field('API Key / 网关令牌',`<input name="apiKey" type="password" autocomplete="off" placeholder="${config.configured?'当前接口已配置；新地址需填写对应 Key':'填写这个服务的 Key / 令牌'}">`,true)
    +field('模型名称',input('model',config.model,'text','required maxlength="128" placeholder="填写服务允许的模型 ID"'),true)
    +'<div class="full"><button class="btn soft" type="button" data-action="settings-models">获取这个接口的模型列表</button><div data-settings-model-list class="api-model-list"></div></div>'
    +field('思考参数兼容方式',`<select name="thinkingFormat"><option value="auto" ${!config.thinkingFormat||config.thinkingFormat==='auto'?'selected':''}>自动：仅 DeepSeek 官方启用</option><option value="deepseek" ${config.thinkingFormat==='deepseek'?'selected':''}>DeepSeek 格式：已确认网关支持时使用</option><option value="none" ${config.thinkingFormat==='none'?'selected':''}>不发送思考参数</option></select>`,true)
    +'<p class="settings-note full">网关的模型名可能不同于上游；以模型列表或服务控制台为准。记账操作需要工具调用，截图需要视觉模型。</p>';
}
