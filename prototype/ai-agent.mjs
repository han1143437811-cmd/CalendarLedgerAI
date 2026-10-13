import {compactToolResult} from './ai-context.mjs';
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
function validate(value, spec, path='参数') {
  if (spec.type === 'object') {
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error(`${path}必须是对象。`);
    for (const key of spec.required ?? []) if (!Object.hasOwn(value,key)) throw new Error(`${path}缺少必填字段 ${key}。`);
    for (const [key,item] of Object.entries(value)) {
      if (!Object.hasOwn(spec.properties ?? {},key)) { if (spec.additionalProperties === false) throw new Error(`${path}包含未定义字段 ${key}。`); }
      else validate(item, spec.properties[key], `${path}.${key}`);
    }
  } else if (spec.type === 'array') {
    if (!Array.isArray(value)) throw new Error(`${path}必须是数组。`);
    for (const item of value) validate(item,spec.items ?? {},path);
  } else if (spec.type === 'integer' ? !Number.isInteger(value) : spec.type && typeof value !== spec.type) throw new Error(`${path}类型应为 ${spec.type}。`);
  if (spec.enum && !spec.enum.includes(value)) throw new Error(`${path}不在支持范围内。`);
}
export async function runToolConversation({messages, tools, request, execute, isReadOnly, onResult=()=>{}, describe, maxTurns=12, prompt=''}) {
  const results=[], successfulWrites=new Map(),wireStart=messages.length; let final='', completionRepair=false;
  const requested = /^(?:请|帮我)?记住|以后默认/.test(prompt) ? ['remember_preference']
    : /均摊|分摊|平摊/.test(prompt) ? [/取消|不再/.test(prompt)?'remove_expense_allocation':'allocate_expense'] : [];
  const supportedRequest=requested.length&&requested.every(name=>tools.some(tool=>tool.function.name===name));
  try {
    for (let turn=0; turn<maxTurns; turn++) {
      const reply=await request({messages,tools});
      const message=reply.message;
      if (!message || message.role !== 'assistant') throw new Error('API 回复格式异常。');
      const calls=message.tool_calls ?? [];
      if (!Array.isArray(calls) || calls.length>30) throw new Error('一次工具调用过多，请分批处理。');
      messages.push({role:'assistant',content:message.content ?? null,...(typeof message.reasoning_content==='string'?{reasoning_content:message.reasoning_content}:{}),...(calls.length?{tool_calls:calls}:{})});
      if (!calls.length) {
        const answer=message.content ?? '';
        if(/联网|上网|搜索/.test(prompt)&&/已[^。\n]{0,15}(?:查到|搜索|联网)|根据[^。\n]{0,15}(?:搜索|网页)/.test(answer)&&tools.some(tool=>tool.function.name==='web_search')&&!results.some(row=>['web_search','read_webpage'].includes(row.name)&&row.result.ok)){
          final='这次没有取得联网搜索或网页读取的成功结果，不能报告已查证。请检查网络，或提供具体公开网页链接后重试。';
          results.push({name:'execution_check',result:{ok:false,error:'没有联网工具成功结果，已纠正模型的查证声明。'}});break;
        }
        const claimsDone=/已(?:经)?[^。！\n]{0,12}(?:完成|保存|记账|均摊|分摊|记住|更新|处理|取消)/.test(answer);
        if(supportedRequest&&claimsDone&&!results.some(row=>requested.includes(row.name)&&row.result.ok)){
          if(!completionRepair){completionRepair=true;messages.push({role:'system',content:'应用执行核对：没有收到 '+requested.join(' / ')+' 的成功结果，不能报告已完成。请实际调用相应工具，或询问确实缺少的信息；已保存的付款不能重复创建。'});continue;}
          final='这次尚未得到操作成功的结果，请明确要处理的账目或分摊日期后继续。';
          results.push({name:'execution_check',result:{ok:false,error:'未收到对应工具的成功结果，已纠正模型的完成声明。'}});break;
        }
        final=answer;break;
      }
      for (const call of calls) {
        let result;
        if (typeof call.id !== 'string' || !call.id) throw new Error('工具调用缺少 ID，请重试。');
        try {
          const name=call.function?.name, spec=tools.find(tool=>tool.function.name===name);
          if (!spec) throw new Error('请求的工具不在当前可执行范围内，请使用已提供的工具。');
          const args=JSON.parse(call.function.arguments ?? '{}'); validate(args,spec.function.parameters);
          const key=name+':'+JSON.stringify(canonical(args));
          // Reads must see the current state after writes; failed calls can be repaired.
          if (!isReadOnly(name) && successfulWrites.has(key)) result=successfulWrites.get(key);
          else {
            result=await execute(name,args);
            if (!result || typeof result.ok !== 'boolean') throw new Error('工具没有返回明确执行状态。');
            result=result.type==='drafts'?result:JSON.parse(JSON.stringify(result));
            if (result.ok && !isReadOnly(name)) successfulWrites.set(key,result);
            const entry={name,result}; results.push(entry); await onResult(entry);
          }
        } catch (error) { result={ok:false,error:error.message}; results.push({name:call.function?.name,result}); }
        const safe=result.type==='download'?{...result,data:undefined}:result;
        // Keep exact current IDs, but avoid sending an entire ledger/backup repeatedly.
        const content=JSON.stringify(safe);
        messages.push({role:'tool',tool_call_id:call.id,content:content.length>45000?JSON.stringify({...compactToolResult(safe),truncated:true,warning:'返回过长，请缩小查询范围。'}):content});
      }
    }
    if (!final) final=(results.length?results.map(row=>describe(row.result)).join('\n'):'未收到完整回复。')+'\n本轮已到工具执行上限；上面的结果为实际完成状态，可继续描述下一步。';
    return {text:final,results,apiMessages:messages.slice(wireStart).filter(row=>row.role!=='system')};
  } catch (error) { error.completedResults=results; throw error; }
}
