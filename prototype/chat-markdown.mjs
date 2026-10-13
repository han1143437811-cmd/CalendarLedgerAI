import {Marked} from './vendor/marked/marked.mjs';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function safeURL(value){try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{return null;}}
const markdown=new Marked({gfm:true,breaks:true,renderer:{
  html({text}){return escape(text);},
  link({href,tokens}){const label=this.parser.parseInline(tokens),url=safeURL(href);return url?`<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`:label;},
  image({href,text}){const url=safeURL(href);return url?`<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">图片：${escape(text||'打开链接')}</a>`:escape(text);},
  table(token){return '<div class="markdown-table" tabindex="0" aria-label="表格，可横向滚动">'+this.constructor.prototype.table.call(this,token)+'</div>';}
}});
export function renderMarkdown(text){return markdown.parse(String(text??''),{async:false});}
