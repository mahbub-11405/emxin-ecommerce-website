'use client';
import {API} from './api';

/**
 * One live connection to the API for the whole admin (Server-Sent Events over fetch, so the token stays in the
 * Authorization header and never goes into a URL). The server sends a message the moment data changes:
 *   window 'admin:live'  detail {v, d}   v = anything on the dashboard changed, d = business data (orders, payments…)
 *   window 'admin:live-state' detail 'on' | 'off'
 * It reconnects by itself (1 s, 2 s, 4 s … max 15 s) and after the laptop wakes up.
 */
let started=false;let state:'on'|'off'='off';let latest:any=null;  // last message: pages that open later start from it
export const liveState=()=>state;
const setState=(s:'on'|'off')=>{if(state!==s){state=s;window.dispatchEvent(new CustomEvent('admin:live-state',{detail:s}))}};
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));

export function startLive(){
  if(started||typeof window==='undefined')return;started=true;loop();
}
async function loop(){
  let delay=1000;
  for(;;){
    let tok='';try{tok=localStorage.getItem('admin_token')||''}catch{}
    if(!tok){setState('off');await sleep(5000);continue}
    const ctrl=new AbortController();let wd:any;
    const alive=()=>{clearTimeout(wd);wd=setTimeout(()=>ctrl.abort(),40000)};  // server pings every 15 s: silence = dead link
    try{
      const r=await fetch(API+'/admin/live',{headers:{Authorization:'Bearer '+tok},signal:ctrl.signal,cache:'no-store'});
      if(!r.ok||!r.body)throw new Error(String(r.status));
      setState('on');delay=1000;alive();
      const rd=r.body.getReader();const dec=new TextDecoder();let buf='';
      for(;;){
        const {value,done}=await rd.read();if(done)break;alive();
        buf+=dec.decode(value,{stream:true});let i;
        while((i=buf.indexOf('\n\n'))>=0){
          const chunk=buf.slice(0,i);buf=buf.slice(i+2);const m=chunk.match(/^data: (.*)$/m);
          if(m){try{latest=JSON.parse(m[1]);window.dispatchEvent(new CustomEvent('admin:live',{detail:latest}))}catch{}}
        }
      }
    }catch{}
    clearTimeout(wd);setState('off');await sleep(delay);delay=Math.min(delay*2,15000);
  }
}

/** Run fn when live data changes: at most once per `gap` ms, never two at once, paused while the tab is hidden. */
export function onLive(fn:()=>Promise<any>|void,pick:(d:any)=>any=(d)=>d?.v,gap=700){
  let last:any=latest?pick(latest):null,busy=false,again=false,lastRun=0,t:any;
  const run=async()=>{if(document.hidden){again=true;return}if(busy){again=true;return}busy=true;lastRun=Date.now();try{await fn()}catch{}finally{busy=false;if(again){again=false;schedule()}}};
  const schedule=()=>{clearTimeout(t);t=setTimeout(run,Math.max(0,gap-(Date.now()-lastRun)))};
  const h=(e:any)=>{const k=pick(e.detail);if(k===last)return;last=k;schedule()};
  const vis=()=>{if(!document.hidden&&again){again=false;schedule()}};
  window.addEventListener('admin:live',h);document.addEventListener('visibilitychange',vis);
  return()=>{clearTimeout(t);window.removeEventListener('admin:live',h);document.removeEventListener('visibilitychange',vis)};
}
