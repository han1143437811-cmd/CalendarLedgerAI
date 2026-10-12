import {THINKING_LEVELS,isDeepSeek,modelLabel} from './ai-options.mjs';
export function openAIControls({config,state,openModal,escape,save,fetchModels,compress}){
  openModal('模型与思考','为记账、日程和分析选择合适的模型与强度。',`
    <div id="ai-controls-panel"><p class="settings-note">使用你已配置的 API 与密钥。切换模型保留聊天、记忆和账目。</p>
    <form data-ai-controls><div class="form-grid"><div class="form-field full"><label for="ai-model-id">当前模型</label><input id="ai-model-id" name="model" value="${escape(config.model)}" maxlength="128" required></div></div>
    <div class="ai-model-choices">${(isDeepSeek(config.baseURL)?['deepseek-flash','deepseek-v4-pro']:[]).map(id=>`<button class="btn ${config.model===id?'soft':''}" type="button" data-model-choice="${id}">${modelLabel(id)}</button>`).join('')}</div>
    <button class="text-button" type="button" data-fetch-models>从当前 API 获取模型列表</button><div data-model-list></div>
    <div class="ai-thinking-control"><div class="between"><b>思考强度</b><span data-thinking-label></span></div><input aria-label="思考强度" name="effort" type="range" min="0" max="3" step="1" value="${Math.max(0,THINKING_LEVELS.findIndex(row=>row.value===config.effort))}" ${isDeepSeek(config.baseURL)?'':'disabled'}><div class="thinking-ticks"><span>关闭</span><span>轻度</span><span>深度</span><span>最大</span></div><p class="settings-note">${isDeepSeek(config.baseURL)?'轻度适合日常操作，深度适合复杂分析；最大可能更慢、消耗更多输出额度。档位对应 DeepSeek 官方参数。':'此自定义服务暂未配置思考参数映射，强度控制只对 DeepSeek 官方接口生效。'}</p></div>
    <label class="record-row"><span class="grow">自动压缩上下文<span class="record-meta">较早内容达到阈值时额外请求一次摘要，保留最近三轮原始对话</span></span><input name="autoSummary" type="checkbox" ${config.autoSummary!==false?'checked':''}></label>
    <p class="settings-note">摘要会调用当前所选模型，关闭思考；会产生 API 用量，不修改账目、日程和已确认偏好。</p>
    <div class="form-error" role="alert"></div><div class="form-actions"><button class="btn primary" type="submit">应用设置</button><button class="btn" type="button" data-compress-now>立即压缩</button></div></form>
    <p class="settings-note">${state.aiSummary?'已有摘要，可在“AI 记忆”页面查看。':'尚未生成摘要；至少积累四轮对话后可手动压缩。'}</p></div>`);
  const panel=document.querySelector('#ai-controls-panel'),form=panel.querySelector('form'),error=panel.querySelector('.form-error');
  const range=form.elements.effort,label=panel.querySelector('[data-thinking-label]');
  const updateLabel=()=>label.textContent=THINKING_LEVELS[Number(range.value)].label;updateLabel();range.addEventListener('input',updateLabel);
  panel.addEventListener('click',async event=>{
    const choice=event.target.closest('[data-model-choice]');if(choice){form.elements.model.value=choice.dataset.modelChoice;for(const button of panel.querySelectorAll('[data-model-choice]'))button.classList.toggle('soft',button.dataset.modelChoice===choice.dataset.modelChoice);}
    const fetchButton=event.target.closest('[data-fetch-models]');if(fetchButton){fetchButton.disabled=true;error.textContent='';try{const items=await fetchModels();panel.querySelector('[data-model-list]').innerHTML=items.map(id=>`<button class="btn" type="button" data-model-choice="${escape(id)}">${escape(id)}</button>`).join('');}catch(e){error.textContent=e.message;}finally{fetchButton.disabled=false;}}
    const button=event.target.closest('[data-compress-now]');if(button){button.disabled=true;error.textContent='';try{await compress();button.textContent='压缩检查完成';}catch(e){error.textContent=e.message;}finally{button.disabled=false;}}
  });
  form.addEventListener('submit',async event=>{event.preventDefault();const button=form.querySelector('[type=submit]');button.disabled=true;error.textContent='';try{await save({model:form.elements.model.value.trim(),effort:THINKING_LEVELS[Number(range.value)].value,autoSummary:form.elements.autoSummary.checked});button.textContent='已应用';}catch(e){error.textContent=e.message;}finally{button.disabled=false;}});
}
