'use client';
import {useEffect,useState} from 'react';
import {API} from '@/lib/api';
import Icon from './Icon';
let cache:Promise<string[]>|null=null;
function savedIds(token:string){if(!cache)cache=fetch(API+'/customers/wishlist',{headers:{Authorization:`Bearer ${token}`}}).then(r=>r.ok?r.json():[]).then((a:any[])=>a.map(x=>x._id)).catch(()=>[]);return cache}
export default function WishlistHeart({productId,label=false}:{productId:string;label?:boolean}){
  const[saved,setSaved]=useState(false),[busy,setBusy]=useState(false);
  useEffect(()=>{let t='';try{t=localStorage.getItem('customer_token')||''}catch{}if(!t)return;savedIds(t).then(ids=>setSaved(ids.includes(productId)))},[productId]);
  async function toggle(e:React.MouseEvent){
    e.preventDefault();e.stopPropagation();
    let token='';try{token=localStorage.getItem('customer_token')||''}catch{}
    if(!token){location.href='/login?next='+encodeURIComponent(location.pathname);return}
    setBusy(true);
    try{const r=await fetch(API+'/customers/wishlist/'+productId,{method:saved?'DELETE':'PUT',headers:{Authorization:`Bearer ${token}`}});if(!r.ok)throw Error();setSaved(!saved);cache=null;window.dispatchEvent(new Event('wishlist-updated'))}catch{}finally{setBusy(false)}
  }
  return <button type="button" className={'heart-btn'+(saved?' on':'')} aria-label={saved?'Remove from wishlist':'Add to wishlist'} aria-pressed={saved} disabled={busy} onClick={toggle}>
    <Icon name="heart" size={label?20:21} fill={saved?'currentColor':'none'}/>{label&&<span>{saved?'Saved':'Wishlist'}</span>}
  </button>;
}
