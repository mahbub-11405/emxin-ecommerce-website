'use client';
import {API} from './api';
function sessionId(){
  if(typeof window==='undefined') return '';
  try{let id=localStorage.getItem('emxin_session_id');if(!id){id=crypto.randomUUID();localStorage.setItem('emxin_session_id',id)}return id}catch{return 'anon'}
}
export async function track(event_type:string,payload:any={}){
  if(typeof window==='undefined') return;
  let token='';try{token=localStorage.getItem('customer_token')||''}catch{}
  try{await fetch(API+'/analytics/events',{method:'POST',keepalive:true,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({event_type,session_id:sessionId(),path:location.pathname+location.search,...payload})})}catch{}
}
