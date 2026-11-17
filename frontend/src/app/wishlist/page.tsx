'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import GlassesArt from '@/components/GlassesArt';
import {firstImage,priceOf} from '@/lib/api';
import {getToken} from '@/lib/auth';
import {addToCart} from '@/lib/cart';
import {loadWishlist,toggleWish,WISH_EVENT,wishIds} from '@/lib/wishlist';

const tk=(n:any)=>'৳ '+Math.round(Number(n)||0).toLocaleString('en-IN');

/** Saved products as cards: add one (or all) to the cart, remove, see price drops and stock. */
export default function Wishlist(){
  const[items,setItems]=useState<any[]|null>(null);const[msg,setMsg]=useState('');const[busy,setBusy]=useState('');
  useEffect(()=>{if(!getToken()){location.href='/login?next=/wishlist';return}loadWishlist(true).then(setItems);
    // a heart clicked somewhere else on the site: drop products that are no longer saved
    const u=()=>setItems(l=>l?l.filter(x=>wishIds().includes(x._id)):l);window.addEventListener(WISH_EVENT,u);return()=>window.removeEventListener(WISH_EVENT,u)},[]);
  async function remove(x:any){setBusy(x._id);if(await toggleWish(x._id,false))setItems(l=>(l||[]).filter(i=>i._id!==x._id));setBusy('')}
  function toCart(list:any[]){let n=0;for(const x of list)if(x.stock>0)n+=addToCart(x._id,1,x.colors?.[0]||'Black',x.stock);
    setMsg(n?`${n} item${n>1?'s':''} added to your cart.`:'These are already in your cart (or out of stock).');setTimeout(()=>setMsg(''),3500)}
  const inStock=(items||[]).filter(x=>x.stock>0);
  return <main className="wrap section-sm wl">
    <div className="wl-head"><div><h1 className="page-title"><Icon name="heart" size={28} fill="currentColor"/>My Wishlist</h1>
      <p className="muted">{items?.length?`${items.length} saved product${items.length>1?'s':''}. Add them to your cart when you are ready.`:'Tap the ♥ on any product to save it here.'}</p></div>
      {inStock.length>1&&<button className="btn" onClick={()=>toCart(inStock)}><Icon name="cart" size={18}/>Add all to cart ({inStock.length})</button>}</div>
    {msg&&<p className="note-good big" role="status"><Icon name="checkCircle" size={18}/> {msg} <Link href="/cart">Go to cart →</Link></p>}
    {!items?<p className="muted">Loading…</p>:!items.length?<div className="wl-empty panel"><span><Icon name="heart" size={34}/></span><h3>Your wishlist is empty</h3><p className="muted">Save products you like and find them here later.</p><Link className="btn" href="/shop">Explore products</Link></div>
    :<div className="wl-grid">{items.map(x=>{const price=priceOf(x);const was=Number(x.price)>price?Number(x.price):0;const off=was?Math.round((was-price)/was*100):0;const img=firstImage(x);
      return <article className="wl-card" key={x._id}>
        <Link className="wl-img" href={`/product/${x.slug}`}>{img?<img src={img} alt={x.name}/>:<GlassesArt/>}{off>0&&<em className="wl-off">{off}% OFF</em>}</Link>
        <button type="button" className="wl-x" aria-label={`Remove ${x.name}`} title="Remove from wishlist" disabled={busy===x._id} onClick={()=>remove(x)}><Icon name="close" size={16}/></button>
        <div className="wl-body"><Link href={`/product/${x.slug}`}><b>{x.name}</b></Link>{x.category_name&&<small className="muted">{x.category_name}</small>}
          <div className="wl-price"><b>{tk(price)}</b>{was>0&&<s>{tk(was)}</s>}</div>
          <span className={'wl-stock'+(x.stock>0?'':' out')}>{x.stock>0?(x.stock<=5?`Only ${x.stock} left`:'In stock'):'Out of stock'}</span>
          <div className="wl-act"><button className="btn btn-sm" disabled={!(x.stock>0)} onClick={()=>toCart([x])}><Icon name="cart" size={16}/>Add to cart</button><button className="btn btn-sm btn-ghost" disabled={busy===x._id} onClick={()=>remove(x)}><Icon name="trash" size={15}/>Remove</button></div></div>
      </article>})}</div>}
  </main>;
}
