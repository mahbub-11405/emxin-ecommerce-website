'use client';
import {API} from './api';
import {getToken} from './auth';

/** One wishlist for the whole site: hearts on cards, the header ♥ count and the Wishlist page all read this.
 *  Saved product IDs are kept in the browser so the count shows instantly; the server is the source of truth. */
const KEY='emxin_wish_ids';
export const WISH_EVENT='emxin:wish';
export function wishIds():string[]{try{if(!getToken())return [];const v=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(v)?v:[]}catch{return []}}
function setIds(ids:string[]){try{localStorage.setItem(KEY,JSON.stringify([...new Set(ids)]))}catch{}window.dispatchEvent(new Event(WISH_EVENT))}
export function clearWish(){try{localStorage.removeItem(KEY)}catch{}window.dispatchEvent(new Event(WISH_EVENT))}
let inflight:Promise<any[]>|null=null;
/** Full saved products from the server (also refreshes the IDs). */
export function loadWishlist(force=false):Promise<any[]>{
  const t=getToken();if(!t){clearWish();return Promise.resolve([])}
  if(inflight&&!force)return inflight;
  inflight=fetch(API+'/customers/wishlist',{headers:{Authorization:'Bearer '+t},cache:'no-store'}).then(r=>r.ok?r.json():[]).then((a:any[])=>{a=Array.isArray(a)?a:[];setIds(a.map(x=>x._id));return a}).catch(()=>[]).finally(()=>{setTimeout(()=>{inflight=null},1500)});
  return inflight;
}
/** Add or remove; the count updates at once and goes back if the server says no. */
export async function toggleWish(id:string,on:boolean):Promise<boolean>{
  const t=getToken();if(!t)return false;
  const before=wishIds();setIds(on?[...before,id]:before.filter(x=>x!==id));
  try{const r=await fetch(API+'/customers/wishlist/'+id,{method:on?'PUT':'DELETE',headers:{Authorization:'Bearer '+t}});if(!r.ok)throw Error();return true}
  catch{setIds(before);return false}
}
