'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import Icon from './Icon';
import {logout,deviceFor} from '@/lib/auth';
import {getProfile,firstName} from '@/lib/profile';

/** Any "Log out" button calls askLogout(): a branded confirm box opens, then a "Logged out" notice shows (also after a page change). */
const ASK='emxin:logout-ask';const BYE='emxin_bye';
export function askLogout(){window.dispatchEvent(new Event(ASK))}

export default function LogoutUI(){
  const[ask,setAsk]=useState(false);const[bye,setBye]=useState<string|null>(null);const[info,setInfo]=useState({name:'',remembered:false});
  const cancel=useRef<HTMLButtonElement>(null);const timer=useRef<any>(null);
  function show(name:string){setBye(name);clearTimeout(timer.current);timer.current=setTimeout(()=>setBye(null),5000)}
  useEffect(()=>{
    const a=()=>{const p=getProfile();setInfo({name:firstName(p?.name)||'',remembered:!!(p?.phone&&deviceFor(p.phone))});setAsk(true)};
    addEventListener(ASK,a);
    try{const n=sessionStorage.getItem(BYE);if(n!==null){sessionStorage.removeItem(BYE);show(n)}}catch{}
    return()=>{removeEventListener(ASK,a);clearTimeout(timer.current)}},[]);
  useEffect(()=>{if(!ask)return;cancel.current?.focus();const k=(e:KeyboardEvent)=>{if(e.key==='Escape')setAsk(false)};addEventListener('keydown',k);return()=>removeEventListener('keydown',k)},[ask]);
  function yes(){logout();setAsk(false);
    // pages that only make sense logged in: go home and show the notice there
    if(/^\/(account|wishlist|checkout)/.test(location.pathname)){try{sessionStorage.setItem(BYE,info.name)}catch{}location.href='/';return}
    show(info.name)}
  return <>
    {ask&&<div className="lo-back" onMouseDown={e=>{if(e.target===e.currentTarget)setAsk(false)}}>
      <div className="lo-box" role="alertdialog" aria-modal="true" aria-labelledby="lo-t" aria-describedby="lo-d">
        <span className="lo-ic"><Icon name="logout" size={28} stroke={2}/></span>
        <h2 id="lo-t">Log out{info.name?`, ${info.name}`:''}?</h2>
        <p id="lo-d" className="muted">You will need to log in again to see your orders and wishlist. Your cart stays saved on this device.</p>
        {info.remembered&&<p className="lo-note"><Icon name="badgeCheck" size={16}/> This device stays remembered, so your next login needs no OTP.</p>}
        <div className="lo-act"><button ref={cancel} type="button" className="btn btn-outline" onClick={()=>setAsk(false)}>Stay logged in</button>
          <button type="button" className="btn lo-yes" onClick={yes}><Icon name="logout" size={17}/>Yes, log out</button></div>
      </div></div>}
    {bye!==null&&<div className="lo-toast" role="status">
      <span className="lo-tic"><Icon name="checkCircle" size={22}/></span>
      <div><b>Logged out successfully</b><small>{bye?`See you soon, ${bye}! `:'See you soon! '}<Link href="/login" onClick={()=>setBye(null)}>Log in again</Link></small></div>
      <button type="button" aria-label="Close" onClick={()=>setBye(null)}><Icon name="close" size={16}/></button></div>}
  </>;
}
