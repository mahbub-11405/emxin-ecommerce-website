'use client';
import Link from 'next/link';
import {useRef,useEffect,useState} from 'react';
import {usePathname} from 'next/navigation';
import Icon from './Icon';
import {cartCount} from '@/lib/cart';
import {getToken,logout} from '@/lib/auth';
import {getProfile,refreshProfile,firstName,PROFILE_EVENT,type Profile} from '@/lib/profile';

export function CartBadge(){
  const[n,setN]=useState(0);
  useEffect(()=>{const u=()=>setN(cartCount());u();window.addEventListener('emxin:cart',u);window.addEventListener('storage',u);return()=>{window.removeEventListener('emxin:cart',u);window.removeEventListener('storage',u)}},[]);
  return <Link className="hdr-icon cart-link" href="/cart" aria-label={`Shopping cart, ${n} items`}><Icon name="cart" size={23}/>{n>0&&<span className="cart-count">{n>99?'99+':n}</span>}</Link>;
}

const ACC_LINKS:[string,string,string][]=[['/account','box','My Orders'],['/track-order','track','Track Order'],['/wishlist','heart','Wishlist'],['/account?edit=1','user','Edit Profile']];
const DEALER_ST:Record<string,string>={Active:'Approved dealer',Pending:'Dealer application: under review',Suspended:'Dealer account suspended',Rejected:'Dealer application: not approved'};

/** Header account: logged out = the usual Account icon; logged in = EMXIN blue person badge + first name, click for details. */
export function AccountLink(){
  const path=usePathname();
  const[p,setP]=useState<Profile|null>(null);const[ready,setReady]=useState(false);const[open,setOpen]=useState(false);const[hi,setHi]=useState('');
  const box=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const u=()=>{const t=getToken();const cur=getProfile();setP(cur);setReady(true);
      if(t&&(!cur||Date.now()-(cur.at||0)>5*60000))refreshProfile().then(x=>{setP(x);welcome(x)});else welcome(cur)};
    const welcome=(x:Profile|null)=>{try{if(x&&sessionStorage.getItem('emxin_welcome')){sessionStorage.removeItem('emxin_welcome');setHi(firstName(x.name)||'');setTimeout(()=>setHi(''),4000)}}catch{}};
    const pu=()=>setP(getProfile());
    u();window.addEventListener('emxin:auth',u);window.addEventListener(PROFILE_EVENT,pu);
    return()=>{window.removeEventListener('emxin:auth',u);window.removeEventListener(PROFILE_EVENT,pu)}},[]);
  useEffect(()=>{setOpen(false)},[path]);
  useEffect(()=>{if(!open)return;const c=(e:MouseEvent)=>{if(box.current&&!box.current.contains(e.target as Node))setOpen(false)};const k=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false)};
    document.addEventListener('mousedown',c);addEventListener('keydown',k);return()=>{document.removeEventListener('mousedown',c);removeEventListener('keydown',k)}},[open]);
  if(!p){  // logged out (or not checked yet): exactly the old Account icon
    return <Link className={'hdr-util hdr-acc'+(ready?'':' acc-wait')} aria-label="Login" href="/login" title="Login / Register"><Icon name="userSmall" size={19}/><small>Account</small></Link>;
  }
  const fn=firstName(p.name)||'Account';const dealer=p.dealer;
  function out(){if(!window.confirm('Log out of your EMXIN account?'))return;logout();setOpen(false);if(path?.startsWith('/account'))location.href='/'}
  return <div className="acc-wrap" ref={box}>
    <button type="button" className={'hdr-util hdr-acc acc-in'+(open?' on':'')} aria-haspopup="menu" aria-expanded={open} aria-label={`Logged in as ${p.name}. Open account menu`} title={`Logged in as ${p.name}`} onClick={()=>setOpen(!open)}>
      <span className="acc-av"><Icon name="user" size={16} stroke={2.2}/></span><small>{fn}</small></button>
    {hi&&!open&&<div className="acc-hi" role="status">Welcome, {hi} 👋</div>}
    {open&&<div className="acc-menu" role="menu">
      <div className="am-head"><span className="acc-av lg"><Icon name="user" size={24} stroke={2}/></span><div><b>{p.name||'My account'}</b>
        <small>{p.phone}{p.verified!==false&&<span className="acc-ok"><Icon name="badgeCheck" size={13}/> verified</span>}</small>
        {dealer?.status&&<span className={'acc-dealer st-'+dealer.status.toLowerCase()}>{dealer.status==='Active'?<>Dealer{dealer.code?` · ${dealer.code}`:''}</>:DEALER_ST[dealer.status]||dealer.status}</span>}</div></div>
      <div className="acc-links">{ACC_LINKS.map(([h,i,l])=><Link key={h} href={h} role="menuitem" onClick={()=>setOpen(false)}><Icon name={i as any} size={18}/>{l}</Link>)}</div>
      <button type="button" className="acc-out" role="menuitem" onClick={out}><Icon name="logout" size={18}/>Log out</button>
    </div>}
  </div>;
}

export function NavLinks({categories}:{categories:any[]}){
  const path=usePathname()||'/';
  const[open,setOpen]=useState(false);
  const[mobile,setMobile]=useState(false);const[logged,setLogged]=useState(false);
  const pathNow=useRef(path);pathNow.current=path;
  useEffect(()=>{setOpen(false);setMobile(false)},[path]);
  // Mobile menu open: freeze the page behind it (iPhone Safari needs the position:fixed trick, overflow:hidden alone is ignored)
  useEffect(()=>{
    if(!mobile)return;
    const y=window.scrollY,p0=pathNow.current,b=document.body.style;const prev={position:b.position,top:b.top,left:b.left,right:b.right,width:b.width,overflow:b.overflow};
    Object.assign(b,{position:'fixed',top:`-${y}px`,left:'0',right:'0',width:'100%',overflow:'hidden'});document.documentElement.classList.add('menu-open');
    const k=(e:KeyboardEvent)=>{if(e.key==='Escape')setMobile(false)};addEventListener('keydown',k);
    return()=>{Object.assign(b,prev);document.documentElement.classList.remove('menu-open');if(pathNow.current===p0)window.scrollTo(0,y);removeEventListener('keydown',k)};
  },[mobile]);
  const[me,setMe]=useState<Profile|null>(null);
  useEffect(()=>{const u=()=>{try{setLogged(!!localStorage.getItem('customer_token'))}catch{}setMe(getProfile())};u();window.addEventListener('emxin:auth',u);window.addEventListener(PROFILE_EVENT,u);return()=>{window.removeEventListener('emxin:auth',u);window.removeEventListener(PROFILE_EVENT,u)}},[]);
  const is=(href:string)=>href==='/'?path==='/':path.startsWith(href);
  return <>
    <button className="hdr-burger" aria-label="Open menu" aria-expanded={mobile} onClick={()=>setMobile(!mobile)}><Icon name={mobile?'close':'menu'} size={24}/></button>
    {mobile&&<button type="button" className="hdr-scrim" aria-label="Close menu" onClick={()=>setMobile(false)}/>}
    <nav className={'hdr-nav'+(mobile?' open':'')} aria-label="Main">
      <form action="/shop" className="mnav-only mnav-search" role="search" onSubmit={()=>setMobile(false)}><Icon name="search" size={18}/><input name="q" placeholder="Search products..." aria-label="Search products"/><button className="btn btn-sm">Search</button></form>
      <Link className={is('/')?'active':''} href="/">Home</Link>
      <Link className={is('/shop')&&!open?'active':''} href="/shop">Shop</Link>
      <div className="mega" onMouseEnter={()=>setOpen(true)} onMouseLeave={()=>setOpen(false)}>
        <button type="button" aria-expanded={open} onClick={()=>setOpen(!open)}>Explore Categories</button>
        {open&&<div className="mega-panel" role="menu">
          {categories.map(c=><Link role="menuitem" key={c.slug} href={'/shop?category='+encodeURIComponent(c.slug)} className="mega-tile">
            <span className="mega-img">{c.thumbnail_url?<img src={c.thumbnail_url} alt=""/>:<Icon name={c.icon||'glasses'} size={30}/>}</span>
            <span><b>{c.name}</b><small>{c.subtitle||'Explore products'}</small></span>
          </Link>)}
          <Link href="/shop" className="mega-all">View all products <Icon name="arrowRight" size={16}/></Link>
        </div>}
      </div>
      <Link className={is('/new-collection')?'active':''} href="/new-collection">New Collection</Link>
      <Link className={is('/offers')?'active':''} href="/offers">Offers</Link>
      <div className="mnav-only mnav-links">
        {logged&&me?<div className="mnav-me"><span className="acc-av"><Icon name="user" size={17} stroke={2.2}/></span><div><b>Hi, {firstName(me.name)||'there'} 👋</b><small>{me.phone}</small></div></div>:null}
        <Link href={logged?'/account':'/login'}><Icon name={logged?'box':'userSmall'} size={19}/>{logged?'My Orders':'Login / Register'}</Link>
        <Link href="/track-order"><Icon name="track" size={19}/>Track Order</Link>
        <Link href="/wishlist"><Icon name="heart" size={19}/>Wishlist</Link>
        {logged&&<button type="button" className="mnav-out" onClick={()=>{if(window.confirm('Log out of your EMXIN account?')){logout();setMobile(false)}}}><Icon name="logout" size={19}/>Log out</button>}
      </div>
      <Link className="hdr-dealer" href="/dealer">Become a Dealer</Link>
    </nav>
  </>;
}
