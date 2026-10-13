// One bounded Chat Completions SSE decoder for browser and Android transports.
// Tool fragments are never executable until a complete response is received.
export function createChatStream(onUpdate=()=>{}) {
  let buffer='',data=[],size=0,done=false,finishReason='',model='',usage=null;
  const message={role:'assistant',content:'',reasoning_content:''},calls=new Map();
  function event(){
    if(!data.length)return;const raw=data.join('\n');data=[];
    if(raw==='[DONE]'){done=true;return;}
    let value;try{value=JSON.parse(raw);}catch{throw new Error('流式回复格式异常，已保留收到的文字。');}
    if(value.error)throw new Error('接口中断了回复，请检查连接后继续。');
    if(value.model)model=value.model;if(value.usage)usage=value.usage;
    const choice=value.choices?.find(row=>(row.index??0)===0);if(!choice)return;
    if(choice.finish_reason)finishReason=choice.finish_reason;
    const delta=choice.delta??{};
    if(typeof delta.content==='string')message.content+=delta.content;
    if(typeof delta.reasoning_content==='string')message.reasoning_content+=delta.reasoning_content;
    for(const part of delta.tool_calls??[]){
      if(!Number.isInteger(part.index)||part.index<0||part.index>=30)throw new Error('工具片段编号异常。');
      const call=calls.get(part.index)??{id:'',type:'function',function:{name:'',arguments:''}};
      if(part.id)call.id+=part.id;
      if(part.function?.name)call.function.name+=part.function.name;
      if(part.function?.arguments)call.function.arguments+=part.function.arguments;
      calls.set(part.index,call);
    }
    onUpdate({text:message.content,reasoning:message.reasoning_content,toolPending:calls.size>0});
  }
  function feed(text){
    size+=text.length;if(size>8_000_000)throw new Error('流式回复过长，已停止接收。');buffer+=text;
    let i;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i).replace(/\r$/,'');buffer=buffer.slice(i+1);if(!line)event();else if(line.startsWith('data:'))data.push(line.slice(5).replace(/^ /,''));}
  }
  function result(){
    if(buffer)feed('\n');event();
    if(!done&&!finishReason)throw new Error('连接提前结束，已保留收到的文字；未执行不完整的操作。');
    const toolCalls=[...calls.entries()].sort((a,b)=>a[0]-b[0]).map(([,call])=>call);
    if(toolCalls.length&&finishReason!=='tool_calls')throw new Error('工具请求没有完整结束，未执行这批操作。');
    if(toolCalls.length)message.tool_calls=toolCalls;
    return {message,model,usage,finishReason};
  }
  return {feed,result};
}
