'use client';
import {useEffect,useState} from 'react';
import Shell from '@/components/Shell';
import {PageHead,Empty,Loading,toast,Status,Tabs} from '@/components/ui';
import {api,tk,dt} from '@/lib/api';
const WAIT=['Pending Payment','Pending Advance Payment','Advance Required','Awaiting Advance Verification'];
export default function Payments(){
  const[tab,setTab]=useState('verify');const[orders,setOrders]=useState<any[]|null>(null);const[ledger,setLedger]=useState<any[]>([]);
  useEffect(()=>{Promise.all(WAIT.map(w=>api('/admin/orders/search?page_size=100&payment='+encodeURIComponent(w)).then(r=>r.rows))).then(a=>setOrders(a.flat().filter((o:any)=>!['Cancelled','Returned'].includes(o.order_status)))).catch(e=>toast.err(e.message));api('/admin/ledger').then(setLedger).catch(()=>{})},[]);
  const received=ledger.filter(l=>['payment_received','refund'].includes(l.type));
  return <Shell><PageHead title="Payments" sub="Verify bKash / Nagad / bank / PayStation payments and see every recorded collection."/>
    <Tabs value={tab} onChange={setTab} tabs={[{key:'verify',label:'Awaiting verification',count:orders?.length||0},{key:'received',label:'Received & refunds',count:received.length}]}/>
    <div className="card flush">{!orders?<Loading/>:tab==='verify'?(orders.length?<table className="tbl"><thead><tr><th>Order</th><th>Customer</th><th>Method</th><th>Amount due now</th><th>Status</th><th/></tr></thead><tbody>{orders.map(o=><tr key={o.order_id}><td><a className="lnk" href={`/orders?open=${o.order_id}`}>#{o.order_id}</a><br/><small className="muted">{dt(o.created_at)}</small></td><td>{o.customer_name}<br/><small className="muted">{o.phone}</small></td><td>{o.payment_method}</td><td><b>{tk(o.pricing?.is_bulk?o.pricing.advance_required:o.pricing?.grand_total)}</b></td><td><Status s={o.payment_status}/></td><td><a className="btn btn-sm btn-soft" href={`/orders?open=${o.order_id}`}>Verify</a></td></tr>)}</tbody></table>:<Empty text="No payments waiting for verification." icon="cash"/>)
      :(received.length?<table className="tbl"><thead><tr><th>Date</th><th>Order</th><th>Type</th><th>Channel</th><th>Note</th><th className="r">Amount</th></tr></thead><tbody>{received.map(l=><tr key={l._id}><td className="nowrap">{dt(l.created_at)}</td><td><a className="lnk" href={`/orders?open=${l.order_id}`}>#{l.order_id}</a></td><td>{l.type==='refund'?<Status s="Refunded"/>:<Status s="Paid"/>}</td><td>{l.payment_method}</td><td>{l.note}</td><td className="r"><b>{tk(l.amount)}</b></td></tr>)}</tbody></table>:<Empty text="No payments recorded yet." icon="cash"/>)}</div></Shell>;
}
