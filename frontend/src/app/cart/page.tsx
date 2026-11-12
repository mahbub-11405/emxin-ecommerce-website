'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import GlassesArt from '@/components/GlassesArt';
import {API,firstImage,priceOf} from '@/lib/api';
import {readCart,writeCart,type CartItem} from '@/lib/cart';
export default function Cart(){
  const[items,setItems]=useState<CartItem[]>([]);const[byId,setById]=useState<Record<string,any>>({});const[ready,setReady]=useState(false);
  useEffect(()=>{const list=readCart();setItems(list);const ids=[...new Set(list.map(i=>i.product_id))];if(!ids.length){setReady(true);return}
    fetch(`${API}/products?ids=${ids.join(',')}&limit=100`).then(r=>r.json()).then((a:any[])=>setById(Object.fromEntries(a.map(p=>[p._id,p])))).catch(()=>{}).finally(()=>setReady(true))},[]);
  const update=(a:CartItem[])=>{setItems(a);writeCart(a)};
  const live=items.filter(i=>byId[i.product_id]);
  const subtotal=live.reduce((s,i)=>s+priceOf(byId[i.product_id])*i.quantity,0);
  const qty=live.reduce((s,i)=>s+i.quantity,0);
  return <main className="wrap section-sm"><h1 className="page-title">Your Cart</h1>
    {!items.length?<div className="empty-state panel"><Icon name="cart" size={40}/><h3>Your cart is empty</h3><Link className="btn" href="/shop">Shop Products</Link></div>:
    <div className="cart"><div className="panel cart-list">{items.map((i,ix)=>{const p=byId[i.product_id];return <div className="cart-row" key={i.product_id+i.frame_color}>
      <div className="cart-thumb">{p&&firstImage(p)?<img src={firstImage(p)} alt=""/>:<GlassesArt/>}</div>
      <div className="cart-info">{p?<Link href={`/product/${p.slug}`}><b>{p.name}</b></Link>:<b>{ready?'Product no longer available':'Loading…'}</b>}<small>Color: {i.frame_color}{p&&p.stock<i.quantity?` · only ${p.stock} in stock`:''}</small><span className="cart-price">৳ {p?priceOf(p).toLocaleString('en-IN'):'—'}</span></div>
      <div className="stepper sm"><button aria-label="Decrease" onClick={()=>update(items.map((x,j)=>j===ix?{...x,quantity:Math.max(1,x.quantity-1)}:x))}><Icon name="minus" size={16}/></button><input aria-label="Quantity" value={i.quantity} onChange={e=>update(items.map((x,j)=>j===ix?{...x,quantity:Math.max(1,Number(e.target.value.replace(/\D/g,''))||1)}:x))}/><button aria-label="Increase" onClick={()=>update(items.map((x,j)=>j===ix?{...x,quantity:x.quantity+1}:x))}><Icon name="plus" size={16}/></button></div>
      <b className="cart-line">৳ {p?(priceOf(p)*i.quantity).toLocaleString('en-IN'):'—'}</b>
      <button className="icon-btn" aria-label="Remove item" onClick={()=>update(items.filter((_,j)=>j!==ix))}><Icon name="trash" size={18}/></button>
    </div>})}</div>
    <aside className="panel cart-sum"><h3>Order Summary</h3><div className="sum-row"><span>Items ({qty})</span><b>৳ {subtotal.toLocaleString('en-IN')}</b></div><div className="sum-row muted"><span>Delivery</span><span>Calculated at checkout</span></div><div className="sum-row total"><span>Subtotal</span><b>৳ {subtotal.toLocaleString('en-IN')}</b></div>
      {qty>=20&&<p className="note-good"><Icon name="percent" size={15}/> Bulk order — dealer pricing may apply at checkout.</p>}
      <Link className="btn btn-lg btn-block" href="/checkout?cart=1">Proceed to Checkout <Icon name="arrowRight" size={18}/></Link><Link className="link-muted" href="/shop">Continue shopping</Link></aside></div>}
  </main>;
}
