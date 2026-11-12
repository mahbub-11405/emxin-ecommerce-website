'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import {postJSON} from '@/lib/api';
import {getToken} from '@/lib/auth';
/** PayStation returns here with ?status=Successful|Failed|Canceled&invoice_number=…&trx_id=…
 *  The query string is never trusted: the backend asks PayStation directly before marking the order paid. */
export default function PaymentResult(){
  const[s,setS]=useState<{k:'check'|'paid'|'failed'|'pending'|'err';d?:any;t?:string}>({k:'check'});const[busy,setBusy]=useState(false);
  async function verify(tries=0){const q=new URLSearchParams(location.search);const inv=q.get('invoice_number');if(!inv)return setS({k:'err',t:'Missing payment reference.'});
    try{const r=await postJSON('/payments/paystation/verify',{invoice_number:inv});
      if(r.paid)return setS({k:'paid',d:r});
      const said=(q.get('status')||'').toLowerCase();
      if(said==='successful'&&tries<4){setTimeout(()=>verify(tries+1),2500);return setS({k:'check',d:r})}  // gateway can lag a few seconds
      setS({k:said==='successful'?'pending':'failed',d:r});
    }catch(e:any){setS({k:'err',t:e.message})}}
  useEffect(()=>{verify()},[]);
  async function retry(){setBusy(true);try{const r=await postJSON(`/orders/${s.d.order_id}/pay`,{},getToken());if(r.payment_url)location.href=r.payment_url;else setS({...s,t:r.message})}catch(e:any){setS({...s,t:e.message})}finally{setBusy(false)}}
  const d=s.d||{};
  return <main className="wrap section"><div className="panel order-done">
    {s.k==='check'&&<><span className="spinner"/><h2>Confirming your payment…</h2><p className="muted">Please don't close this page. We're checking with PayStation.</p></>}
    {s.k==='paid'&&<><span className="done-ico"><Icon name="check" size={34} stroke={3}/></span><h2>Payment successful</h2><p>Order <b>{d.order_id}</b> is paid{d.method?` via ${d.method}`:''}{d.trx_id?` (TrxID ${d.trx_id})`:''}. We'll call you to confirm delivery.</p>
      {d.is_bulk&&d.cod_due>0&&<p className="note-good">Advance received. Remaining ৳ {Number(d.cod_due).toLocaleString('en-IN')} is payable on delivery.</p>}
      <div className="row-gap"><Link className="btn" href={`/track-order?order_id=${d.order_id}`}>Track order</Link><Link className="btn btn-outline" href="/shop">Continue shopping</Link></div></>}
    {(s.k==='failed'||s.k==='pending')&&<><span className="done-ico bad"><Icon name="xCircle" size={34}/></span><h2>{s.k==='pending'?'Payment not confirmed yet':'Payment not completed'}</h2>
      <p>{s.k==='pending'?'PayStation has not confirmed this payment yet. If money was deducted, it will be matched automatically — check again in a minute.':'Your order is saved, but the payment was cancelled or failed. No money was taken.'}</p>
      {d.order_id&&<p className="muted">Order {d.order_id} · ৳ {Number(d.amount||0).toLocaleString('en-IN')} due online</p>}{s.t&&<p className="form-err">{s.t}</p>}
      <div className="row-gap">{s.k==='pending'?<button className="btn" onClick={()=>{setS({k:'check',d});verify()}}>Check again</button>:<button className="btn" disabled={busy} onClick={retry}><Icon name="refresh" size={17}/>{busy?'Opening…':'Try payment again'}</button>}<Link className="btn btn-outline" href="/account">My orders</Link></div></>}
    {s.k==='err'&&<><span className="done-ico bad"><Icon name="info" size={34}/></span><h2>We couldn't check this payment</h2><p>{s.t}</p><Link className="btn" href="/account">Go to My Account</Link></>}
  </div></main>;
}
