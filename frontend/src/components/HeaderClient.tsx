'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
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
  return <Link className="hdr-util" href={label==='Account'?'/login':'/account'} title={label==='Account'?'Login / Register':'My Account'}><Icon name="userSmall" size={19}/><small>{label==='Account'?'Login':'Account'}</small></Link>;
}

export function NavLinks({categories}:{categories:any[]}){
  const path=usePathname()||'/';
  const[open,setOpen]=useState(false);
  const[mobile,setMobile]=useState(false);
  useEffect(()=>{setOpen(false);setMobile(false)},[path]);
  const is=(href:string)=>href==='/'?path==='/':path.startsWith(href);
  return <>
    <button className="hdr-burger" aria-label="Open menu" aria-expanded={mobile} onClick={()=>setMobile(!mobile)}><Icon name={mobile?'close':'menu'} size={24}/></button>
    <nav className={'hdr-nav'+(mobile?' open':'')} aria-label="Main">
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
      <Link className="hdr-dealer" href="/dealer">Become a Dealer</Link>
    </nav>
  </>;
}
