'use client';
import {useEffect,useState} from 'react';
import Icon from '@/components/Icon';
import {API} from '@/lib/api';
const STEPS=['Pending Confirmation','Confirmed','Sent to Courier','Delivered'];
export default function Track(){
  const[id,setId]=useState('');const[phone,setPhone]=useState('');const[r,setR]=useState<any>();const[err,setErr]=useState('');const[busy,setBusy]=useState(false);
  useEffect(()=>{const q=new URLSearchParams(location.search).get('order_id');if(q)setId(q)},[]);
  async function go(e:React.FormEvent){e.preventDefault();setBusy(true);setErr('');setR(null);try{const x=await fetch(`${API}/orders/track?order_id=${encodeURIComponent(id.trim())}&phone=${encodeURIComponent(phone.trim())}`);const j=await x.json();if(!x.ok)throw new Error(j.detail||'Order not found');setR(j)}catch(e:any){setErr(e.message)}finally{setBusy(false)}}
  const step=r?Math.max(0,STEPS.indexOf(r.order_status==='Completed'?'Delivered':r.order_status==='Processing'?'Confirmed':r.order_status)):0;
  return <><form className="panel track-form" onSubmit={go}><label className="qr-field"><span>Order ID</span><input placeholder="EMX-…" value={id} onChange={e=>setId(e.target.value)} required/></label><label className="qr-field"><span>Phone</span><input type="tel" placeholder="017XXXXXXXX" value={phone} onChange={e=>setPhone(e.target.value)} required/></label><button className="btn btn-lg" disabled={busy}>{busy?'Checking…':'Track Order'}</button></form>
    {err&&<p className="form-err">{err}</p>}
    {r&&<div className="panel track-res"><div className="track-top"><div><small className="muted">Order</small><h3>{r.order_id}</h3></div><span className={'status-pill s-'+String(r.order_status).toLowerCase().replace(/\s+/g,'-')}>{r.order_status}</span></div>
      {['Cancelled','Returned'].includes(r.order_status)?<p className="note-warn">This order was {String(r.order_status).toLowerCase()}.</p>:<ol className="steps">{STEPS.map((s,i)=><li key={s} className={i<=step?'done':''}><i>{i<=step?<Icon name="check" size={14} stroke={3}/>:i+1}</i><span>{s==='Pending Confirmation'?'Order Placed':s}</span></li>)}</ol>}
      <div className="sum-row"><span>Payment</span><b>{r.payment_status}</b></div><div className="sum-row"><span>Total</span><b>৳ {Number(r.pricing?.grand_total||0).toLocaleString('en-IN')}</b></div>{r.tracking_code&&<div className="sum-row"><span>Courier tracking</span><b>{r.courier} · {r.tracking_code}</b></div>}
      {r.items?.length>0&&<ul className="track-items">{r.items.map((i:any,k:number)=><li key={k}>{i.name} × {i.quantity} <small>({i.frame_color})</small></li>)}</ul>}</div>}</>;
}
