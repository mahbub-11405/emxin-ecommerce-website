'use client';
import {useState} from 'react';
import Icon from '@/components/Icon';
import WishlistHeart from '@/components/WishlistHeart';
import {addToCart,inCart} from '@/lib/cart';
import {track} from '@/lib/tracking';
const NAMED:Record<string,string>={black:'#111111',white:'#ffffff',silver:'#c0c4ca',grey:'#6b7280',gray:'#6b7280',blue:'#1e40af',brown:'#7c4a2d',gold:'#c8a24a',red:'#b91c1c',green:'#166534',tortoise:'#6b3f1d',transparent:'#e5edf7',clear:'#e5edf7'};
export const swatch=(p:any,c:string)=>p.color_hex?.[c]||NAMED[c.toLowerCase()]||'#9ca3af';
export default function PurchaseOptions({product:p}:{product:any}){
  const colors:string[]=p.colors?.length?p.colors:['Black'];
  const[color,setColor]=useState(colors[0]);const[qty,setQty]=useState(1);const[added,setAdded]=useState(false);
  const out=Number(p.stock)<=0;const max=Math.max(1,Number(p.stock)||1);
  const[note,setNote]=useState('');
  function add(go?:boolean){
    const got=addToCart(p._id,qty,color,Number(p.stock));
    if(got===0){ // already holding all the stock: don't add more, just say so (Buy Now still goes to checkout)
      if(go){location.href='/checkout?cart=1';return}
      setNote(`You already have all ${p.stock} in your cart.`);return}
    track('add_to_cart',{product_id:p._id,product_name:p.name,metadata:{qty:got,color}});setAdded(true);
    if(got<qty)try{sessionStorage.setItem('cart_note',`Only ${p.stock} in stock — your cart now has the maximum.`)}catch{}
    location.href=go?'/checkout?cart=1':'/cart'}
  return <div className="pd-buy">
    <div className="pd-color"><b>Color: <span>{color}</span></b><div className="swatches">{colors.map(c=><button key={c} type="button" title={c} aria-label={c} aria-pressed={color===c} className={color===c?'on':''} onClick={()=>setColor(c)}><i style={{background:swatch(p,c)}}/></button>)}</div></div>
    <div className="pd-qty"><b>Quantity:</b><div className="stepper"><button type="button" aria-label="Decrease" onClick={()=>setQty(Math.max(1,qty-1))}><Icon name="minus" size={18} stroke={2.2}/></button><input aria-label="Quantity" inputMode="numeric" value={qty} onChange={e=>setQty(Math.max(1,Math.min(max,Number(e.target.value.replace(/\D/g,''))||1)))}/><button type="button" aria-label="Increase" onClick={()=>setQty(Math.min(max,qty+1))}><Icon name="plus" size={18} stroke={2.2}/></button></div><span className="muted">(Available: {Math.max(0,Number(p.stock)||0)} pcs)</span></div>
    <div className="pd-actions">
      <button type="button" className="btn btn-lg" disabled={out} onClick={()=>add()}><Icon name={added?'check':'cart'} size={20}/>{added?'Opening cart…':'Add to Cart'}</button>
      <button type="button" className="btn btn-lg btn-outline" disabled={out} onClick={()=>add(true)}><Icon name="bolt" size={20}/>Buy Now</button>
      <WishlistHeart productId={p._id}/>
    </div>
    {note&&<p className="note-warn" role="status">{note} <a href="/cart">View cart</a></p>}
  </div>;
}
