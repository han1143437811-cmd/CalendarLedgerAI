import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import {validateWebURL} from './web-tools.mjs';
export function isPublicAddress(address){
  if(net.isIP(address)===4){const [a,b]=address.split('.').map(Number);return !(a===0||a===10||a===127||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a>=224||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19));}
  if(net.isIP(address)===6){const value=address.toLowerCase();if(value.startsWith('::ffff:')){const tail=value.slice(7);if(net.isIP(tail)===4)return isPublicAddress(tail);return false;}return value!=='::'&&value!=='::1'&&!/^(fc|fd|fe[89ab]|ff)/.test(value);}
  return false;
}
export async function fetchPublicPage(value,redirects=0){
  const url=validateWebURL(value);
  return new Promise((resolve,reject)=>{
    const request=https.get(url,{headers:{'User-Agent':'CalendarLedgerAI/0.3.6 (+public-page-reader)','Accept':'text/html,application/rss+xml,text/plain;q=0.9'},lookup:(hostname,options,callback)=>{
      dns.lookup(hostname,{all:true},(error,addresses)=>{if(error)return callback(error);if(!addresses.length||addresses.some(row=>!isPublicAddress(row.address)))return callback(new Error('网页地址解析到本机或内网，已拒绝读取。'));options.all?callback(null,addresses):callback(null,addresses[0].address,addresses[0].family);});
    }},response=>{
      if([301,302,303,307,308].includes(response.statusCode)){response.resume();if(redirects>=2)return reject(new Error('网页跳转次数过多。'));try{return resolve(fetchPublicPage(new URL(response.headers.location,url).href,redirects+1));}catch(error){return reject(error);}}
      if(response.statusCode!==200){response.resume();return reject(new Error('网页读取失败，HTTP '+response.statusCode));}
      const chunks=[];let size=0;response.on('data',chunk=>{size+=chunk.length;if(size>750000){request.destroy(new Error('网页超过读取大小上限。'));return;}chunks.push(chunk);});
      response.on('end',()=>resolve({url,contentType:String(response.headers['content-type']??''),content:Buffer.concat(chunks).toString('utf8'),retrievedAt:new Date().toISOString()}));response.on('error',reject);
    });
    const deadline=setTimeout(()=>request.destroy(new Error('网页读取超时。')),20000);request.on('close',()=>clearTimeout(deadline));request.on('error',reject);
  });
}
