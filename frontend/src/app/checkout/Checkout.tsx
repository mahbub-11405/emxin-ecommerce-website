'use client';
import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import PayMethods from '@/components/PayMethods';
import {API,postJSON,priceOf} from '@/lib/api';
import {readCart,writeCart} from '@/lib/cart';
import {track} from '@/lib/tracking';
import {DISTRICTS} from '@/lib/districts';
import {getToken,logout,readDraft,saveDraft,DRAFT} from '@/lib/auth';

export default function Checkout({productId,initialQty=1,initialColor='Black',settings={}}:{productId:string;initialQty?:number;initialColor?:string;settings?:any}){
  const[items,setItems]=useState<{product_id:string;quantity:number;frame_color:string}[]>([]);
  const[byId,setById]=useState<Record<string,any>>({});
  const[pay,setPay]=useState('paystation');const[coupon,setCoupon]=useState('');const[cp,setCp]=useState<any>(null);const[cpMsg,setCpMsg]=useState('');
  const[f,setF]=useState({customer_name:'',phone:'',email:'',address:'',district:'Dhaka',shop_name:'',dealer_opt_in:false});
  const[me,setMe]=useState<any>(null);const[welcome,setWelcome]=useState(false);
  const[state,setState]=useState<{kind:string;text?:string;order?:any}>({kind:'idle'});
  const pct=Number(settings.digital_payment_discount_percent??2);
  useEffect(()=>{
    const list=productId?[{product_id:productId,quantity:initialQty,frame_color:initialColor}]:readCart();
    setItems(list);
    const d=readDraft();const token=getToken();
    if(d){setF(v=>({...v,...d.f}));if(d.pay)setPay(d.pay);if(d.coupon)setCoupon(d.coupon);if(token){setWelcome(true);try{sessionStorage.removeItem(DRAFT)}catch{}}}
    if(token)fetch(API+'/customers/me',{headers:{Authorization:'Bearer '+token}}).then(r=>{if(r.status===401){logout();return null}return r.ok?r.json():null}).then(x=>{if(!x?.customer)return;setMe(x.customer);
      setF(v=>({...v,customer_name:v.customer_name||x.customer.name||'',phone:x.customer.phone||v.phone,email:v.email||x.customer.email||'',address:v.address||x.customer.address||'',district:d?.f?.district||x.customer.district||v.district}))}).catch(()=>{});
    const ids=[...new Set(list.map(i=>i.product_id))];
    if(ids.length)fetch(`${API}/products?ids=${ids.join(',')}`).then(r=>r.json()).then((a:any[])=>setById(Object.fromEntries(a.map(p=>[p._id,p])))).catch(()=>{});
    track('checkout_started',{product_id:productId||undefined,metadata:{items:list.length}});
  },[productId,initialQty,initialColor]);
  const qty=items.reduce((n,x)=>n+x.quantity,0);
  const threshold=Number(settings.bulk_threshold_qty||20);
  const bulk=qty>=threshold;
  useEffect(()=>{if(bulk&&pay==='cod')setPay('paystation')},[bulk,pay]);
  const est=useMemo(()=>{
    const sub=items.reduce((s,i)=>s+priceOf(byId[i.product_id])*i.quantity,0);
    let c=0;if(cp&&(!bulk||cp.allow_bulk)){c=cp.type==='percentage'?sub*cp.value/100:cp.value;if(cp.max_discount)c=Math.min(c,cp.max_discount);c=Math.min(c,sub)}
    const del=Number(f.district.toLowerCase()==='dhaka'?settings.dhaka_delivery_charge??70:settings.outside_dhaka_delivery_charge??130);
    const gross=sub-c+del;const saving=Math.round(gross*pct/100);
    const total=pay==='paystation'?Math.round(gross-saving):Math.round(gross);
    return {sub,c,del,saving,total,adv:bulk?Math.round(total*Number(settings.bulk_advance_percent??50)/100):0};
  },[items,byId,cp,bulk,f.district,pay,settings,pct]);
  async function applyCoupon(){setCpMsg('');setCp(null);if(!coupon.trim())return;try{const r=await fetch(`${API}/coupons/validate?code=${encodeURIComponent(coupon)}&subtotal=${est.sub}`);const j=await r.json();if(!r.ok)throw new Error(j.detail);setCp(j);setCpMsg(`Coupon applied${j.description?': '+j.description:''}`)}catch(e:any){setCpMsg(e.message||'Invalid coupon')}}
  async function go(e:React.FormEvent){
    e.preventDefault();
    const token=getToken();
    if(!token){ // not registered / logged in yet → register, then come straight back here with everything filled in
      saveDraft({f,pay,coupon:cp?.code||coupon});
      location.href='/login?tab=register&next='+encodeURIComponent(location.pathname+location.search);return;
    }
    setState({kind:'busy'});
    try{
      const r=await postJSON('/orders',{...f,email:f.email||null,shop_name:f.shop_name||null,items,payment_method:pay,coupon_code:cp?.code||null},token);
      if(!productId)writeCart([]);
      if(r.paystation?.payment_url){setState({kind:'redirect'});location.href=r.paystation.payment_url;return}
      setState({kind:'ok',order:r});
    }catch(err:any){
      if(/must match your verified account/i.test(err.message))setState({kind:'err',text:`Use the mobile number of your account (${me?.phone||'verified number'}). To order for another number, log out and register that number.`});
      else if(/Authentication|expired/i.test(err.message)){logout();saveDraft({f,pay,coupon});location.href='/login?next='+encodeURIComponent(location.pathname+location.search)}
      else setState({kind:'err',text:err.message});
    }
  }
  if(state.kind==='ok'){const r=state.order;return <div className="panel order-done"><span className="done-ico"><Icon name="check" size={34} stroke={3}/></span><h2>Thank you! Order placed.</h2><p>Your order ID is <b>{r.order_id}</b>. Our team will call you to confirm before dispatch.</p><div className="sum-row total"><span>{r.pricing.cod_due>0&&!r.pricing.advance_required?'Pay on delivery':'Payable'}</span><b>৳ {Number(r.pricing.grand_total).toLocaleString('en-IN')}</b></div>
    {r.paystation&&!r.paystation.payment_url&&<p className="note-warn">{r.paystation.message} You can also pay from <Link href="/account">My Account</Link> once it is available.</p>}
    <div className="row-gap"><Link className="btn" href={`/track-order?order_id=${r.order_id}`}>Track order</Link><Link className="btn btn-outline" href="/account">My orders</Link></div></div>}
  if(state.kind==='redirect')return <div className="panel order-done"><span className="spinner"/><h2>Redirecting to secure payment…</h2><p className="muted">Complete the payment with bKash, Nagad, Rocket, Upay, card or internet banking on PayStation.</p></div>;
  if(!items.length)return <div className="empty-state panel"><Icon name="cart" size={40}/><h3>Your cart is empty</h3><Link className="btn" href="/shop">Browse products</Link></div>;
  const logged=!!me;
  return <form className="co" onSubmit={go}>
    <div className="co-main">
      {welcome&&<p className="note-good big"><Icon name="checkCircle" size={18}/> Welcome{me?.name?`, ${me.name.split(' ')[0]}`:''}! Your account is ready and your details are filled in — review and place your order.</p>}
      {!logged&&<div className="co-guest"><Icon name="user" size={20}/><span>New here? Fill in your details — we'll ask you to verify your mobile number with an OTP when you place the order. <Link href={'/login?next='+encodeURIComponent('/checkout?cart=1')} onClick={()=>saveDraft({f,pay,coupon})}>Already registered? Log in</Link></span></div>}
      <section className="panel"><h2><span className="step">1</span>Delivery Details</h2><div className="grid-2">
        <label className="qr-field"><span>Full Name <em>*</em></span><input required value={f.customer_name} onChange={e=>setF({...f,customer_name:e.target.value})}/></label>
        <label className="qr-field"><span>Mobile Number <em>*</em></span><input required type="tel" placeholder="017XXXXXXXX" value={f.phone} readOnly={logged} onChange={e=>setF({...f,phone:e.target.value})}/>{logged?<small className="muted">Verified account number</small>:<small className="muted">You'll verify this number by OTP</small>}</label>
        <label className="qr-field"><span>Email <small className="muted">(optional)</small></span><input type="email" value={f.email} onChange={e=>setF({...f,email:e.target.value})}/></label>
        <label className="qr-field"><span>District <em>*</em></span><select value={f.district} onChange={e=>setF({...f,district:e.target.value})}>{DISTRICTS.map(d=><option key={d}>{d}</option>)}</select></label>
        <label className="qr-field span-2"><span>Full Address <em>*</em></span><textarea required rows={2} value={f.address} onChange={e=>setF({...f,address:e.target.value})} placeholder="House, road, area, thana"/></label>
        {(bulk||f.dealer_opt_in)&&<label className="qr-field span-2"><span>Shop / Business Name <em>*</em></span><input required value={f.shop_name} onChange={e=>setF({...f,shop_name:e.target.value})}/></label>}
      </div></section>
      <section className="panel"><h2><span className="step">2</span>Payment Method</h2><div className="pay-opts">
        <label className={'pay-opt'+(pay==='paystation'?' on':'')}><input type="radio" name="pay" checked={pay==='paystation'} onChange={()=>setPay('paystation')}/><Icon name="lockCard" size={26}/><span><b>Digital Payment {bulk&&<small className="muted">· {settings.bulk_advance_percent??50}% advance</small>}</b><small>Secure checkout by PayStation</small><PayMethods small/></span><em className="save">SAVE {pct}%</em></label>
        {pay==='paystation'&&<div className="save-box"><Icon name="percent" size={18} stroke={2.4}/><span>You save <b>৳ {est.saving.toLocaleString('en-IN')}</b> with digital payment — the {pct}% discount is applied to every online payment.</span></div>}
        {!bulk&&<label className={'pay-opt'+(pay==='cod'?' on':'')}><input type="radio" name="pay" checked={pay==='cod'} onChange={()=>setPay('cod')}/><Icon name="truck" size={26}/><span><b>Cash on Delivery</b><small>Pay when you receive the parcel · no digital discount</small></span></label>}
        {pay==='cod'&&est.saving>0&&<p className="note-warn">Tip: switch to Digital Payment to save ৳ {est.saving.toLocaleString('en-IN')} on this order.</p>}
      </div>
        {bulk&&<p className="note-good"><Icon name="info" size={15}/> Bulk order ({threshold}+ pcs): pay {settings.bulk_advance_percent??50}% now online; the rest by courier COD after confirmation. Dealer discount is applied by EMXIN on confirmation.</p>}
        <label className="chk"><input type="checkbox" checked={f.dealer_opt_in} onChange={e=>setF({...f,dealer_opt_in:e.target.checked})}/> Also register me as a Dealer (optional)</label>
      </section>
    </div>
    <aside className="panel co-sum"><h3>Order Summary</h3>
      {items.map(i=>{const p=byId[i.product_id];return <div className="co-item" key={i.product_id+i.frame_color}><span>{p?.name||'…'} <small>× {i.quantity} · {i.frame_color}</small></span><b>৳ {(priceOf(p)*i.quantity).toLocaleString('en-IN')}</b></div>})}
      <Link className="link-muted left" href="/cart">Edit cart</Link>
      <div className="coupon"><input placeholder="Coupon code" value={coupon} onChange={e=>setCoupon(e.target.value.toUpperCase())}/><button type="button" className="btn btn-outline btn-sm" onClick={applyCoupon}>Apply</button></div>{cpMsg&&<small className={cp?'qr-okline':'qr-warn'}>{cpMsg}</small>}
      <div className="sum-row"><span>Subtotal</span><span>৳ {est.sub.toLocaleString('en-IN')}</span></div>
      {est.c>0&&<div className="sum-row good"><span>Coupon</span><span>− ৳ {Math.round(est.c).toLocaleString('en-IN')}</span></div>}
      <div className="sum-row"><span>Delivery ({f.district})</span><span>৳ {est.del}</span></div>
      {pay==='paystation'&&<div className="sum-row good strong"><span>Digital payment discount ({pct}%)</span><span>− ৳ {est.saving.toLocaleString('en-IN')}</span></div>}
      {bulk&&<div className="sum-row good"><span>Dealer / bulk discount</span><span>On confirmation</span></div>}
      <div className="sum-row total"><span>Total</span><b>৳ {est.total.toLocaleString('en-IN')}</b></div>
      {bulk&&<div className="sum-row"><span>Pay now (advance)</span><b>৳ {est.adv.toLocaleString('en-IN')}</b></div>}
      {state.kind==='err'&&<p className="form-err" role="alert">{state.text}</p>}
      <button className="btn btn-lg btn-block" disabled={state.kind==='busy'}>{state.kind==='busy'?'Placing order…':!logged?<>Continue — verify mobile <Icon name="arrowRight" size={18}/></>:pay==='paystation'?<><Icon name="secure" size={19}/>Pay ৳ {(bulk?est.adv:est.total).toLocaleString('en-IN')} securely</>:'Place Order (Cash on Delivery)'}</button>
      <p className="muted tiny">The final amount is confirmed by our server. Nothing is sent to the courier until EMXIN confirms your order by phone.</p>
    </aside>
  </form>;
}
