'use client';
// Facebook / Meta Pixel events. Every call is a no-op when no Pixel ID is set in Admin (window.fbq is missing).
import {isStaff} from './staff';
declare global{interface Window{fbq?:any}}
export function fbTrack(event:string,data:Record<string,any>={},eventID?:string){
  try{if(typeof window!=='undefined'&&typeof window.fbq==='function'&&!isStaff())window.fbq('track',event,{currency:'BDT',...data},eventID?{eventID}:undefined)}catch{}
}
const CLICK='emxin_fbclid';
/** An ad click lands with ?fbclid=…; keep it so an order placed days later is still linked to that ad. */
export function rememberAdClick(){try{const id=new URLSearchParams(location.search).get('fbclid');if(id)localStorage.setItem(CLICK,JSON.stringify({id,t:Date.now()}))}catch{}}
/** _fbp / _fbc browser IDs for the Conversions API (sent with the order). */
export function fbIds(){
  const c=(n:string)=>{try{return decodeURIComponent(document.cookie.match(new RegExp('(?:^|; )'+n+'=([^;]*)'))?.[1]||'')||null}catch{return null}};
  let fbc=c('_fbc');
  if(!fbc)try{const k=JSON.parse(localStorage.getItem(CLICK)||'null');if(k?.id&&Date.now()-k.t<90*864e5)fbc=`fb.1.${k.t}.${k.id}`}catch{}
  return {fbp:c('_fbp'),fbc};
}
