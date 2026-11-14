'use client';
// The coupon promoted in Admin → Coupons ("Promote on website"): offer bar, one-time welcome popup and product-page chip.
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import Icon from './Icon';

export type Featured={code:string;label:string;description?:string;min_order?:number;ends_at?:string|null;popup?:boolean};
const tk=(n:number)=>'৳ '+Math.round(n).toLocaleString('en-IN');

function useCopy(){const[done,setDone]=useState(false);
  return {done,copy:(t:string)=>{try{navigator.clipboard?.writeText(t)}catch{}setDone(true);setTimeout(()=>setDone(false),1600)}}}

/** "Ends in 2d 5h" when the end is near; "Valid till 27 Nov" otherwise. Updates every minute. */
function useEnds(endsAt?:string|null){
  const[now,setNow]=useState<number|null>(null);
  useEffect(()=>{setNow(Date.now());const t=setInterval(()=>setNow(Date.now()),60000);return()=>clearInterval(t)},[]);
  if(!endsAt||now===null)return '';
  const end=new Date(endsAt).getTime();const ms=end-now;if(ms<=0)return '';
  const d=Math.floor(ms/864e5),h=Math.floor(ms%864e5/36e5),m=Math.floor(ms%36e5/6e4);
  if(d>=7)return 'Valid till '+new Date(end-1).toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'});
  return 'Ends in '+(d?`${d}d ${h}h`:h?`${h}h ${m}m`:`${m}m`);
}

export function OfferBar({c}:{c:Featured}){
  const{done,copy}=useCopy();const ends=useEnds(c.ends_at);const[hide,setHide]=useState(false);
  useEffect(()=>{try{if(sessionStorage.getItem('offer_bar_hidden')===c.code)setHide(true)}catch{}},[c.code]);
  if(hide)return null;
  return <div className="offer-bar" role="region" aria-label="Current offer"><div className="wrap offer-row">
    <Icon name="percent" size={16} stroke={2.4}/>
    <span className="offer-txt"><b>{c.label}</b>{c.description?<> · {c.description}</>:''}{(c.min_order||0)>1?<span className="offer-min"> · orders over {tk(c.min_order||0)}</span>:''}</span>
    <button type="button" className="offer-code" onClick={()=>copy(c.code)} aria-label={`Copy coupon code ${c.code}`}>{done?'Copied ✓':c.code}{!done&&<Icon name="copy" size={13}/>}</button>
    {ends&&<span className="offer-ends">{ends}</span>}
    <button type="button" className="offer-x" aria-label="Hide offer" onClick={()=>{setHide(true);try{sessionStorage.setItem('offer_bar_hidden',c.code)}catch{}}}>×</button>
  </div></div>;
}

const QUIET=['/checkout','/login','/register','/account','/payment-result','/cart'];
export function OfferPopup({c}:{c:Featured}){
  const path=usePathname()||'/';const[open,setOpen]=useState(false);const{done,copy}=useCopy();const ends=useEnds(c.ends_at);
  useEffect(()=>{
    if(!c.popup||QUIET.some(p=>path.startsWith(p)))return;
    let seen=0;try{seen=Number(localStorage.getItem('offer_popup_'+c.code)||0)}catch{}
    if(seen&&Date.now()-seen<3*864e5)return; // once per offer, then quiet for 3 days
    const t=setTimeout(()=>{setOpen(true);try{localStorage.setItem('offer_popup_'+c.code,String(Date.now()))}catch{}},7000);
    return()=>clearTimeout(t);
  },[c.code,c.popup,path]);
  useEffect(()=>{if(!open)return;const k=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false)};addEventListener('keydown',k);return()=>removeEventListener('keydown',k)},[open]);
  if(!open)return null;
  return <div className="offer-pop" role="dialog" aria-modal="true" aria-labelledby="offer-pop-title">
    <button type="button" className="offer-pop-bg" aria-label="Close" onClick={()=>setOpen(false)}/>
    <div className="offer-pop-box">
      <button type="button" className="offer-pop-x" aria-label="Close" onClick={()=>setOpen(false)}>×</button>
      <span className="offer-pop-tag">EXCLUSIVE OFFER</span>
      <h2 id="offer-pop-title">{c.label}</h2>
      {c.description&&<p className="offer-pop-desc">{c.description}</p>}
      <div className="offer-pop-code"><span>{c.code}</span><button type="button" className="btn btn-sm" onClick={()=>copy(c.code)}>{done?'Copied ✓':'Copy code'}</button></div>
      <small className="muted">{(c.min_order||0)>1?`On orders over ${tk(c.min_order||0)}. `:''}Paste it in the coupon box at checkout.{ends?` ${ends}.`:''}</small>
      <Link className="btn btn-lg btn-block" href="/shop" onClick={()=>setOpen(false)}>Shop now <Icon name="arrowRight" size={18}/></Link>
    </div>
  </div>;
}

/** Product page: reminder under the price. */
export function OfferChip({c,price}:{c:Featured;price:number}){
  const{done,copy}=useCopy();
  return <div className="offer-chip"><Icon name="percent" size={15} stroke={2.4}/>
    <span>Extra <b>{c.label}</b> with code <button type="button" onClick={()=>copy(c.code)} aria-label={`Copy coupon code ${c.code}`}>{done?'Copied ✓':c.code}</button>{(c.min_order||0)>1&&price<(c.min_order||0)?<> on orders over {tk(c.min_order||0)}</>:' at checkout'}</span></div>;
}
