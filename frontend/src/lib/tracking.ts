'use client';
import {API} from './api';

function sessionId(){
  if(typeof window==='undefined') return '';
  let id=localStorage.getItem('emxin_session_id');
  if(!id){id=crypto.randomUUID();localStorage.setItem('emxin_session_id',id)}
  return id;
}
export async function track(event_type:string,payload:any={}){
  if(typeof window==='undefined') return;
  const token=localStorage.getItem('customer_token')||'';
  try{
    await fetch(API+'/analytics/events',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({event_type,session_id:sessionId(),path:location.pathname+location.search,...payload})});
  }catch{}
}
