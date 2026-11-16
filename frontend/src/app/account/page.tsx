'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import {API,postJSON,payLabel} from '@/lib/api';
import {getToken,logout} from '@/lib/auth';
import {refreshProfile} from '@/lib/profile';
import {DISTRICTS} from '@/lib/districts';
const PENDING=['Pending Payment','Pending Advance Payment','Advance Required'];
function ResendTrx({o,onDone}:{o:any;onDone:()=>void}){
  const m=o.manual_payment;const[f,setF]=useState({channel:m.channel,trx_id:'',sender_number:''});const[err,setErr]=useState('');const[busy,setBusy]=useState(false);
  async function go(e:React.FormEvent){e.preventDefault();setBusy(true);setErr('');try{await postJSON(`/orders/${o.order_id}/manual-payment`,f,getToken());onDone()}catch(x:any){setErr(x.message)}finally{setBusy(false)}}
  return <form className="acc-mp bad" onSubmit={go}><p><Icon name="info" size={15}/><span>We could not find payment <b>{m.trx_id}</b>{m.note?<> — {m.note}</>:''}. Please send <b>৳ {Number(m.amount_expected).toLocaleString('en-IN')}</b> to {m.channel_label} <b>{m.to_number}</b> and enter the new TrxID.</span></p>
    <div className="row-gap"><input required placeholder="New TrxID" value={f.trx_id} onChange={e=>setF({...f,trx_id:e.target.value.toUpperCase().replace(/\s/g,'')})}/><input required type="tel" placeholder="Sent from 017…" value={f.sender_number} onChange={e=>setF({...f,sender_number:e.target.value})}/><button className="btn btn-sm" disabled={busy}>{busy?'Sending…':'Send TrxID'}</button></div>{err&&<small className="form-err">{err}</small>}</form>;
}
const tkf=(n:any)=>'৳ '+Math.round(Number(n)||0).toLocaleString('en-IN');
/** Before EMXIN confirms: pay a COD order by bKash / Nagad Send Money (2% off products), or go back to COD. */
function SwitchPay({o,onClose,onDone}:{o:any;onClose:()=>void;onDone:(msg:string)=>void}){
  const[q,setQ]=useState<any>(null);const[err,setErr]=useState('');const[busy,setBusy]=useState(false);const[copied,setCopied]=useState('');
  const[f,setF]=useState({channel:'',trx_id:'',sender_number:''});
  useEffect(()=>{fetch(`${API}/orders/${o.order_id}/payment-options`,{headers:{Authorization:'Bearer '+getToken()}}).then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j.detail||'Could not load payment options');setQ(j);setF(v=>({...v,channel:j.channels?.[0]?.channel||''}))}).catch(e=>setErr(e.message))},[o.order_id]);
  useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};addEventListener('keydown',k);return()=>removeEventListener('keydown',k)},[onClose]);
  const ch=q?.channels?.find((c:any)=>c.channel===f.channel);
  const copy=(t:string,k:string)=>{try{navigator.clipboard?.writeText(t)}catch{}setCopied(k);setTimeout(()=>setCopied(''),1500)};
  async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setErr('');try{await postJSON(`/orders/${o.order_id}/change-payment`,{method:'manual',...f},getToken());onDone(`${ch?.label} TrxID ${f.trx_id} sent. EMXIN will verify it and confirm your order by SMS.`)}catch(x:any){setErr(x.message)}finally{setBusy(false)}}
  async function backToCod(){setBusy(true);setErr('');try{await postJSON(`/orders/${o.order_id}/change-payment`,{method:'cod'},getToken());onDone('Payment changed to Cash on Delivery.')}catch(x:any){setErr(x.message)}finally{setBusy(false)}}
  return <div className="co-modal" role="dialog" aria-modal="true" aria-labelledby="sp-title"><button type="button" className="co-modal-bg" aria-label="Close" onClick={onClose}/>
    <div className="co-modal-box sp-box"><div className="co-modal-head"><h3 id="sp-title">Pay by bKash / Nagad</h3><button type="button" className="co-x" aria-label="Close" onClick={onClose}>×</button></div>
      <p className="muted tiny">Order <b>{o.order_id}</b></p>
      {!q&&!err&&<p className="muted">Loading…</p>}
      {q&&!q.channels?.length&&<p className="form-err">bKash / Nagad payment is not available right now. Your order stays Cash on Delivery.</p>}
      {q&&q.channels?.length>0&&<form onSubmit={submit}>
        <div className="sp-amt"><div><small>{q.current_method==='cod'?'Cash on Delivery':'Before'}</small><s>{tkf(q.current_total)}</s></div><Icon name="arrowRight" size={18}/><div><small>Pay now {q.is_bulk?'(advance)':''}</small><b>{tkf(q.send_amount)}</b></div>{q.payment_discount>0&&<em className="save">SAVE {tkf(q.payment_discount)}</em>}</div>
        {q.payment_discount>0&&<p className="tiny muted">Advance Payment Discount: {q.discount_percent}% off the product price (not delivery) for paying before delivery.</p>}
        {q.channels.length>1&&<div className="mp-tabs">{q.channels.map((c:any)=><button type="button" key={c.channel} className={'mp-tab '+c.channel+(f.channel===c.channel?' on':'')} onClick={()=>setF({...f,channel:c.channel})}>{c.label}</button>)}</div>}
        {ch&&<ol className="mp-steps">
          <li>Open the <b>{ch.label}</b> app → <b>Send Money</b></li>
          <li>Send to <button type="button" className="mp-copy" onClick={()=>copy(ch.number,'n')}><b>{ch.number}</b><Icon name="copy" size={14}/>{copied==='n'&&<small> copied</small>}</button> <small className="muted">({ch.label} {ch.account_type})</small></li>
          <li>Amount <button type="button" className="mp-copy amt" onClick={()=>copy(String(Math.round(q.send_amount)),'a')}><b>{tkf(q.send_amount)}</b><Icon name="copy" size={14}/>{copied==='a'&&<small> copied</small>}</button></li>
          <li>Enter the <b>TrxID</b> from the {ch.label} message below</li></ol>}
        <div className="grid-2">
          <label className="qr-field"><span>Transaction ID (TrxID) <em>*</em></span><input required value={f.trx_id} onChange={e=>setF({...f,trx_id:e.target.value.toUpperCase().replace(/\s/g,'')})} placeholder="e.g. 9KX7A2B1QZ" autoComplete="off"/></label>
          <label className="qr-field"><span>Sent from ({ch?.label} number) <em>*</em></span><input required type="tel" value={f.sender_number} onChange={e=>setF({...f,sender_number:e.target.value})} placeholder="017XXXXXXXX"/></label></div>
        {err&&<p className="form-err" role="alert">{err}</p>}
        <button className="btn btn-lg btn-block" disabled={busy}>{busy?'Sending…':<><Icon name="check" size={18}/>I have sent {tkf(q.send_amount)} · Submit TrxID</>}</button>
        <small className="muted tiny">EMXIN checks the TrxID, then confirms your order and sends you an SMS. Until then you can still change your mind.</small>
      </form>}
      {q&&q.current_method!=='cod'&&q.can_use_cod&&<button type="button" className="btn btn-ghost btn-block" disabled={busy} onClick={backToCod}>Pay cash on delivery instead</button>}
      {err&&!q&&<p className="form-err">{err}</p>}
    </div></div>;
}
const GROUPS:[string,string,(o:any)=>boolean][]=[
  ['all','All',()=>true],
  ['pending','Pending',o=>o.order_status==='Pending Confirmation'],
  ['active','Confirmed / on the way',o=>['Confirmed','Approved','Processing','Sent to Courier'].includes(o.order_status)],
  ['done','Delivered',o=>['Delivered','Completed'].includes(o.order_status)],
  ['cancelled','Cancelled',o=>['Cancelled','Returned'].includes(o.order_status)],
];
const SHOW=3;
const sc=(s:string)=>'status-pill s-'+String(s).toLowerCase().replace(/\s+/g,'-');
/** All orders, newest first, with status tabs. Shows 3, then "View all". Cancelled orders say who cancelled and why. */
function MyOrders({orders,busy,pay,onSwitch,onChanged,onError}:{orders:any[];busy:string;pay:(id:string)=>void;onSwitch:(o:any)=>void;onChanged:(m:string)=>void;onError:(m:string)=>void}){
  const[g,setG]=useState('all');const[all,setAll]=useState(false);const[ask,setAsk]=useState<any>(null);const[why,setWhy]=useState('');const[cbusy,setCbusy]=useState(false);
  const list=orders.filter(GROUPS.find(x=>x[0]===g)![2]);const shown=all?list:list.slice(0,SHOW);
  async function cancel(){if(!ask)return;setCbusy(true);try{await postJSON(`/orders/${ask.order_id}/cancel`,{reason:why.trim()},getToken());setAsk(null);setWhy('');onChanged(`Order ${ask.order_id} is cancelled.`)}catch(x:any){setAsk(null);onError(x.message)}finally{setCbusy(false)}}
  return <section className="panel"><h2>My Orders <small className="muted">({orders.length})</small></h2>
    {orders.length>0&&<div className="ord-tabs" role="tablist">{GROUPS.map(([k,l,fn])=>{const n=orders.filter(fn).length;return (k==='all'||n>0)?<button key={k} role="tab" aria-selected={g===k} className={g===k?'on':''} onClick={()=>{setG(k);setAll(false)}}>{l}<em>{n}</em></button>:null})}</div>}
    {!orders.length?<p className="muted">No orders yet. <Link href="/shop">Start shopping</Link></p>:!list.length?<p className="muted">No orders here.</p>:shown.map((o:any)=>{const closed=['Cancelled','Returned'].includes(o.order_status);return <div className={'acc-order'+(closed?' is-closed':'')} key={o.order_id}><div><b>{o.order_id}</b><small className="muted">{new Date(o.created_at).toLocaleDateString('en-GB')} · {o.items?.reduce((n:number,i:any)=>n+i.quantity,0)} pcs</small></div>
      <div><span className={sc(o.order_status)}>{o.order_status==='Pending Confirmation'?'Pending':o.order_status}</span><small className="muted">{o.payment_status} · {payLabel(o)}</small></div><b>৳ {Number(o.pricing?.grand_total||0).toLocaleString('en-IN')}</b>
      <div className="acc-act">{!closed&&PENDING.includes(o.payment_status)?<button className="btn btn-sm" disabled={busy===o.order_id} onClick={()=>pay(o.order_id)}>{busy===o.order_id?'Opening…':'Pay now'}</button>:!closed&&o.payment_method==='cod'&&o.payment_status==='Unpaid'&&o.order_status==='Pending Confirmation'?<button className="btn btn-sm btn-outline" onClick={()=>onSwitch(o)} title="Pay by bKash / Nagad before EMXIN confirms and save on the product price">Pay by bKash / Nagad · save 2%</button>:null}
        {o.can_cancel&&<button className="btn btn-sm btn-ghost danger" onClick={()=>{setWhy('');setAsk(o)}}>Cancel order</button>}
        {!o.removed&&<Link className="btn btn-sm btn-ghost" href={`/track-order?order_id=${o.order_id}`}>Track</Link>}</div>
      {o.order_status==='Cancelled'&&<div className="acc-cancel"><Icon name="info" size={16}/><div><b>{o.cancelled_by==='customer'?'You cancelled this order':'Cancelled by EMXIN'}</b>{o.cancelled_at&&<small> · {new Date(o.cancelled_at).toLocaleDateString('en-GB')}</small>}
        {o.cancel_reason?<p>Reason: {o.cancel_reason}</p>:o.cancelled_by!=='customer'?<p>Questions? Message or call EMXIN.</p>:null}</div></div>}
      {!closed&&o.order_status==='Pending Confirmation'&&!o.can_cancel&&o.payment_method==='manual'&&<p className="tiny muted">Want to cancel? You already sent money, so please message EMXIN and we will cancel it and return the money.</p>}
      {o.manual_payment?.status==='pending'&&!closed&&<p className="acc-mp wait"><Icon name="info" size={15}/>{o.manual_payment.channel_label} TrxID <b>{o.manual_payment.trx_id}</b> received — EMXIN is verifying it.</p>}
      {o.manual_payment?.status==='rejected'&&!closed&&<ResendTrx o={o} onDone={()=>onChanged('TrxID sent. EMXIN will verify it.')}/>}</div>})}
    {list.length>SHOW&&<button className="btn btn-ghost btn-block ord-more" onClick={()=>setAll(!all)}>{all?'Show less':<>View all {list.length} orders<Icon name="chevronDown" size={16}/></>}</button>}
    {ask&&<div className="co-modal" role="dialog" aria-modal="true" aria-labelledby="cx-title"><button type="button" className="co-modal-bg" aria-label="Close" onClick={()=>setAsk(null)}/>
      <div className="co-modal-box"><div className="co-modal-head"><h3 id="cx-title">Cancel order {ask.order_id}?</h3><button type="button" className="co-x" aria-label="Close" onClick={()=>setAsk(null)}>×</button></div>
        <p className="muted">EMXIN has not confirmed it yet, so you can cancel it now. This cannot be undone. You can always place a new order.</p>
        <label className="qr-field"><span>Why? <small className="muted">(optional)</small></span><input value={why} maxLength={200} onChange={e=>setWhy(e.target.value)} placeholder="e.g. Ordered the wrong colour"/></label>
        <div className="row-gap"><button className="btn danger-btn" disabled={cbusy} onClick={cancel}>{cbusy?'Cancelling…':'Yes, cancel order'}</button><button className="btn btn-ghost" onClick={()=>setAsk(null)}>Keep order</button></div></div></div>}
  </section>;
}
export default function Account(){
  const[d,setD]=useState<any>();const[edit,setEdit]=useState(false);const[saving,setSaving]=useState(false);const[ferr,setFerr]=useState('');const[f,setF]=useState<any>({});const[msg,setMsg]=useState('');const[busy,setBusy]=useState('');const[sw,setSw]=useState<any>(null);const[ok,setOk]=useState('');
  const load=()=>{const t=getToken();if(!t){location.href='/login?next=/account';return}fetch(API+'/customers/me',{headers:{Authorization:`Bearer ${t}`}}).then(async r=>{if(r.status===401){logout();location.href='/login?next=/account';return}const j=await r.json();setD(j);setF({name:j.customer.name||'',email:j.customer.email||'',address:j.customer.address||'',district:j.customer.district||'Dhaka'});if(new URLSearchParams(location.search).get('edit')){setEdit(true);history.replaceState(null,'','/account')}}).catch(()=>setMsg('Could not load your account.'))};
  useEffect(load,[]);
  async function save(e:React.FormEvent){e.preventDefault();setSaving(true);setFerr('');try{const r=await fetch(API+'/customers/me',{method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},body:JSON.stringify(f)});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(typeof j.detail==='string'?j.detail:'Could not save. Please check the fields.');
    setD((x:any)=>({...x,customer:{...x.customer,...f,email:f.email||x.customer.email}}));setEdit(false);setOk('Profile saved.');refreshProfile();load()}catch(x:any){setFerr(x.message||'Could not save. Please try again.')}finally{setSaving(false)}}
  async function pay(id:string){setBusy(id);setMsg('');try{const r=await postJSON(`/orders/${id}/pay`,{},getToken());if(r.payment_url)location.href=r.payment_url;else if(r.send_money){const o=d.orders.find((x:any)=>x.order_id===id);if(o)setSw(o)}else setMsg(r.message||'Online payment unavailable right now.')}catch(x:any){setMsg(x.message)}finally{setBusy('')}}
  if(!d)return <main className="wrap section"><p className="muted">{msg||'Loading…'}</p></main>;
  const c=d.customer;
  return <main className="wrap section-sm"><div className="acc-head"><h1 className="page-title">My Account</h1><button className="btn btn-ghost" onClick={()=>{logout();location.href='/'}}><Icon name="logout" size={18}/>Log out</button></div>
    {msg&&<p className="form-err">{msg}</p>}{ok&&<p className="note-good big"><Icon name="checkCircle" size={18}/> {ok}</p>}
    {sw&&<SwitchPay o={sw} onClose={()=>setSw(null)} onDone={m=>{setSw(null);setOk(m);load()}}/>}
    <div className="acc"><section className="panel"><h2>{c.name}</h2><p><Icon name="phone" size={15}/> {c.phone}{c.phone_verified!==false&&<span className="vp"> <Icon name="badgeCheck" size={13}/> verified</span>}</p>{c.email&&<p className="muted">{c.email}</p>}{c.address&&<p className="muted">{c.address}, {c.district}</p>}
      <p className="muted tiny">Orders: {c.total_orders||0} · Total purchase: ৳ {Number(c.total_purchase||0).toLocaleString('en-IN')}</p>
      {!edit?<button className="btn btn-outline btn-sm" onClick={()=>setEdit(true)}><Icon name="user" size={15}/>Edit profile</button>:<form className="stack-form" onSubmit={save}>
        <label className="qr-field"><span>Name</span><input required value={f.name} onChange={e=>setF({...f,name:e.target.value})}/></label><label className="qr-field"><span>Email</span><input type="email" value={f.email} onChange={e=>setF({...f,email:e.target.value})}/></label>
        <label className="qr-field"><span>District</span><select value={f.district} onChange={e=>setF({...f,district:e.target.value})}>{DISTRICTS.map(x=><option key={x}>{x}</option>)}</select></label><label className="qr-field"><span>Default address</span><textarea rows={2} value={f.address} onChange={e=>setF({...f,address:e.target.value})}/></label>
        {ferr&&<p className="form-err" role="alert">{ferr}</p>}
        <div className="row-gap"><button className="btn btn-sm" disabled={saving}>{saving?'Saving…':'Save'}</button><button type="button" className="btn btn-ghost btn-sm" onClick={()=>setEdit(false)}>Cancel</button></div></form>}</section>
    <MyOrders orders={d.orders||[]} busy={busy} pay={pay} onSwitch={(o:any)=>{setOk('');setSw(o)}} onChanged={(m:string)=>{setOk(m);load()}} onError={setMsg}/></div></main>;
}
