// Keep the WebView's message list and focused textarea attached during updates.
export function createChatView(panel,{messageHTML}){
  panel.querySelector('#chat-form').after(panel.querySelector('.chat-modelbar'));
  const scroller=panel.querySelector('#chat-scroll'),list=panel.querySelector('#chat-messages');
  const input=panel.querySelector('#chat-input'),send=panel.querySelector('#chat-form button[type=submit]');
  const pending=panel.querySelector('#chat-pending'),latest=panel.querySelector('[data-action=latest-messages]');
  const nodes=new Map();let initialized=false,wasVisible=false,following=true,lastTop=0,frame=0,lastSession='';
  const visible=()=>getComputedStyle(panel).display!=='none';
  const nearEnd=()=>scroller.scrollHeight-scroller.clientHeight-scroller.scrollTop<=72;
  const updateLatest=()=>{const hidden=following||nearEnd();if(latest.hidden!==hidden)latest.hidden=hidden;};
  function cancel(){if(frame)cancelAnimationFrame(frame);frame=0;}
  function moveToEnd(smooth=true){
    cancel();following=true;
    if(!visible())return;
    latest.hidden=true;
    if(!smooth||matchMedia('(prefers-reduced-motion:reduce)').matches){scroller.scrollTop=Math.max(0,scroller.scrollHeight-scroller.clientHeight);lastTop=scroller.scrollTop;return;}
    const from=scroller.scrollTop,start=performance.now();
    function tick(now){
      const progress=Math.max(0,Math.min(1,(now-start)/280)),target=Math.max(0,scroller.scrollHeight-scroller.clientHeight);
      scroller.scrollTop=from+(target-from)*(1-(1-progress)**3);lastTop=scroller.scrollTop;
      if(progress<1)frame=requestAnimationFrame(tick);else{frame=0;following=true;updateLatest();}
    }
    frame=requestAnimationFrame(tick);
  }
  scroller.addEventListener('scroll',()=>{if(!visible())return;lastTop=scroller.scrollTop;if(!frame)following=nearEnd();updateLatest();},{passive:true});
  const userScroll=()=>{cancel();following=false;};
  scroller.addEventListener('wheel',userScroll,{passive:true});
  scroller.addEventListener('touchstart',userScroll,{passive:true});
  let previousHeight=scroller.clientHeight;
  const resize=new ResizeObserver(()=>{
    const height=scroller.clientHeight;if(height===previousHeight)return;previousHeight=height;
    if(visible()&&wasVisible&&following)moveToEnd(false);
  });
  resize.observe(scroller);
  return {
    moveToEnd,
    render({messages,busy,open,draft,mode,modeLabel,sessionKey='',forceEnd=false,streamOnly=false}){
      const branchChanged=sessionKey!==lastSession;lastSession=sessionKey;if(branchChanged){cancel();following=true;}
      const previouslyVisible=visible(),stick=following||(previouslyVisible&&nearEnd()),oldTop=previouslyVisible?scroller.scrollTop:lastTop;
      panel.classList.toggle('open',open);
      const isVisible=visible(),live=new Set(messages);let changed=false;
      for(const [message,entry]of nodes){if(!live.has(message)){entry.node.remove();nodes.delete(message);changed=true;}}
      messages.forEach((message,index)=>{
        if(streamOnly&&!message.streaming&&nodes.has(message))return;
        const html=messageHTML(message);let entry=nodes.get(message);
        if(!entry){
          const node=document.createElement('div');node.className=`chat-message ${message.role}`;
          if(initialized&&isVisible&&!branchChanged)node.classList.add('is-new');
          node.addEventListener('animationend',()=>node.classList.remove('is-new'),{once:true});
          entry={node,html:null};nodes.set(message,entry);changed=true;
        }
        if(entry.html!==html){
          if(message.streaming&&entry.node.querySelector('[data-message-body]')){
            entry.node.querySelector('[data-message-body]').textContent=message.text??'';
            const reason=entry.node.querySelector('.reasoning-block');reason.hidden=!message.reasoning;reason.querySelector('[data-reasoning-body]').textContent=message.reasoning??'';
            const status=entry.node.querySelector('[data-message-status]');status.hidden=!message.status;status.textContent=message.status??'';
          }else{const expanded=entry.node.querySelector('.reasoning-block')?.open;entry.node.innerHTML=html;if(expanded&&entry.node.querySelector('.reasoning-block'))entry.node.querySelector('.reasoning-block').open=true;}
          entry.html=html;changed=true;
        }
        if(list.children[index]!==entry.node){list.insertBefore(entry.node,list.children[index]??null);changed=true;}
      });
      if(pending.hidden===busy){pending.hidden=!busy;changed=true;}
      if(list.getAttribute('aria-busy')!==String(busy))list.setAttribute('aria-busy',String(busy));
      if(input.value!==draft)input.value=draft;
      if(send.disabled!==busy)send.disabled=busy;
      const badge=panel.querySelector('#chat-mode'),label=mode==='deepseek'?(modeLabel??'API'):'连接 API';
      if(badge.textContent!==label)badge.textContent=label;
      const note=panel.querySelector('.composer-note'),caption=mode==='demo'?'当前为本地演示 · 点击顶部连接 API，开启完整对话':'AI 可能出错，请核对重要信息';
      if(note.textContent!==caption)note.textContent=caption;
      const meaningful=messages.some(row=>row.role==='user');panel.querySelector('.ai-intro').hidden=meaningful;panel.querySelector('.chat-quick').hidden=meaningful;
      if(isVisible){
        if(branchChanged||!initialized||!wasVisible&&following)moveToEnd(false);
        else if(forceEnd||changed&&stick)moveToEnd(true);
        else if(!frame)scroller.scrollTop=oldTop;
        updateLatest();
      }
      initialized=true;wasVisible=isVisible;
    },
    dispose(){cancel();resize.disconnect();}
  };
}
