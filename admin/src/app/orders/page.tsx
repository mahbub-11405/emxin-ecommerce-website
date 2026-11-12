'use client';
import {useCallback,useEffect,useState} from 'react';
import Shell from '@/components/Shell';
import Icon from '@/components/Icon';
import {PageHead,Status,Drawer,Tabs,Empty,Loading,toast,Field} from '@/components/ui';
import {api,put,postJSON,tk,dt,downloadCSV} from '@/lib/api';

const STATUSES=['Pending Confirmation','Confirmed','Processing','Sent to Courier','Delivered','Completed','Returned','Cancelled'];
const PAYMENTS=['Unpaid','Pending Payment','Advance Required','Pending Advance Payment','Awaiting Advance Verification','Advance Paid','Paid','COD Collected','Refunded','Failed'];
const CHANNELS=['','cod','bkash','nagad','rocket','card','bank','paystation','other'];

function OrderDetail({id,onChanged}:{id:string;onChanged:()=>void}){
  const[d,setD]=useState<any>(null);const[busy,setBusy]=useState('');
  const[f,setF]=useState({order_status:'',payment_status:'',payment_channel:'',note:''});
  const load=useCallback(()=>api(`/admin/orders/${id}/detail`).then(x=>{setD(x);setF({order_status:x.order.order_status,payment_status:x.order.payment_status,payment_channel:x.order.payment_channel||'',note:''})}).catch(e=>toast.err(e.message)),[id]);
  useEffect(()=>{load()},[load]);
  async function run(label:string,fn:()=>Promise<any>){setBusy(label);try{await fn();toast.ok(label+' — done');await load();onChanged()}catch(e:any){toast.err(e.message)}finally{setBusy('')}}
  if(!d)return <Loading/>;
  const o=d.order;const p=o.pricing||{};
  const locked=['Cancelled','Returned'].includes(o.order_status);
  return <div className="od">
    <div className="od-top"><div><Status s={o.order_status}/> <Status s={o.payment_status}/>{p.is_bulk&&<span className="st st-purple">Bulk</span>}</div><small className="muted">{dt(o.created_at)}</small></div>
    {!locked&&<div className="od-actions">
      {o.order_status==='Pending Confirmation'&&<button className="btn" disabled={!!busy} onClick={()=>run('Confirmed',()=>postJSON(`/admin/orders/${o.order_id}/confirm`,{}))}><Icon name="phone" size={17}/>Customer confirmed</button>}
      {['Confirmed','Approved'].includes(o.order_status)&&<><button className="btn" disabled={!!busy} onClick={()=>run('Sent to Steadfast',()=>api(`/admin/orders/${o.order_id}/send-courier?courier=steadfast`,{method:'POST'}))}><Icon name="truck" size={17}/>Send to Steadfast</button><button className="btn btn-soft" disabled={!!busy} onClick={()=>run('Sent to Pathao',()=>api(`/admin/orders/${o.order_id}/send-courier?courier=pathao`,{method:'POST'}))}>Send to Pathao</button></>}
      <button className="btn btn-ghost" onClick={()=>window.open(`/orders/invoice?id=${o.order_id}`,'_blank')}><Icon name="download" size={17}/>Invoice</button>
    </div>}
    <div className="od-grid">
      <section><h4>Customer</h4><p><b>{o.customer_name}</b>{o.shop_name&&<> · {o.shop_name}</>}<br/><a className="lnk" href={`tel:${o.phone}`}>{o.phone}</a>{o.email&&<><br/>{o.email}</>}</p><p className="muted">{o.address}, {o.district}</p><p className="tiny muted">{d.previous_orders} previous order(s) from this phone{d.customer?` · Lead: ${d.customer.lead_status||'—'}`:''}</p></section>
      <section><h4>Delivery</h4><p>Courier: <b>{o.courier||'Not sent'}</b></p>{o.courier_data?.consignment?.tracking_code&&<p>Tracking: <b>{o.courier_data.consignment.tracking_code}</b></p>}<p className="tiny muted">{o.courier_billing_mode==='merchant_periodic_bill'?'Prepaid: courier bills merchant periodically':'COD: courier charge deducted from collection'}</p></section>
    </div>
    <h4>Items</h4><table className="tbl compact"><tbody>{o.items.map((i:any,k:number)=><tr key={k}><td>{i.name}<br/><small className="muted">{i.frame_color}</small></td><td>× {i.quantity}</td><td className="r">{tk(i.unit_price*i.quantity)}</td></tr>)}</tbody></table>
    <div className="od-price">{[['Subtotal',p.subtotal],['Bulk / dealer discount',-p.bulk_discount],['Coupon'+(o.coupon_code?` (${o.coupon_code})`:''),-p.coupon_discount],['Delivery',p.delivery_charge],['Estimated shipping',p.estimated_shipping],['Digital payment discount',-p.payment_discount]].filter(([,v])=>Number(v)).map(([l,v])=><div key={l as string}><span>{l}</span><span>{Number(v)<0?'− ':''}{tk(Math.abs(Number(v)))}</span></div>)}
      <div className="tot"><span>Grand total</span><b>{tk(p.grand_total)}</b></div>{p.advance_required>0&&<div><span>Advance required</span><b>{tk(p.advance_required)}</b></div>}<div><span>COD to collect</span><b>{tk(p.cod_due)}</b></div></div>
    {!locked&&<section className="od-update"><h4>Update order</h4><div className="fgrid">
      <Field label="Order status"><select value={f.order_status} onChange={e=>setF({...f,order_status:e.target.value})}>{STATUSES.map(s=><option key={s}>{s}</option>)}</select></Field>
      <Field label="Payment status"><select value={f.payment_status} onChange={e=>setF({...f,payment_status:e.target.value})}>{PAYMENTS.map(s=><option key={s}>{s}</option>)}</select></Field>
      <Field label="Paid via (channel)"><select value={f.payment_channel} onChange={e=>setF({...f,payment_channel:e.target.value})}>{CHANNELS.map(s=><option key={s} value={s}>{s||'—'}</option>)}</select></Field>
      <Field label="Note / transaction ID" span><input value={f.note} onChange={e=>setF({...f,note:e.target.value})} placeholder="e.g. bKash TrxID 9XK2…, customer asked to deliver after 5pm"/></Field>
    </div><button className="btn" disabled={!!busy} onClick={()=>run('Order updated',()=>put(`/admin/orders/${o.order_id}/status`,{order_status:f.order_status!==o.order_status?f.order_status:null,payment_status:f.payment_status!==o.payment_status?f.payment_status:null,payment_channel:f.payment_channel||null,note:f.note}))}>Save changes</button>
      <p className="tiny muted">Cancelled/Returned releases reserved stock. Marking Paid/COD Collected writes a ledger entry. Delivered adds to product sold count.</p></section>}
    <h4>Timeline</h4><ol className="tl">{[...(o.timeline||[])].reverse().map((t:any,i:number)=><li key={i}><time>{dt(t.at)}</time><div>{t.order_status&&<Status s={t.order_status}/>} {t.payment_status&&<Status s={t.payment_status}/>}{t.note&&<p>{t.note}</p>}<small className="muted">{t.role||''}</small></div></li>)}</ol>
    {d.payment_callbacks?.length>0&&<><h4>Gateway callbacks (unverified)</h4>{d.payment_callbacks.map((c:any)=><p key={c._id} className="tiny">{dt(c.received_at)} · {c.status}</p>)}</>}
  </div>;
}

export default function Orders(){
  const[status,setStatus]=useState('');const[q,setQ]=useState('');const[payment,setPayment]=useState('');const[method,setMethod]=useState('');const[start,setStart]=useState('');const[end,setEnd]=useState('');const[page,setPage]=useState(1);
  const[d,setD]=useState<any>(null);const[open,setOpen]=useState('');
  const load=useCallback(()=>{const s=new URLSearchParams({page:String(page),page_size:'25'});if(status)s.set('status',status);if(q)s.set('q',q);if(payment)s.set('payment',payment);if(method)s.set('method',method);if(start)s.set('start',start);if(end)s.set('end',end);api('/admin/orders/search?'+s).then(setD).catch(e=>toast.err(e.message))},[status,q,payment,method,start,end,page]);
  useEffect(()=>{const t=setTimeout(load,q?300:0);return()=>clearTimeout(t)},[load,q]);
  useEffect(()=>{const o=new URLSearchParams(location.search).get('open');if(o)setOpen(o)},[]);
  const total=d?Object.values(d.by_status||{}).reduce((a:any,b:any)=>a+b,0) as number:0;
  return <Shell>
    <PageHead title="Orders" sub="Call the customer → confirm → send to courier. Nothing reaches the courier before you confirm."><button className="btn btn-ghost" onClick={()=>d&&downloadCSV('emxin-orders.csv',d.rows,[['Order','order_id'],['Date',r=>dt(r.created_at)],['Customer','customer_name'],['Phone','phone'],['District','district'],['Items',r=>r.items.map((i:any)=>`${i.name} x${i.quantity}`).join('; ')],['Total',r=>r.pricing?.grand_total],['COD due',r=>r.pricing?.cod_due],['Payment','payment_method'],['Payment status','payment_status'],['Status','order_status'],['Courier','courier']])}><Icon name="download" size={17}/>Export CSV</button></PageHead>
    <Tabs value={status} onChange={k=>{setStatus(k);setPage(1)}} tabs={[{key:'',label:'All',count:total},...STATUSES.map(s=>({key:s,label:s,count:d?.by_status?.[s]||0}))]}/>
    <div className="filters"><div className="search-in"><Icon name="search" size={17}/><input placeholder="Order ID, name, phone, shop" value={q} onChange={e=>{setQ(e.target.value);setPage(1)}}/></div>
      <select value={payment} onChange={e=>{setPayment(e.target.value);setPage(1)}}><option value="">All payment statuses</option>{PAYMENTS.map(p=><option key={p}>{p}</option>)}</select>
      <select value={method} onChange={e=>{setMethod(e.target.value);setPage(1)}}><option value="">All methods</option>{CHANNELS.filter(Boolean).map(p=><option key={p}>{p}</option>)}</select>
      <input type="date" value={start} onChange={e=>setStart(e.target.value)} aria-label="From"/><input type="date" value={end} onChange={e=>setEnd(e.target.value)} aria-label="To"/></div>
    <div className="card flush">{!d?<Loading/>:d.rows.length?<div className="tbl-wrap"><table className="tbl"><thead><tr><th>Order</th><th>Date</th><th>Customer</th><th>Items</th><th>Amount</th><th>Payment</th><th>Status</th><th/></tr></thead><tbody>{d.rows.map((o:any)=><tr key={o.order_id} className="click" onClick={()=>setOpen(o.order_id)}>
      <td><b className="lnk">#{o.order_id}</b>{o.pricing?.is_bulk&&<><br/><span className="st st-purple">Bulk</span></>}</td><td className="nowrap">{dt(o.created_at)}</td><td>{o.customer_name}<br/><small className="muted">{o.phone} · {o.district}</small></td><td>{o.items.reduce((n:number,i:any)=>n+i.quantity,0)} pcs<br/><small className="muted">{o.items[0]?.name}{o.items.length>1?` +${o.items.length-1}`:''}</small></td>
      <td><b>{tk(o.pricing?.grand_total)}</b>{o.pricing?.cod_due>0&&<><br/><small className="muted">COD {tk(o.pricing.cod_due)}</small></>}</td><td><Status s={o.payment_status}/><br/><small className="muted">{o.payment_channel||o.payment_method}</small></td><td><Status s={o.order_status}/>{o.courier&&<><br/><small className="muted">{o.courier}</small></>}</td><td><Icon name="chevronRight" size={18}/></td></tr>)}</tbody></table></div>:<Empty text="No orders match these filters." icon="orders"/>}
      {d&&d.total>d.page_size&&<div className="pager"><button className="btn btn-sm btn-ghost" disabled={page<=1} onClick={()=>setPage(page-1)}>Previous</button><span>Page {page} of {Math.ceil(d.total/d.page_size)} · {d.total} orders</span><button className="btn btn-sm btn-ghost" disabled={page>=Math.ceil(d.total/d.page_size)} onClick={()=>setPage(page+1)}>Next</button></div>}</div>
    <Drawer open={!!open} title={<>Order #{open}</>} onClose={()=>{setOpen('');history.replaceState(null,'','/orders')}} width={640}>{open&&<OrderDetail id={open} onChanged={load}/>}</Drawer>
  </Shell>;
}
