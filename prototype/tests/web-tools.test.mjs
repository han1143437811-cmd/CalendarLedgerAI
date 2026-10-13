import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSearchResults,executeWebTool,validateWebURL,htmlText,WEB_TOOLS} from '../web-tools.mjs';
import {isPublicAddress} from '../web-server.mjs';
import {createPreviewServer} from '../server.mjs';
import {runToolConversation} from '../ai-agent.mjs';
const html='<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fdoc&amp;rut=123">公开 &amp; 文档</a><a class="result__snippet">实际搜索摘要 <b>内容</b></a>';
test('search parses actual titles, snippets and decoded source links, discarding unsafe links',()=>{
  const rows=parseSearchResults(html+'<a class="result__a" href="javascript:alert(1)">bad</a>','DuckDuckGo');assert.equal(rows.length,1);assert.equal(rows[0].url,'https://example.com/doc');assert.equal(rows[0].title,'公开 & 文档');assert.ok(rows[0].snippet.includes('实际搜索摘要'));
  assert.throws(()=>parseSearchResults('<form class="challenge-form">captcha</form>','DuckDuckGo'));
});
test('fallback RSS uses returned links, not feed publication timestamps',()=>{
  const rows=parseSearchResults('<rss><item><title>A</title><link>https://example.com/a</link><description><![CDATA[<p>正文摘要</p>]]></description><pubDate>2026-10-13</pubDate></item></rss>','Bing RSS');assert.equal(rows[0].snippet,'正文摘要');assert.equal(rows[0].pubDate,undefined);
});
test('public URL and DNS guards reject local endpoints, credentials and non-HTTPS protocols',()=>{
  for(const url of ['http://example.com','file:///x','https://127.0.0.1','https://2130706433','https://localhost.','https://[::1]','https://[fd00::1]','https://192.168.1.1','https://user:pass@example.com','https://example.com:8443'])assert.throws(()=>validateWebURL(url),url);
  for(const ip of ['127.0.0.1','10.1.1.1','172.16.1.1','192.168.1.1','169.254.1.1','100.64.0.1','::1','fd00::1','fe80::1','::ffff:127.0.0.1'])assert.equal(isPublicAddress(ip),false,ip);
  assert.equal(isPublicAddress('8.8.8.8'),true);assert.equal(isPublicAddress('2606:4700::1111'),true);
});
test('webpage text is bounded and never executes embedded scripts',async()=>{
  const page='<html><title>来源</title><script>dangerous()</script>'+('<p>这是用于核对资料的公开网页正文，包含来源说明。</p>'.repeat(3))+'</html>';
  const result=await executeWebTool('read_webpage',{url:'https://example.com/doc'},{request:async()=>({url:'https://example.com/doc',contentType:'text/html',content:page,retrievedAt:'2026-10-13T00:00:00Z'})});assert.equal(result.ok,true);assert.equal(result.text.includes('dangerous()'),false);assert.ok(htmlText('x'.repeat(20000)).length<=10000);
  await assert.rejects(executeWebTool('read_webpage',{url:'https://example.com/file'},{request:async()=>({contentType:'application/pdf',content:'PDF'})}));
});
test('web proxy is separate from model credentials, falls back on failures and blocks external origins',async()=>{
  const calls=[];const server=createPreviewServer({webFetch:async url=>{calls.push(url);if(url.includes('duckduckgo'))throw new Error('fixture unavailable');return {url,contentType:'application/rss+xml',content:'<item><title>来源</title><link>https://example.com/doc</link><description>公开内容</description></item>',retrievedAt:'2026-10-13T00:00:00Z'};}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
  try{const body={query:'公开测试'},headers={'Content-Type':'application/json'};const response=await fetch(base+'/api/web-search',{method:'POST',headers,body:JSON.stringify(body)});assert.equal(response.status,200);const data=await response.json();assert.equal(data.provider,'Bing RSS');assert.equal(calls.length,2);assert.equal(JSON.stringify(calls).includes('apiKey'),false);
    const blocked=await fetch(base+'/api/web-search',{method:'POST',headers:{...headers,Origin:'https://external.example'},body:JSON.stringify(body)});assert.equal(blocked.status,403);
    const privateRead=await fetch(base+'/api/web-read',{method:'POST',headers,body:JSON.stringify({url:'https://127.0.0.1'})});assert.equal(privateRead.status,400);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
test('an API model receives actual search results and can read their source with paired tool IDs',async()=>{
  let turn=0;const messages=[{role:'user',content:'联网搜索公开文档'}];
  const result=await runToolConversation({prompt:'联网搜索公开文档',messages,tools:WEB_TOOLS,isReadOnly:()=>true,describe:()=>'',execute:(name,args)=>executeWebTool(name,args,{request:async()=>({provider:'DuckDuckGo',content:html,retrievedAt:'2026-10-13T00:00:00Z'})}),request:async body=>{
    if(turn++===0)return {message:{role:'assistant',content:null,tool_calls:[{id:'web1',type:'function',function:{name:'web_search',arguments:'{"query":"公开文档"}'}}]}};
    const found=JSON.parse(body.messages.at(-1).content);assert.equal(found.items[0].url,'https://example.com/doc');assert.equal(body.messages.at(-1).tool_call_id,'web1');return {message:{role:'assistant',content:'已搜索，实际来源是 https://example.com/doc'}};
  }});assert.equal(result.results[0].result.ok,true);
});
test('failed networking cannot be reported as a successful web check',async()=>{
  const reply=await runToolConversation({prompt:'联网查一下最新资料',messages:[{role:'user',content:'联网查一下最新资料'}],tools:WEB_TOOLS,isReadOnly:()=>true,describe:()=>'',execute:()=>assert.fail(),request:async()=>({message:{role:'assistant',content:'已联网查到资料。'}})});
  assert.ok(reply.text.includes('没有取得'));assert.equal(reply.results[0].result.ok,false);
});
