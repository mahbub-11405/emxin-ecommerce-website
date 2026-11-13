'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import {API,postJSON} from '@/lib/api';
import {getToken,logout} from '@/lib/auth';
import {DISTRICTS} from '@/lib/districts';
const PENDING=['Pending Payment','Pending Advance Payment','Advance Required'];
function ResendTrx({o,onDone}:{o:any;onDone:()=>void}){
  const m=o.manual_payment;const[f,setF]=useState({channel:m.channel,trx_id:'',sender_number:''});const[err,setErr]=useState('');const[busy,setBusy]=useState(false);
  async function go(e:React.FormEvent){e.preventDefault();setBusy(true);setErr('');try{await postJSON(`/orders/${o.order_id}/manual-payment`,f,getToken());onDone()}catch(x:any){setErr(x.message)}finally{setBusy(false)}}
  return <form className="acc-mp bad" onSubmit={go}><p><Icon name="info" size={15}/><span>We could not find payment <b>{m.trx_id}</b>{m.note?<> — {m.note}</>:''}. Please send <b>৳ {Number(m.amount_expected).toLocaleString('en-IN')}</b> to {m.channel_label} <b>{m.to_number}</b> and enter the new TrxID.</span></p>
    <div className="row-gap"><input required placeholder="New TrxID" value={f.trx_id} onChange={e=>setF({...f,trx_id:e.target.value.toUpperCase().replace(/\s/g,'')})}/><input required type="tel" placeholder="Sent from 017…" value={f.sender_number} onChange={e=>setF({...f,sender_number:e.target.value})}/><button className="btn btn-sm" disabled={busy}>{busy?'Sending…':'Send TrxID'}</button></div>{err&&<small className="form-err">{err}</small>}</form>;
}
export default function Account(){
  const[d,setD]=useState<any>();const[edit,setEdit]=useState(false);const[f,setF]=useState<any>({});const[msg,setMsg]=useState('');const[busy,setBusy]=useState('');
  const load=()=>{const t=getToken();if(!t){location.href='/login?next=/account';return}fetch(API+'/customers/me',{headers:{Authorization:`Bearer ${t}`}}).then(async r=>{if(r.status===401){logout();location.href='/login?next=/account';return}const j=await r.json();setD(j);setF({name:j.customer.name||'',email:j.customer.email||'',address:j.customer.address||'',district:j.customer.district||'Dhaka'})}).catch(()=>setMsg('Could not load your account.'))};
  useEffect(load,[]);
  async function save(e:React.FormEvent){e.preventDefault();try{const r=await fetch(API+'/customers/me',{method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},body:JSON.stringify(f)});const j=await r.json();if(!r.ok)throw new Error(j.detail);setEdit(false);load()}catch(x:any){setMsg(x.message)}}
  async function pay(id:string){setBusy(id);setMsg('');try{const r=await postJSON(`/orders/${id}/pay`,{},getToken());if(r.payment_url)location.href=r.payment_url;else setMsg(r.message||'Online payment unavailable right now.')}catch(x:any){setMsg(x.message)}finally{setBusy('')}}
  if(!d)return <main className="wrap section"><p className="muted">{msg||'Loading…'}</p></main>;
  const c=d.customer;
  return <main className="wrap section-sm"><div className="acc-head"><h1 className="page-title">My Account</h1><button className="btn btn-ghost" onClick={()=>{logout();location.href='/'}}><Icon name="logout" size={18}/>Log out</button></div>
    {msg&&<p className="form-err">{msg}</p>}
    <div className="acc"><section className="panel"><h2>{c.name}</h2><p><Icon name="phone" size={15}/> {c.phone}{c.phone_verified!==false&&<span className="vp"> <Icon name="badgeCheck" size={13}/> verified</span>}</p>{c.email&&<p className="muted">{c.email}</p>}{c.address&&<p className="muted">{c.address}, {c.district}</p>}
      <p className="muted tiny">Orders: {c.total_orders||0} · Total purchase: ৳ {Number(c.total_purchase||0).toLocaleString('en-IN')}</p>
      {!edit?<button className="btn btn-outline btn-sm" onClick={()=>setEdit(true)}><Icon name="user" size={15}/>Edit profile</button>:<form className="stack-form" onSubmit={save}>
        <label className="qr-field"><span>Name</span><input required value={f.name} onChange={e=>setF({...f,name:e.target.value})}/></label><label className="qr-field"><span>Email</span><input type="email" value={f.email} onChange={e=>setF({...f,email:e.target.value})}/></label>
        <label className="qr-field"><span>District</span><select value={f.district} onChange={e=>setF({...f,district:e.target.value})}>{DISTRICTS.map(x=><option key={x}>{x}</option>)}</select></label><label className="qr-field"><span>Default address</span><textarea rows={2} value={f.address} onChange={e=>setF({...f,address:e.target.value})}/></label>
        <div className="row-gap"><button className="btn btn-sm">Save</button><button type="button" className="btn btn-ghost btn-sm" onClick={()=>setEdit(false)}>Cancel</button></div></form>}</section>
    <section className="panel"><h2>My Orders</h2>{d.orders?.length?d.orders.map((o:any)=><div className="acc-order" key={o.order_id}><div><b>{o.order_id}</b><small className="muted">{new Date(o.created_at).toLocaleDateString('en-GB')} · {o.items?.reduce((n:number,i:any)=>n+i.quantity,0)} pcs</small></div>
      <div><span className={'status-pill s-'+String(o.order_status).toLowerCase().replace(/\s+/g,'-')}>{o.order_status}</span><small className="muted">{o.payment_status}</small></div><b>৳ {Number(o.pricing?.grand_total||0).toLocaleString('en-IN')}</b>
      <div className="acc-act">{PENDING.includes(o.payment_status)&&!['Cancelled','Returned'].includes(o.order_status)?<button className="btn btn-sm" disabled={busy===o.order_id} onClick={()=>pay(o.order_id)}>{busy===o.order_id?'Opening…':'Pay now'}</button>:o.payment_method==='cod'&&o.payment_status==='Unpaid'&&o.order_status==='Pending Confirmation'?<button className="btn btn-sm btn-outline" disabled={busy===o.order_id} onClick={()=>pay(o.order_id)} title="Switch to digital payment and save 2%">Pay online · save 2%</button>:null}<Link className="btn btn-sm btn-ghost" href={`/track-order?order_id=${o.order_id}`}>Track</Link></div>
      {o.manual_payment?.status==='pending'&&<p className="acc-mp wait"><Icon name="info" size={15}/>{o.manual_payment.channel_label} TrxID <b>{o.manual_payment.trx_id}</b> received — EMXIN is verifying it.</p>}
      {o.manual_payment?.status==='rejected'&&!['Cancelled','Returned'].includes(o.order_status)&&<ResendTrx o={o} onDone={load}/>}</div>):<p className="muted">No orders yet. <Link href="/shop">Start shopping</Link></p>}</section></div></main>;
}
