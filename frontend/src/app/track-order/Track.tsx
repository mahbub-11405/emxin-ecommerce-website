'use client';
import {useEffect,useState} from 'react';
import Icon from '@/components/Icon';
import OrderBill from '@/components/OrderBill';
import {API} from '@/lib/api';
import {getProfile} from '@/lib/profile';
const STEPS=['Pending Confirmation','Confirmed','Sent to Courier','Delivered'];
const PRE='EMX-';
/** Order IDs always start with EMX-, so the box shows it fixed and the customer types only the rest. */
const bare=(v:string)=>v.toUpperCase().replace(/\s/g,'').replace(/^EMX-?/,'');
export default function Track(){
  const[id,setId]=useState('');const[phone,setPhone]=useState('');const[mine,setMine]=useState(false);const[r,setR]=useState<any>();const[err,setErr]=useState('');const[busy,setBusy]=useState(false);
  useEffect(()=>{const q=new URLSearchParams(location.search).get('order_id');if(q)setId(bare(q));
    // logged in: the order was placed with the login number, so it is filled in and fixed
    const p=getProfile();if(p?.phone){setPhone(p.phone);setMine(true)}},[]);
  async function go(e:React.FormEvent){e.preventDefault();setBusy(true);setErr('');setR(null);try{const x=await fetch(`${API}/orders/track?order_id=${encodeURIComponent(PRE+bare(id))}&phone=${encodeURIComponent(phone.trim())}`);const j=await x.json();if(!x.ok)throw new Error(j.detail||'Order not found');setR(j)}catch(e:any){setErr(e.message)}finally{setBusy(false)}}
  const step=r?Math.max(0,STEPS.indexOf(r.order_status==='Completed'?'Delivered':r.order_status==='Processing'?'Confirmed':r.order_status)):0;
  return <><form className="panel track-form" onSubmit={go}>
      <label className="qr-field"><span>Order ID</span><span className="fix-in"><em aria-hidden="true">{PRE}</em><input aria-label="Order ID after EMX-" placeholder="261122-6AF027" value={id} onChange={e=>setId(bare(e.target.value))} required/></span></label>
      <label className="qr-field"><span>Phone{mine&&<small className="muted"> · your login number</small>}</span>{mine?<span className="fix-in locked"><input type="tel" value={phone} readOnly aria-readonly="true"/><Icon name="badgeCheck" size={17}/></span>
        :<input type="tel" placeholder="017XXXXXXXX" value={phone} onChange={e=>setPhone(e.target.value)} required/>}</label>
      <button className="btn btn-lg" disabled={busy}>{busy?'Checking…':'Track Order'}</button></form>
    {err&&<p className="form-err">{err}</p>}
    {r&&<div className="panel track-res"><div className="track-top"><div><small className="muted">Order{r.created_at&&<> · {new Date(r.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</>}</small><h3>{r.order_id}</h3></div><span className={'status-pill s-'+String(r.order_status).toLowerCase().replace(/\s+/g,'-')}>{r.order_status}</span></div>
      {r.order_status==='Cancelled'?<div className="acc-cancel big"><Icon name="info" size={18}/><div><b>{r.cancelled_by==='customer'?'You cancelled this order':'This order was cancelled by EMXIN'}</b>{r.cancelled_at&&<small> · {new Date(r.cancelled_at).toLocaleDateString('en-GB')}</small>}
        {r.cancel_reason?<p>Reason: {r.cancel_reason}</p>:null}{r.cancelled_by!=='customer'&&<p>Questions? Message or call EMXIN, we are happy to help.</p>}</div></div>
      :r.order_status==='Returned'?<p className="note-warn">This order was returned.</p>:<ol className="steps">{STEPS.map((s,i)=><li key={s} className={i<=step?'done':''}><i>{i<=step?<Icon name="check" size={14} stroke={3}/>:i+1}</i><span>{s==='Pending Confirmation'?'Order Placed':s}</span></li>)}</ol>}
      <div className="sum-row"><span>Payment</span><b>{r.payment_status}</b></div>{r.tracking_code&&<div className="sum-row"><span>Courier tracking</span><b>{r.courier} · {r.tracking_code}</b></div>}
      {r.items?.length>0&&<OrderBill o={r}/>}</div>}</>;
}
