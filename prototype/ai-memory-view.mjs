export function openAIMemory({state, openModal, dispatch, changed, escape}) {
  openModal('AI 记忆与上下文','记住你的偏好，也能随时修改或忘记。',`
    <div id="ai-memory-panel">
      <p class="settings-note">偏好保存在本机，重开应用仍然记得。最近对话与真实操作结果会作为上下文；更早聊天可按关键词查找。使用远程 AI 时，这些必要上下文会发送至你配置的服务。</p>
      <div id="ai-memory-list"></div>
      <form data-memory-form><div class="form-grid">
        <div class="form-field full"><label for="ai-memory-key">记忆名称</label><input id="ai-memory-key" name="key" maxlength="60" placeholder="例如：订阅分摊规则" required></div>
        <div class="form-field full"><label for="ai-memory-value">偏好内容</label><input id="ai-memory-value" name="value" maxlength="300" placeholder="例如：月订阅默认按付款所在自然月均摊" required></div>
      </div><div class="form-error" role="alert"></div><div class="form-actions"><button class="btn primary" type="submit">保存记忆</button></div></form>
      <p class="settings-note">也可以直接对 AI 说：“记住，我的月订阅都保留付款、按天分摊。”同名记忆会更新。</p>
      <button class="btn" type="button" data-memory-clear-chat>清空聊天上下文</button>
      <p class="settings-note">清空聊天不会删除偏好、账目和日程。当前保存最近 <span data-memory-chat-count>${Math.min(200,state.chat.length)}</span> 条消息。</p>
    </div>`);
  const panel=document.querySelector('#ai-memory-panel'), list=panel.querySelector('#ai-memory-list');
  const render=()=>{list.innerHTML=state.aiMemory.length?state.aiMemory.map((row,index)=>`<div class="record-row"><div class="grow"><b>${escape(row.key)}</b><div class="record-meta">${escape(row.value)}</div></div><button class="text-button" type="button" data-memory-delete="${index}">忘记</button></div>`).join(''):'<div class="empty">还没有长期偏好，告诉 AI 你希望它记住什么。</div>';};
  render();
  panel.querySelector('form').addEventListener('submit',event=>{
    event.preventDefault();const form=event.target, data=Object.fromEntries(new FormData(form));
    const result=dispatch('remember_preference',data);
    panel.querySelector('.form-error').textContent=result.ok?'':result.error;
    if(result.ok){form.reset();changed();render();}
  });
  panel.addEventListener('click',event=>{
    const button=event.target.closest('[data-memory-delete]');
    if(button){const row=state.aiMemory[Number(button.dataset.memoryDelete)];if(row){dispatch('forget_preference',{key:row.key});changed();render();}}
    if(event.target.closest('[data-memory-clear-chat]')&&confirm('清空保存的聊天及其上下文？偏好、账目和日程会保留。')){state.chat=[];changed();panel.querySelector('[data-memory-clear-chat]').textContent='聊天上下文已清空';panel.querySelector('[data-memory-chat-count]').textContent='0';}
  });
}
