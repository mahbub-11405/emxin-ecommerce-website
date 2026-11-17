'use client';
import {useEffect,useState} from 'react';
import Icon from './Icon';
import {getToken} from '@/lib/auth';
import {wishIds,loadWishlist,toggleWish,WISH_EVENT} from '@/lib/wishlist';

/** Heart on product cards / product page. Filled blue = saved. Keeps every heart and the header count in sync. */
export default function WishlistHeart({productId,label=false}:{productId:string;label?:boolean}){
  const[saved,setSaved]=useState(false),[busy,setBusy]=useState(false),[pop,setPop]=useState(false);
  useEffect(()=>{const u=()=>setSaved(wishIds().includes(productId));u();if(getToken())loadWishlist();
    window.addEventListener(WISH_EVENT,u);window.addEventListener('emxin:auth',u);return()=>{window.removeEventListener(WISH_EVENT,u);window.removeEventListener('emxin:auth',u)}},[productId]);
  async function toggle(e:React.MouseEvent){
    e.preventDefault();e.stopPropagation();
    if(!getToken()){location.href='/login?next='+encodeURIComponent(location.pathname);return}
    const on=!saved;setBusy(true);setSaved(on);if(on){setPop(true);setTimeout(()=>setPop(false),450)}
    const ok=await toggleWish(productId,on);if(!ok)setSaved(!on);setBusy(false);
  }
  return <button type="button" className={'heart-btn'+(saved?' on':'')+(pop?' pop':'')} aria-label={saved?'Remove from wishlist':'Add to wishlist'} aria-pressed={saved} disabled={busy} onClick={toggle} title={saved?'Saved to your wishlist':'Save to wishlist'}>
    <Icon name="heart" size={label?20:21} fill={saved?'currentColor':'none'}/>{label&&<span>{saved?'Saved':'Wishlist'}</span>}
  </button>;
}
