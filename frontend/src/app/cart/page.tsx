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
  // never more than the stock: per product, all colours together
  const update=(a:CartItem[])=>{const used:Record<string,number>={};const b=a.map(x=>{const st=byId[x.product_id]?Number(byId[x.product_id].stock):Infinity;const left=Math.max(0,st-(used[x.product_id]||0));const q=Math.max(1,Math.min(x.quantity,left||1));used[x.product_id]=(used[x.product_id]||0)+q;return {...x,quantity:q}});setItems(b);writeCart(b)};
  const roomFor=(ix:number)=>{const i=items[ix];const p=byId[i.product_id];if(!p)return true;return items.reduce((n,x)=>x.product_id===i.product_id?n+x.quantity:n,0)<Number(p.stock)};
  const[note,setNote]=useState('');const[rule,setRule]=useState({cap:5,bulk:20});
  useEffect(()=>{fetch(API+'/site-content').then(r=>r.ok?r.json():null).then(c=>{if(c)setRule({cap:Number(c.retail_max_qty_per_product||5),bulk:Number(c.bulk_threshold_qty||20)})}).catch(()=>{})},[]);
  useEffect(()=>{try{const n=sessionStorage.getItem('cart_note');if(n){setNote(n);sessionStorage.removeItem('cart_note')}}catch{}},[]);
  // stock changed since the item was added (e.g. someone else bought it): bring the cart down to what is available
  useEffect(()=>{if(ready&&Object.keys(byId).length&&items.some(i=>byId[i.product_id]&&inCartOf(i.product_id)>Number(byId[i.product_id].stock)))update(items)},[ready,byId]);
  const inCartOf=(id:string)=>items.reduce((n,x)=>x.product_id===id?n+x.quantity:n,0);
  const live=items.filter(i=>byId[i.product_id]);
  const subtotal=live.reduce((s,i)=>s+priceOf(byId[i.product_id])*i.quantity,0);
  const qty=live.reduce((s,i)=>s+i.quantity,0);
  const over=qty<rule.bulk?[...new Set(live.map(i=>i.product_id))].filter(id=>inCartOf(id)>rule.cap):[];
  return <main className="wrap section-sm"><h1 className="page-title">Your Cart</h1>{note&&<p className="note-warn" role="status">{note}</p>}{over.length>0&&<p className="note-warn" role="alert">You can order up to <b>{rule.cap} pcs of each product</b>. Reduce {over.map(id=>byId[id]?.name).join(', ')} to {rule.cap}, or order {rule.bulk}+ pcs in total for bulk / dealer pricing.</p>}
    {!items.length?<div className="empty-state panel"><Icon name="cart" size={40}/><h3>Your cart is empty</h3><Link className="btn" href="/shop">Shop Products</Link></div>:
    <div className="cart"><div className="panel cart-list">{items.map((i,ix)=>{const p=byId[i.product_id];return <div className="cart-row" key={i.product_id+i.frame_color}>
      <div className="cart-thumb">{p&&firstImage(p)?<img src={firstImage(p)} alt=""/>:<GlassesArt/>}</div>
      <div className="cart-info">{p?<Link href={`/product/${p.slug}`}><b>{p.name}</b></Link>:<b>{ready?'Product no longer available':'Loading…'}</b>}<small>Color: {i.frame_color}{p&&p.stock<i.quantity?` · only ${p.stock} in stock`:''}</small><span className="cart-price">৳ {p?priceOf(p).toLocaleString('en-IN'):'—'}</span></div>
      <div className="stepper sm"><button aria-label="Decrease" onClick={()=>update(items.map((x,j)=>j===ix?{...x,quantity:Math.max(1,x.quantity-1)}:x))}><Icon name="minus" size={16}/></button><input aria-label="Quantity" value={i.quantity} onChange={e=>update(items.map((x,j)=>j===ix?{...x,quantity:Math.max(1,Number(e.target.value.replace(/\D/g,''))||1)}:x))}/><button aria-label="Increase" disabled={!roomFor(ix)} title={roomFor(ix)?'':'No more in stock'} onClick={()=>update(items.map((x,j)=>j===ix?{...x,quantity:x.quantity+1}:x))}><Icon name="plus" size={16}/></button></div>
      <b className="cart-line">৳ {p?(priceOf(p)*i.quantity).toLocaleString('en-IN'):'—'}</b>
      <button className="icon-btn" aria-label="Remove item" onClick={()=>update(items.filter((_,j)=>j!==ix))}><Icon name="trash" size={18}/></button>
    </div>})}</div>
    <aside className="panel cart-sum"><h3>Order Summary</h3><div className="sum-row"><span>Items ({qty})</span><b>৳ {subtotal.toLocaleString('en-IN')}</b></div><div className="sum-row muted"><span>Delivery</span><span>Calculated at checkout</span></div><div className="sum-row total"><span>Subtotal</span><b>৳ {subtotal.toLocaleString('en-IN')}</b></div>
      {qty>=20&&<p className="note-good"><Icon name="percent" size={15}/> Bulk order — dealer pricing may apply at checkout.</p>}
      <Link className="btn btn-lg btn-block" href="/checkout?cart=1">Proceed to Checkout <Icon name="arrowRight" size={18}/></Link><Link className="link-muted" href="/shop">Continue shopping</Link></aside></div>}
  </main>;
}
