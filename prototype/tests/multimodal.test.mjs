import test from 'node:test';
import assert from 'node:assert/strict';
import {createInitialState,dispatch} from '../core.mjs';
import {IMAGE_LIMITS,buildUserContent,assertVisionConfig,releaseOldImages,prepareRecords,editPreparedRecord,savePreparedRecords,IMAGE_READ_TOOLS,DRAFT_TOOLS} from '../multimodal.mjs';
const receipt={type:'transaction',date:'2026-10-05',amount:38.25,note:'午饭',category:'餐饮',account:'微信'};
const meeting={type:'event',date:'2026-10-06',title:'项目讨论',time:'15:00',duration:60,reminder:30};

test('图片生成原生 Chat Completions 多模态内容，不把图片链接伪装成文字',()=>{
  const content=buildUserContent('帮我读这张账单',[{dataURL:'data:image/jpeg;base64,YWJjZA=='}]);
  assert.deepEqual(content,[{type:'text',text:'帮我读这张账单'},{type:'image_url',image_url:{url:'data:image/jpeg;base64,YWJjZA=='}}]);
  assert.equal(buildUserContent('午饭38'),'午饭38');
  assert.throws(()=>buildUserContent('x',Array.from({length:4},()=>({dataURL:'data:image/png;base64,YQ=='}))),/最多/);
  assert.throws(()=>buildUserContent('x',[{dataURL:'https://unselected.invalid/x.png'}]),/格式/);
  assert.throws(()=>buildUserContent('x',[{dataURL:'data:image/jpeg;base64,'+'a'.repeat(IMAGE_LIMITS.uploadBytes*2)}]),/大小/);
});
test('演示模式和不支持图片的 DeepSeek 模型不发送图片',()=>{
  assert.throws(()=>assertVisionConfig({mode:'demo'}),/截图识别需要/);
  assert.throws(()=>assertVisionConfig({mode:'deepseek',configured:true,baseURL:'https://api.deepseek.com',model:'deepseek-v4-pro'}),/不支持图片/);
  assert.doesNotThrow(()=>assertVisionConfig({mode:'deepseek',configured:true,baseURL:'https://api.deepseek.com',model:'deepseek-flash'}));
  assert.doesNotThrow(()=>assertVisionConfig({mode:'deepseek',configured:true,baseURL:'https://my.example.com/v1',model:'vision-model'}));
  assert.equal(IMAGE_READ_TOOLS.has('create_transactions'),false);
  assert.equal(IMAGE_READ_TOOLS.has('save_prepared_records'),false);
  assert.equal(DRAFT_TOOLS.length,3);
});
test('生成识别卡片不写账，不猜测缺失日期或非法金额',()=>{
  const state=createInitialState('2026-10-05',false),draft=prepareRecords(state,{records:[receipt,meeting]},['example-hash']);
  assert.equal(state.transactions.length,0);assert.equal(state.events.length,0);assert.equal(state.undo.length,0);
  assert.equal(draft.records[0].data.amount,38.25);assert.equal(draft.records[0].selected,true);
  assert.deepEqual(draft.sourceHashes,['example-hash']);
  assert.throws(()=>prepareRecords(state,{records:[{...receipt,date:undefined}]}),/日期/);
  assert.throws(()=>prepareRecords(state,{records:[{...receipt,amount:38.256}]}),/金额/);
  assert.throws(()=>prepareRecords(state,{records:[{...meeting,time:'28:00'}]}),/时间/);
  assert.throws(()=>prepareRecords(state,{records:[{...receipt,id:'invented-id'}]}),/字段/);
});
test('卡片可修改，已存在和同批次重复交易默认不勾选',()=>{
  const state=createInitialState('2026-10-05',false);
  dispatch(state,'create_transactions',{items:[receipt]});
  const draft=prepareRecords(state,{records:[receipt,{...receipt,note:'另一张相同金额账单'},meeting]});
  assert.equal(draft.records[0].duplicate,true);assert.equal(draft.records[0].selected,false);assert.equal(draft.records[1].duplicate,true);
  editPreparedRecord(state,draft,draft.records[0].id,{amount:39.2,date:'2026-10-04'});
  assert.equal(draft.records[0].data.amount,39.2);assert.equal(draft.records[0].duplicate,false);
  assert.equal(state.transactions.length,1);
});
test('勾选项保存一次，重试不重复写入，事件和账目沿用撤销引擎',()=>{
  const state=createInitialState('2026-10-05',false),draft=prepareRecords(state,{records:[receipt,meeting]});
  const result=savePreparedRecords(state,draft);assert.equal(result.count,2);
  assert.equal(state.transactions.length,1);assert.equal(state.transactions[0].amount,3825);assert.equal(state.events[0].reminder,30);
  assert.equal(result.operations.length,2);assert.equal(state.undo.length,2);assert.equal(draft.records.every(row=>row.saved),true);
  assert.equal(savePreparedRecords(state,draft).count,0);assert.equal(state.transactions.length,1);assert.equal(state.events.length,1);
  assert.throws(()=>editPreparedRecord(state,draft,draft.records[0].id,{amount:41}),/已保存/);
  assert.equal(dispatch(state,'undo_operation').ok,true);assert.equal(state.events.length,0);
});
test('保存前校验整组数据，非法后项不造成前项部分写入',()=>{
  const state=createInitialState('2026-10-05',false),draft=prepareRecords(state,{records:[receipt,meeting]});
  draft.records[1].data.time='invalid';
  assert.throws(()=>savePreparedRecords(state,draft),/时间/);
  assert.equal(state.transactions.length,0);assert.equal(state.undo.length,0);
});
test('历史图片在新请求前释放，缩略图和卡片继续留在聊天中',()=>{
  const messages=[{role:'system',content:'instructions'},{role:'user',content:buildUserContent('读图',[{dataURL:'data:image/jpeg;base64,YQ=='}])}];
  releaseOldImages(messages);assert.equal(messages[0].content,'instructions');
  assert.equal(typeof messages[1].content,'string');assert.equal(JSON.stringify(messages).includes('base64'),false);
});
