import {thinkingEnabled,providerLabel} from './api-providers.mjs';
import {THINKING_LEVELS,isDeepSeek,modelLabel} from './ai-options.mjs';
import {summaryStatus} from './ai-summary.mjs';
export function openAIControls({config,state,openModal,escape,save,fetchModels,compress,close=()=>{},connect=()=>{},switchConnection=async()=>{},focusThinking=false}){
  openModal('选择模型','继续当前对话，随时换一种思考方式。',`
    <div id="ai-controls-panel" class="chat-model-picker">
    ${config.mode==='demo'?'<p class="settings-note">当前为本地演示。点击「管理 API 连接」保存连接后，开始与真实模型对话。</p>':''}
    <div class="picker-connection"><span>${escape(providerLabel(config.provider))}</span><button class="text-button" type="button" data-connect>管理 API 连接</button></div>
    ${(config.profiles??[]).length>1?'<label class="picker-label">已保存的连接<select data-connection>'+config.profiles.map((row,index)=>'<option value="'+index+'" '+(row.baseURL===config.baseURL?'selected':'')+'>'+escape(providerLabel(row.provider)+' · '+new URL(row.baseURL).host)+'</option>').join('')+'</select></label>':''}
    <input class="model-search" type="search" placeholder="搜索模型" aria-label="搜索模型" data-model-search>
    <div class="model-picker-list" data-model-list role="group" aria-label="可用模型"></div>
    <button class="text-button" type="button" data-fetch-models>刷新模型列表</button><span class="tiny muted" data-model-status></span>
    <form data-ai-controls><label class="picker-label">模型 ID<input id="ai-model-id" name="model" value="${escape(config.model)}" maxlength="128" required placeholder="也可手动填写模型 ID"></label>
    <div class="ai-thinking-control"><div class="between"><b>思考强度</b><span data-thinking-label></span></div><input aria-label="思考强度" name="effort" type="range" min="0" max="3" step="1" value="${Math.max(0,THINKING_LEVELS.findIndex(row=>row.value===config.effort))}" ${thinkingEnabled(config)?'':'disabled'}><div class="thinking-ticks"><span>关闭</span><span>轻度</span><span>深度</span><span>最大</span></div><p class="settings-note">${thinkingEnabled(config)?'使用当前接口的 DeepSeek 思考参数；强度越高，等待时间和用量通常越多。':'当前接口未启用思考参数，可在「管理 API 连接」中选择支持的格式。'}</p></div>
    <label class="picker-label">回复长度上限<select name="maxTokens">${[2048,4096,8192,16384,32768].map(n=>'<option value="'+n+'" '+((config.maxTokens??8192)===n?'selected':'')+'>'+n.toLocaleString()+' tokens'+(n===8192?' · 长文默认':'')+'</option>').join('')}</select></label>
    <p class="settings-note">这是上限，回复按问题需要展开。深度思考会保留足够的推理额度；实际长度受模型和接口限制。</p>
    <label class="record-row"><span class="grow">自动压缩上下文<small class="record-meta">长对话自动摘要，原消息仍可查看</small></span><input name="autoSummary" type="checkbox" ${config.autoSummary!==false?'checked':''}></label>
    <label class="record-row"><span class="grow">允许联网搜索<small class="record-meta">需要时查资料，并显示来源</small></span><input name="webEnabled" type="checkbox" ${config.webEnabled!==false?'checked':''}></label>
    <div class="form-error" role="alert"></div><div class="form-actions"><button class="btn primary" type="submit">应用设置</button><button class="btn" type="button" data-compress-now>压缩上下文</button></div></form>
    <p class="settings-note" data-summary-status role="status">${escape(summaryStatus(state.aiSummary))}</p><p class="settings-note">API 摘要通常请求一次；遇到空回复或格式问题最多补试一次。失败时使用注明来源的本地摘录，原消息保留。</p></div>`);
  const panel=document.querySelector('#ai-controls-panel'),form=panel.querySelector('form'),error=panel.querySelector('.form-error');
  panel.closest('.modal').classList.add('chat-settings-sheet');
  const range=form.elements.effort,label=panel.querySelector('[data-thinking-label]'),list=panel.querySelector('[data-model-list]'),status=panel.querySelector('[data-model-status]');
  let items=[...new Set([config.model,...(config.recentModels?.[config.baseURL]??[]),...(isDeepSeek(config.baseURL)?['deepseek-flash','deepseek-v4-pro']:[])])],saving=false;
  const values=()=>({model:form.elements.model.value.trim(),effort:THINKING_LEVELS[Number(range.value)].value,maxTokens:Number(form.elements.maxTokens.value),autoSummary:form.elements.autoSummary.checked,webEnabled:form.elements.webEnabled.checked});
  function draw(){const query=panel.querySelector('[data-model-search]').value.trim().toLowerCase();list.innerHTML=items.filter(id=>id.toLowerCase().includes(query)).map(id=>'<button type="button" class="model-option '+(id===config.model?'selected':'')+'" data-model-choice="'+escape(id)+'"><span><b>'+escape(modelLabel(id))+'</b><small>'+escape(id===config.model?'当前模型':id)+'</small></span><span aria-hidden="true">'+(id===config.model?'✓':'')+'</span></button>').join('')||'<p class="settings-note">没有匹配项，也可在下方填写模型 ID。</p>';}
  async function refresh(){status.textContent='获取中…';try{const fetched=await fetchModels();if(!panel.isConnected)return;items=[...new Set([config.model,...fetched,...items])];draw();status.textContent='';}catch(e){if(panel.isConnected)status.textContent=e.message;}}
  async function apply(andClose=false){if(saving)return;saving=true;error.textContent='';for(const button of panel.querySelectorAll('button'))button.disabled=true;try{await save(values());if(andClose)close();else status.textContent='已应用';}catch(e){error.textContent=e.message;}finally{saving=false;for(const button of panel.querySelectorAll('button'))button.disabled=false;}}
  const updateLabel=()=>label.textContent=thinkingEnabled(config)?THINKING_LEVELS[Number(range.value)].label:'未启用';updateLabel();range.addEventListener('input',updateLabel);
  for(const name of ['effort','maxTokens','autoSummary','webEnabled'])form.elements[name].addEventListener('change',()=>apply(false));
  panel.querySelector('[data-model-search]').addEventListener('input',draw);
  panel.querySelector('[data-connect]').addEventListener('click',()=>{if(!saving)connect();});
  panel.querySelector('[data-connection]')?.addEventListener('change',async event=>{if(saving)return;error.textContent='';try{await switchConnection(config.profiles[Number(event.target.value)]);}catch(e){error.textContent=e.message;}});
  panel.addEventListener('click',async event=>{
    const choice=event.target.closest('[data-model-choice]');if(choice){form.elements.model.value=choice.dataset.modelChoice;await apply(true);return;}
    if(event.target.closest('[data-fetch-models]'))await refresh();
    const button=event.target.closest('[data-compress-now]');if(button){button.disabled=true;error.textContent='';button.textContent='正在整理…';try{await compress();if(panel.isConnected){button.textContent=state.aiSummary?.source==='local'?'重试 API 摘要':'压缩检查完成';panel.querySelector('[data-summary-status]').textContent=summaryStatus(state.aiSummary);}}catch(e){error.textContent=e.message;button.textContent='重试压缩';}finally{button.disabled=false;}}
  });
  form.addEventListener('submit',async event=>{event.preventDefault();await apply(false);});
  draw();if(config.configured)refresh();else status.textContent='连接 API 后可获取模型列表';
  if(focusThinking)range.scrollIntoView({block:'center'});else panel.querySelector('[data-model-search]').focus({preventScroll:true});
}
