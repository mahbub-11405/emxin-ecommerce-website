'use client';
import Link from 'next/link';
import {useRef,useEffect,useState} from 'react';
import {usePathname} from 'next/navigation';
import Icon from './Icon';
import {cartCount} from '@/lib/cart';

export function CartBadge(){
  const[n,setN]=useState(0);
  useEffect(()=>{const u=()=>setN(cartCount());u();window.addEventListener('emxin:cart',u);window.addEventListener('storage',u);return()=>{window.removeEventListener('emxin:cart',u);window.removeEventListener('storage',u)}},[]);
  return <Link className="hdr-icon cart-link" href="/cart" aria-label={`Shopping cart, ${n} items`}><Icon name="cart" size={23}/>{n>0&&<span className="cart-count">{n>99?'99+':n}</span>}</Link>;
}

export function AccountLink(){
  const[label,setLabel]=useState('Account');
  useEffect(()=>{const u=()=>{try{setLabel(localStorage.getItem('customer_token')?'My Account':'Account')}catch{}};u();window.addEventListener('emxin:auth',u);return()=>window.removeEventListener('emxin:auth',u)},[]);
  return <Link className="hdr-util hdr-acc" aria-label={label==='Account'?'Login':'My Account'} href={label==='Account'?'/login':'/account'} title={label==='Account'?'Login / Register':'My Account'}><Icon name="userSmall" size={19}/><small>{label==='Account'?'Login':'Account'}</small></Link>;
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
  useEffect(()=>{const u=()=>{try{setLogged(!!localStorage.getItem('customer_token'))}catch{}};u();window.addEventListener('emxin:auth',u);return()=>window.removeEventListener('emxin:auth',u)},[]);
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
        <Link href={logged?'/account':'/login'}><Icon name="userSmall" size={19}/>{logged?'My Account':'Login / Register'}</Link>
        <Link href="/track-order"><Icon name="track" size={19}/>Track Order</Link>
        <Link href="/wishlist"><Icon name="heart" size={19}/>Wishlist</Link>
      </div>
      <Link className="hdr-dealer" href="/dealer">Become a Dealer</Link>
    </nav>
  </>;
}
