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
  // Payment options: PayStation only when it is switched on; bKash/Nagad Send Money when a number is saved in Admin → Settings.
  const psOn=!!settings.paystation_enabled;const accs=settings.payment_accounts||{};
  const chans=(['bkash','nagad'] as const).filter(k=>accs[k]?.enabled&&accs[k]?.number);
  const[pay,setPay]=useState(psOn?'paystation':chans.length?'manual':'cod');
  const[mp,setMp]=useState({channel:chans[0]||'bkash',trx_id:'',sender_number:''});const[quote,setQuote]=useState<any>(null);const[coupon,setCoupon]=useState('');const[cp,setCp]=useState<any>(null);const[cpMsg,setCpMsg]=useState('');
  const[f,setF]=useState({customer_name:'',phone:'',email:'',address:'',district:'Dhaka',shop_name:'',dealer_opt_in:false});
  const[me,setMe]=useState<any>(null);const[welcome,setWelcome]=useState(false);
  const[state,setState]=useState<{kind:string;text?:string;order?:any}>({kind:'idle'});
  const pct=Number(settings.digital_payment_discount_percent??2);
  useEffect(()=>{
    const list=productId?[{product_id:productId,quantity:initialQty,frame_color:initialColor}]:readCart();
    setItems(list);
    const d=readDraft();const token=getToken();
    if(d){setF(v=>({...v,...d.f}));if(d.pay&&(d.pay!=='paystation'||psOn))setPay(d.pay);if(d.coupon){setCoupon(d.coupon);setTimeout(()=>applyCoupon(d.coupon),600)}if(d.mp)setMp(m=>({...m,...d.mp}));if(token){setWelcome(true);try{sessionStorage.removeItem(DRAFT)}catch{}}}
    if(token)fetch(API+'/customers/me',{headers:{Authorization:'Bearer '+token}}).then(r=>{if(r.status===401){logout();return null}return r.ok?r.json():null}).then(x=>{if(!x?.customer)return;setMe(x.customer);
      setF(v=>({...v,customer_name:v.customer_name||x.customer.name||'',phone:x.customer.phone||v.phone,email:v.email||x.customer.email||'',address:v.address||x.customer.address||'',district:d?.f?.district||x.customer.district||v.district}))}).catch(()=>{});
    const ids=[...new Set(list.map(i=>i.product_id))];
    if(ids.length)fetch(`${API}/products?ids=${ids.join(',')}`).then(r=>r.json()).then((a:any[])=>setById(Object.fromEntries(a.map(p=>[p._id,p])))).catch(()=>{});
    track('checkout_started',{product_id:productId||undefined,metadata:{items:list.length}});
  },[productId,initialQty,initialColor]);
  const changeQty=(k:number,q:number)=>setItems(list=>{const n=list.map((x,j)=>j===k?{...x,quantity:Math.max(1,q)}:x);if(!productId)writeCart(n);return n});
  const removeItem=(k:number)=>setItems(list=>{const n=list.filter((_,j)=>j!==k);if(!productId)writeCart(n);return n});
  const qty=items.reduce((n,x)=>n+x.quantity,0);
  const threshold=Number(settings.bulk_threshold_qty||20);
  const bulk=qty>=threshold;
  useEffect(()=>{if(bulk&&pay==='cod')setPay(chans.length?'manual':'paystation')},[bulk,pay]);
  const est=useMemo(()=>{
    const sub=items.reduce((s,i)=>s+priceOf(byId[i.product_id])*i.quantity,0);
    let c=0;if(cp&&(!bulk||cp.allow_bulk)){c=cp.type==='percentage'?sub*cp.value/100:cp.value;if(cp.max_discount)c=Math.min(c,cp.max_discount);c=Math.min(c,sub)}
    const del=Number(f.district.toLowerCase()==='dhaka'?settings.dhaka_delivery_charge??70:settings.outside_dhaka_delivery_charge??130);
    const gross=sub-c+del;const saving=Math.round(gross*pct/100);
    const total=pay!=='cod'?Math.round(gross-saving):Math.round(gross);
    return {sub,c,del,saving,total,adv:bulk?Math.round(total*Number(settings.bulk_advance_percent??50)/100):0};
  },[items,byId,cp,bulk,f.district,pay,settings,pct]);
  const digital=pay!=='cod';
  // Exact amount from the server (delivery, extra shipping, dealer tier) — a Send Money customer must send exactly this.
  useEffect(()=>{if(!items.length)return;const t=setTimeout(()=>{const tok=getToken();fetch(API+'/orders/quote',{method:'POST',headers:{'Content-Type':'application/json',...(tok?{Authorization:'Bearer '+tok}:{})},body:JSON.stringify({items,district:f.district,payment_method:pay,coupon_code:cp?.code||null,dealer_opt_in:f.dealer_opt_in})}).then(r=>r.ok?r.json():null).then(setQuote).catch(()=>setQuote(null))},250);return()=>clearTimeout(t)},[items,f.district,pay,cp,f.dealer_opt_in]);
  const sendAmt=quote?Math.round(quote.is_bulk?quote.advance_required:quote.grand_total):(bulk?est.adv:est.total);
  const acc=accs[mp.channel]||{};const chLabel=mp.channel==='nagad'?'Nagad':'bKash';
  const copy=(t:string)=>{try{navigator.clipboard?.writeText(t)}catch{}};
  const[offers,setOffers]=useState<any[]>([]);const[showOffers,setShowOffers]=useState(false);const[copied,setCopied]=useState('');
  useEffect(()=>{if(!est.sub)return;const t=setTimeout(()=>fetch(`${API}/coupons/available?subtotal=${Math.round(est.sub)}`).then(r=>r.ok?r.json():[]).then(x=>setOffers(Array.isArray(x)?x:[])).catch(()=>{}),300);return()=>clearTimeout(t)},[est.sub]);
  const useOffer=(code:string)=>{setCoupon(code);setShowOffers(false);applyCoupon(code)};
  const copyCode=(code:string)=>{try{navigator.clipboard?.writeText(code)}catch{}setCopied(code);setTimeout(()=>setCopied(''),1500)};
  async function applyCoupon(code?:string){const c=(code??coupon).trim().toUpperCase();setCpMsg('');setCp(null);if(!c)return;try{const r=await fetch(`${API}/coupons/validate?code=${encodeURIComponent(c)}&subtotal=${est.sub}`);const j=await r.json();if(!r.ok)throw new Error(j.detail);setCp(j);setCpMsg(`Coupon applied${j.description?': '+j.description:''}`)}catch(e:any){setCpMsg(e.message||'Invalid coupon')}}
  async function go(e:React.FormEvent){
    e.preventDefault();
    const token=getToken();
    if(!token){ // not registered / logged in yet → register, then come straight back here with everything filled in
      saveDraft({f,pay,mp,coupon:cp?.code||coupon});
      location.href='/login?tab=register&next='+encodeURIComponent(location.pathname+location.search);return;
    }
    setState({kind:'busy'});
    try{
      const r=await postJSON('/orders',{...f,email:f.email||null,shop_name:f.shop_name||null,items,payment_method:pay,coupon_code:cp?.code||null,...(pay==='manual'?{manual_channel:mp.channel,trx_id:mp.trx_id,sender_number:mp.sender_number}:{})},token);
      if(!productId)writeCart([]);
      if(r.paystation?.payment_url){setState({kind:'redirect'});location.href=r.paystation.payment_url;return}
      setState({kind:'ok',order:r});
    }catch(err:any){
      if(/must match your verified account/i.test(err.message))setState({kind:'err',text:`Use the mobile number of your account (${me?.phone||'verified number'}). To order for another number, log out and register that number.`});
      else if(/Authentication|expired/i.test(err.message)){logout();saveDraft({f,pay,mp,coupon});location.href='/login?next='+encodeURIComponent(location.pathname+location.search)}
      else setState({kind:'err',text:err.message});
    }
  }
  if(state.kind==='ok'){const r=state.order;const m=r.manual_payment;return <div className="panel order-done"><span className="done-ico"><Icon name="check" size={34} stroke={3}/></span><h2>Thank you! Order placed.</h2><p>Your order ID is <b>{r.order_id}</b>. {m?'We are checking your payment now.':'Our team will call you to confirm before dispatch.'}</p>
    {m&&<div className="mp-done"><Icon name="checkCircle" size={18}/><span><b>{m.channel_label} payment received for verification</b><br/>TrxID <b>{m.trx_id}</b> · ৳ {Number(m.amount_expected).toLocaleString('en-IN')}{m.is_advance?' advance':''}. As soon as EMXIN verifies it, your order is confirmed and handed to the courier. You can follow it in My Orders.</span></div>}<div className="sum-row total"><span>{r.pricing.cod_due>0&&!r.pricing.advance_required?'Pay on delivery':'Payable'}</span><b>৳ {Number(r.pricing.grand_total).toLocaleString('en-IN')}</b></div>
    {r.paystation&&!r.paystation.payment_url&&<p className="note-warn">{r.paystation.message} You can also pay from <Link href="/account">My Account</Link> once it is available.</p>}
    <div className="row-gap"><Link className="btn" href={`/track-order?order_id=${r.order_id}`}>Track order</Link><Link className="btn btn-outline" href="/account">My orders</Link></div></div>}
  if(state.kind==='redirect')return <div className="panel order-done"><span className="spinner"/><h2>Redirecting to secure payment…</h2><p className="muted">Complete the payment with bKash, Nagad, Rocket, Upay, card or internet banking on PayStation.</p></div>;
  if(!items.length)return <div className="empty-state panel"><Icon name="cart" size={40}/><h3>Your cart is empty</h3><Link className="btn" href="/shop">Browse products</Link></div>;
  const logged=!!me;
  return <form className="co" onSubmit={go}>
    <div className="co-main">
      {welcome&&<p className="note-good big"><Icon name="checkCircle" size={18}/> Welcome{me?.name?`, ${me.name.split(' ')[0]}`:''}! Your account is ready and your details are filled in — review and place your order.</p>}
      {!logged&&<div className="co-guest"><Icon name="user" size={20}/><span>New here? Fill in your details — we'll ask you to verify your mobile number with an OTP when you place the order. <Link href={'/login?next='+encodeURIComponent('/checkout?cart=1')} onClick={()=>saveDraft({f,pay,mp,coupon})}>Already registered? Log in</Link></span></div>}
      <section className="panel"><h2><span className="step">1</span>Delivery Details</h2><div className="grid-2">
        <label className="qr-field"><span>Full Name <em>*</em></span><input required value={f.customer_name} onChange={e=>setF({...f,customer_name:e.target.value})}/></label>
        <label className="qr-field"><span>Mobile Number <em>*</em></span><input required type="tel" placeholder="017XXXXXXXX" value={f.phone} readOnly={logged} onChange={e=>setF({...f,phone:e.target.value})}/>{logged?<small className="muted">Verified account number</small>:<small className="muted">You'll verify this number by OTP</small>}</label>
        <label className="qr-field"><span>Email <small className="muted">(optional)</small></span><input type="email" value={f.email} onChange={e=>setF({...f,email:e.target.value})}/></label>
        <label className="qr-field"><span>District <em>*</em></span><select value={f.district} onChange={e=>setF({...f,district:e.target.value})}>{DISTRICTS.map(d=><option key={d}>{d}</option>)}</select></label>
        <label className="qr-field span-2"><span>Full Address <em>*</em></span><textarea required rows={2} value={f.address} onChange={e=>setF({...f,address:e.target.value})} placeholder="House, road, area, thana"/></label>
        {(bulk||f.dealer_opt_in)&&<label className="qr-field span-2"><span>Shop / Business Name <em>*</em></span><input required value={f.shop_name} onChange={e=>setF({...f,shop_name:e.target.value})}/></label>}
      </div></section>
      <section className="panel"><h2><span className="step">2</span>Payment Method</h2><div className="pay-opts">
        {chans.length>0&&<label className={'pay-opt'+(pay==='manual'?' on':'')}><input type="radio" name="pay" checked={pay==='manual'} onChange={()=>setPay('manual')}/><Icon name="phone" size={26}/><span><b>bKash / Nagad Send Money {bulk&&<small className="muted">· {settings.bulk_advance_percent??50}% advance</small>}</b><small>Send money to our number, then enter the Transaction ID</small></span><em className="save">SAVE {pct}%</em></label>}
        {pay==='manual'&&<div className="mp-box">
          {chans.length>1&&<div className="mp-tabs">{chans.map(k=><button type="button" key={k} className={'mp-tab '+k+(mp.channel===k?' on':'')} onClick={()=>setMp({...mp,channel:k})}>{k==='bkash'?'bKash':'Nagad'}</button>)}</div>}
          <ol className="mp-steps">
            <li>Open the <b>{chLabel}</b> app → <b>Send Money</b></li>
            <li>Send to <button type="button" className="mp-copy" onClick={()=>copy(acc.number)} title="Copy number"><b>{acc.number}</b><Icon name="copy" size={14}/></button> <small className="muted">({chLabel} {acc.account_type||'personal'})</small></li>
            <li>Amount <button type="button" className="mp-copy amt" onClick={()=>copy(String(sendAmt))} title="Copy amount"><b>৳ {sendAmt.toLocaleString('en-IN')}</b><Icon name="copy" size={14}/></button>{bulk&&<small className="muted"> ({settings.bulk_advance_percent??50}% advance — the rest is paid on delivery)</small>}</li>
            <li>Enter the <b>TrxID</b> from the {chLabel} message and your {chLabel} number below</li>
          </ol>
          <div className="grid-2">
            <label className="qr-field"><span>Transaction ID (TrxID) <em>*</em></span><input required value={mp.trx_id} onChange={e=>setMp({...mp,trx_id:e.target.value.toUpperCase().replace(/\s/g,'')})} placeholder="e.g. 9KX7A2B1QZ" autoComplete="off"/></label>
            <label className="qr-field"><span>Sent from ({chLabel} number) <em>*</em></span><input required type="tel" value={mp.sender_number} onChange={e=>setMp({...mp,sender_number:e.target.value})} placeholder="017XXXXXXXX"/></label>
          </div>
          <small className="muted">Please send the exact amount. No separate save needed — the TrxID is sent with your order when you tap {logged?'Place Order':'Continue'} below{logged?'':' (it stays filled in while you verify your mobile)'}. EMXIN verifies it, then confirms your order and sends it to the courier.</small>
        </div>}
        {psOn&&<label className={'pay-opt'+(pay==='paystation'?' on':'')}><input type="radio" name="pay" checked={pay==='paystation'} onChange={()=>setPay('paystation')}/><Icon name="lockCard" size={26}/><span><b>Digital Payment {bulk&&<small className="muted">· {settings.bulk_advance_percent??50}% advance</small>}</b><small>Secure checkout by PayStation</small><PayMethods small/></span><em className="save">SAVE {pct}%</em></label>}
        {(pay==='paystation'||pay==='manual')&&<div className="save-box"><Icon name="percent" size={18} stroke={2.4}/><span>You save <b>৳ {(quote?Math.round(quote.payment_discount):est.saving).toLocaleString('en-IN')}</b> by paying in advance — the {pct}% discount applies to every bKash / Nagad / online payment.</span></div>}
        {!bulk&&<label className={'pay-opt'+(pay==='cod'?' on':'')}><input type="radio" name="pay" checked={pay==='cod'} onChange={()=>setPay('cod')}/><Icon name="truck" size={26}/><span><b>Cash on Delivery</b><small>Pay when you receive the parcel · no digital discount</small></span></label>}
        {pay==='cod'&&est.saving>0&&<p className="note-warn">Tip: pay by bKash / Nagad to save ৳ {est.saving.toLocaleString('en-IN')} on this order.</p>}
      </div>
        {bulk&&<p className="note-good"><Icon name="info" size={15}/> Bulk order ({threshold}+ pcs): pay {settings.bulk_advance_percent??50}% advance by bKash / Nagad; the rest is paid on delivery after EMXIN confirms. Dealer discount is applied by EMXIN on confirmation.</p>}
        {bulk?<label className="co-dealer on"><input type="checkbox" checked={f.dealer_opt_in} onChange={e=>setF({...f,dealer_opt_in:e.target.checked})}/><span><b>I am an EMXIN dealer / I want dealer pricing</b><small>Approved dealers get {(settings.dealer_tiers||[5])[0]}%–{(settings.dealer_tiers||[5,8,12,15]).slice(-1)[0]}% off bulk orders. Not a dealer yet? Tick this and EMXIN will contact you.</small></span></label>
        :<Link className="co-dealer" href="/dealer"><Icon name="handshake" size={22}/><span><b>Buying for your shop?</b><small>Order {threshold}+ pcs as an EMXIN dealer and save {(settings.dealer_tiers||[5])[0]}%–{(settings.dealer_tiers||[5,8,12,15]).slice(-1)[0]}%. Already a dealer? Just order {threshold}+ pcs.</small></span><Icon name="arrowRight" size={16}/></Link>}
      </section>
    </div>
    <aside className="panel co-sum"><h3>Order Summary</h3>
      <div className="co-items">{items.map((i,k)=>{const p=byId[i.product_id];const img=p?.images?.[0]||p?.media?.find((m:any)=>m.type!=='video')?.url;const max=Math.max(1,Number(p?.stock)||99);
        return <div className="co-item2" key={i.product_id+i.frame_color}>
          <span className="co-thumb">{img?<img src={img} alt=""/>:<Icon name="glasses" size={22}/>}</span>
          <div className="co-info"><b>{p?.name||'…'}</b><small>{i.frame_color} · ৳ {priceOf(p).toLocaleString('en-IN')} each</small>
            <div className="co-qty" role="group" aria-label={`Quantity for ${p?.name||'item'}`}>
              <button type="button" aria-label="Less" disabled={i.quantity<=1} onClick={()=>changeQty(k,i.quantity-1)}>−</button><span>{i.quantity}</span>
              <button type="button" aria-label="More" disabled={i.quantity>=max} onClick={()=>changeQty(k,i.quantity+1)}>+</button>
              <button type="button" className="co-rm" aria-label="Remove" title="Remove" onClick={()=>removeItem(k)}><Icon name="trash" size={15}/></button></div></div>
          <b className="co-line">৳ {(priceOf(p)*i.quantity).toLocaleString('en-IN')}</b></div>})}</div>
      <Link className="co-editcart" href="/cart"><Icon name="cart" size={16}/>Edit cart · add more items<Icon name="arrowRight" size={15}/></Link>
      {!cp&&(()=>{const o=offers.find(x=>x.eligible);return o?<div className="co-offer-hint"><Icon name="percent" size={16} stroke={2.4}/><span>Offer for you: <b>{o.label}</b></span><button type="button" className="btn btn-sm" onClick={()=>useOffer(o.code)}>Apply {o.code}</button></div>:null})()}
      <div className="coupon"><input placeholder="Coupon code" value={coupon} onChange={e=>setCoupon(e.target.value.toUpperCase())}/><button type="button" className="btn btn-outline btn-sm" onClick={()=>applyCoupon()}>Apply</button></div>{cpMsg&&<small className={cp?'qr-okline':'qr-warn'}>{cpMsg}</small>}
      {offers.length>0&&<button type="button" className="co-offers-btn" onClick={()=>setShowOffers(true)}><Icon name="percent" size={15} stroke={2.4}/>View available coupons<em>{offers.length}</em></button>}
      {showOffers&&<div className="co-modal" role="dialog" aria-modal="true" aria-labelledby="offers-title"><button type="button" className="co-modal-bg" aria-label="Close" onClick={()=>setShowOffers(false)}/>
        <div className="co-modal-box"><div className="co-modal-head"><h3 id="offers-title">Available coupons</h3><button type="button" className="co-x" aria-label="Close" onClick={()=>setShowOffers(false)}>×</button></div>
          <p className="muted tiny">Tap <b>Apply</b> to use a coupon on this order, or copy the code.</p>
          <div className="co-offer-list">{offers.map(o=><div key={o.code} className={'co-offer'+(o.eligible?'':' off')}>
            <div className="co-offer-top"><b>{o.label}</b>{o.allow_bulk&&<span className="co-tag">Bulk OK</span>}</div>
            {o.description&&<p>{o.description}</p>}
            <small className="muted">{o.min_order>1?`Min. order ৳ ${Math.round(o.min_order).toLocaleString('en-IN')}`:'No minimum'}{o.ends_at?` · valid till ${new Date(new Date(o.ends_at).getTime()-1).toLocaleDateString('en-GB',{timeZone:'UTC'})}`:''}</small>
            {!o.eligible&&<small className="co-short">Add ৳ {Math.round(o.short_by).toLocaleString('en-IN')} more to use this</small>}
            <div className="co-offer-act"><span className="co-code">{o.code}</span><button type="button" className="btn btn-ghost btn-sm" onClick={()=>copyCode(o.code)}>{copied===o.code?'Copied ✓':'Copy'}</button><button type="button" className="btn btn-sm" disabled={!o.eligible} onClick={()=>useOffer(o.code)}>Apply</button></div>
          </div>)}</div></div></div>}
      <div className="sum-row"><span>Subtotal</span><span>৳ {est.sub.toLocaleString('en-IN')}</span></div>
      {est.c>0&&<div className="sum-row good"><span>Coupon</span><span>− ৳ {Math.round(est.c).toLocaleString('en-IN')}</span></div>}
      <div className="sum-row"><span>Delivery ({f.district})</span><span>৳ {est.del}</span></div>
      {digital&&<div className="sum-row good strong"><span>Advance payment discount ({pct}%)</span><span>− ৳ {(quote?Math.round(quote.payment_discount):est.saving).toLocaleString('en-IN')}</span></div>}
      {quote?.estimated_shipping>0&&<div className="sum-row"><span>Extra shipping (weight)</span><span>৳ {Math.round(quote.estimated_shipping).toLocaleString('en-IN')}</span></div>}
      {quote?.bulk_discount>0&&<div className="sum-row good"><span>Dealer discount</span><span>− ৳ {Math.round(quote.bulk_discount).toLocaleString('en-IN')}</span></div>}
      {bulk&&<div className="sum-row good"><span>Dealer / bulk discount</span><span>On confirmation</span></div>}
      <div className="sum-row total"><span>Total</span><b>৳ {(quote?Math.round(quote.grand_total):est.total).toLocaleString('en-IN')}</b></div>
      {bulk&&<div className="sum-row"><span>Pay now (advance)</span><b>৳ {(quote?Math.round(quote.advance_required):est.adv).toLocaleString('en-IN')}</b></div>}
      {state.kind==='err'&&<p className="form-err" role="alert">{state.text}</p>}
      <button className="btn btn-lg btn-block" disabled={state.kind==='busy'}>{state.kind==='busy'?'Placing order…':!logged?<>Continue — verify mobile <Icon name="arrowRight" size={18}/></>:pay==='manual'?<><Icon name="check" size={19}/>Place Order · ৳ {sendAmt.toLocaleString('en-IN')} sent by {chLabel}</>:pay==='paystation'?<><Icon name="secure" size={19}/>Pay ৳ {(bulk?est.adv:est.total).toLocaleString('en-IN')} securely</>:'Place Order (Cash on Delivery)'}</button>
      <p className="muted tiny">The final amount is confirmed by our server. Nothing is sent to the courier until EMXIN confirms your order by phone.</p>
    </aside>
  </form>;
}
