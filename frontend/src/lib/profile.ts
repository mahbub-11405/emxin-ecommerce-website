'use client';
import {API} from './api';
import {getToken,logout} from './auth';

/** Logged-in customer for the header: kept in the browser so the name shows instantly, refreshed in the background. */
export type Profile={name:string;phone:string;email?:string;verified?:boolean;dealer?:{status?:string;code?:string;shop?:string}|null;at?:number};
const KEY='customer_profile';
export const PROFILE_EVENT='emxin:profile';
export function getProfile():Profile|null{try{return getToken()?JSON.parse(localStorage.getItem(KEY)||'null'):null}catch{return null}}
export function clearProfile(){try{localStorage.removeItem(KEY)}catch{}}
export const firstName=(n?:string)=>{const w=(n||'').trim().replace(/^(md\.?|mohammad|muhammad|mohammed|mst\.?|mrs?\.?|ms\.?)\s+/i,'').split(/\s+/)[0]||'';return w.length>12?w.slice(0,11)+'…':w};
let inflight:Promise<Profile|null>|null=null;
export function refreshProfile():Promise<Profile|null>{
  const t=getToken();if(!t){clearProfile();return Promise.resolve(null)}
  if(inflight)return inflight;
  inflight=fetch(API+'/customers/me?lite=1',{headers:{Authorization:'Bearer '+t},cache:'no-store'}).then(async r=>{
    if(r.status===401||r.status===403||r.status===404){logout();return null}  // expired: the header goes back to "Account"
    if(!r.ok)return getProfile();
    const p:Profile={...(await r.json()),at:Date.now()};try{localStorage.setItem(KEY,JSON.stringify(p))}catch{}
    window.dispatchEvent(new Event(PROFILE_EVENT));return p;
  }).catch(()=>getProfile()).finally(()=>{inflight=null});
  return inflight;
}
