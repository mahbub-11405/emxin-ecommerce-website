'use client';
import {useEffect,useRef,useState} from 'react';
import Icon from '@/components/Icon';
import WishlistHeart from '@/components/WishlistHeart';
import {addToCart,inCart} from '@/lib/cart';
import {track} from '@/lib/tracking';
import {fbTrack} from '@/lib/pixel';
import {priceOf} from '@/lib/api';
const NAMED:Record<string,string>={black:'#111111',white:'#ffffff',silver:'#c0c4ca',grey:'#6b7280',gray:'#6b7280',blue:'#1e40af',brown:'#7c4a2d',gold:'#c8a24a',red:'#b91c1c',green:'#166534',tortoise:'#6b3f1d',transparent:'#e5edf7',clear:'#e5edf7'};
export const swatch=(p:any,c:string)=>p.color_hex?.[c]||NAMED[c.toLowerCase()]||'#9ca3af';
export default function PurchaseOptions({product:p,cap=5,bulk=20,days='1–3'}:{product:any;cap?:number;bulk?:number;days?:string}){
  const colors:string[]=p.colors?.length?p.colors:['Black'];
  const[color,setColor]=useState(colors[0]);const[qty,setQty]=useState(1);const[added,setAdded]=useState(false);
  const stock=Math.max(0,Number(p.stock)||0);const out=stock<=0;
  // Retail: up to `cap` pcs per order (pieces already in the cart count). Dealer: `bulk`+ pcs, only possible when the stock has that many.
  const[have,setHave]=useState(0);useEffect(()=>{setHave(inCart(p._id))},[p._id]);
  const dealerOk=stock>=bulk;
  const max=Math.max(1,dealerOk?stock-have:Math.min(stock-have,cap-have));
  const[hit,setHit]=useState(0); // + pressed at the retail limit: the message grows and blinks
  const atCap=!dealerOk&&(qty>=max||have+qty>=cap);const between=dealerOk&&have+qty>cap&&have+qty<bulk;
  const full=!dealerOk&&have>=cap; // the cart already holds the retail maximum of this product
  function plus(){if(qty>=max){if(!dealerOk)setHit(Date.now());return}setQty(qty+1)}
  const[note,setNote]=useState('');
  // phones: a Buy Now bar stays at the bottom while the real buttons are off screen
  const acts=useRef<HTMLDivElement>(null);const[seen,setSeen]=useState(true);
  useEffect(()=>{const el=acts.current;if(!el||typeof IntersectionObserver==='undefined')return;const io=new IntersectionObserver(([e])=>setSeen(e.isIntersecting));io.observe(el);return()=>io.disconnect()},[]);
  function add(go?:boolean){
    if(full){setHit(Date.now());if(go)location.href='/checkout?cart=1';return}
    const got=addToCart(p._id,qty,color,Number(p.stock));
    if(got===0){ // already holding all the stock: don't add more, just say so (Buy Now still goes to checkout)
      if(go){location.href='/checkout?cart=1';return}
      setNote(`You already have all ${p.stock} in your cart.`);return}
    track('add_to_cart',{product_id:p._id,product_name:p.name,metadata:{qty:got,color}});fbTrack('AddToCart',{content_ids:[p._id],content_type:'product',content_name:p.name,value:priceOf(p)*got,contents:[{id:p._id,quantity:got}]});setAdded(true);
    if(got<qty)try{sessionStorage.setItem('cart_note',`Only ${p.stock} in stock — your cart now has the maximum.`)}catch{}
    location.href=go?'/checkout?cart=1':'/cart'}
  return <div className="pd-buy">
    <div className="pd-opts">
    <div className="pd-color"><b>Color: <span>{color}</span></b><div className="swatches">{colors.map(c=><button key={c} type="button" title={c} aria-label={c} aria-pressed={color===c} className={color===c?'on':''} onClick={()=>setColor(c)}><i style={{background:swatch(p,c)}}/></button>)}</div></div>
    <div className="pd-qty"><b><span className="long">Quantity</span><span className="short">Qty</span>:</b><div className="stepper"><button type="button" aria-label="Decrease" onClick={()=>setQty(Math.max(1,qty-1))}><Icon name="minus" size={18} stroke={2.2}/></button><input aria-label="Quantity" inputMode="numeric" value={qty} onChange={e=>{const n=Number(e.target.value.replace(/\D/g,''))||1;if(n>max&&!dealerOk)setHit(Date.now());setQty(Math.max(1,Math.min(max,n)))}}/><button type="button" aria-label="Increase" aria-disabled={qty>=max} className={qty>=max?'off':''} title={qty>=max?(dealerOk?'No more in stock':`Max ${cap} pcs per order as a customer`):''} onClick={plus}><Icon name="plus" size={18} stroke={2.2}/></button></div></div>
    </div>
    {/* the per-order limit only matters once someone takes more than one (or the cart already has some) */}
    {!out&&(qty>1||have>0||hit>0)&&<div key={hit} className={'pd-limit'+(atCap?' at':'')+(hit?' blink':'')} role={hit?'alert':undefined}>
      <Icon name="info" size={atCap?20:16}/>
      {dealerOk?<span>Customer: <b>max {cap} pcs</b> per order · Dealer: <b>{bulk}+ pcs</b> (up to {stock} in stock)</span>
        :<span><b>Max order {cap} pcs as a customer</b>{have>0?<> · {full?`you already have ${have} in your cart`:`${have} already in your cart`}</>:null}{stock<bulk?<> · Dealer orders ({bulk}+ pcs) by quantity request</>:null}</span>}</div>}
    {between&&<div className="pd-limit at"><Icon name="info" size={18}/><span>{have+qty} pcs: retail is up to <b>{cap} pcs</b>, dealer price starts at <b>{bulk} pcs</b>. <button type="button" className="link-btn" onClick={()=>setQty(Math.min(stock-have,bulk-have))}>Make it {bulk} pcs</button> or <button type="button" className="link-btn" onClick={()=>setQty(Math.max(1,cap-have))}>keep {Math.max(1,cap-have)}</button></span></div>}
    <div className="pd-actions" ref={acts}>
      <button type="button" className="btn btn-lg" disabled={out} onClick={()=>add(true)}><Icon name="bolt" size={20}/>Buy Now</button>
      <button type="button" className="btn btn-lg btn-outline" disabled={out} onClick={()=>add()}><Icon name={added?'check':'cart'} size={20}/>{added?'Opening cart…':'Add to Cart'}</button>
      <WishlistHeart productId={p._id}/>
    </div>
    {note&&<p className="note-warn" role="status">{note} <a href="/cart">View cart</a></p>}
    {!out&&!seen&&<div className="pd-sticky" role="region" aria-label="Buy">
      <span><b>৳ {priceOf(p).toLocaleString('en-IN')}</b><small>COD · {days} days delivery</small></span>
      <button type="button" className="btn btn-outline pd-sticky-cart" aria-label="Add to cart" onClick={()=>add()}><Icon name="cart" size={20}/></button>
      <button type="button" className="btn btn-lg" onClick={()=>add(true)}><Icon name="bolt" size={18}/>Buy Now</button></div>}
  </div>;
}
