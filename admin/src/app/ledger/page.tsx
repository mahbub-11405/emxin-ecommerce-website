'use client';
import {useEffect,useState} from 'react';
import Shell from '@/components/Shell';
import Icon from '@/components/Icon';
import {PageHead,Empty,Loading,toast} from '@/components/ui';
import {api,tk,dt,downloadCSV} from '@/lib/api';
export default function Ledger(){
  const[rows,setRows]=useState<any[]|null>(null);const[type,setType]=useState('');
  useEffect(()=>{api('/admin/ledger').then(setRows).catch(e=>toast.err(e.message))},[]);
  const list=(rows||[]).filter(r=>!type||r.type===type);const types=[...new Set((rows||[]).map(r=>r.type))];
  const sum=(t:string)=>(rows||[]).filter(r=>r.type===t).reduce((s,r)=>s+Number(r.amount||0),0);
  return <Shell><PageHead title="Ledger" sub="Every order, payment, refund and courier event — for reconciliation."><button className="btn btn-ghost" onClick={()=>downloadCSV('emxin-ledger.csv',list,[['Date',r=>dt(r.created_at)],['Order','order_id'],['Type','type'],['Amount','amount'],['Method','payment_method'],['Courier','courier'],['COD','cod_amount'],['Note','note']])}><Icon name="download" size={17}/>Export</button></PageHead>
    <div className="mini-kpis"><div><small>Booked (orders created)</small><b>{tk(sum('order_created'))}</b></div><div><small>Payments received</small><b>{tk(sum('payment_received'))}</b></div><div><small>Refunds</small><b>{tk(Math.abs(sum('refund')))}</b></div></div>
    <div className="filters"><select value={type} onChange={e=>setType(e.target.value)}><option value="">All entry types</option>{types.map(t=><option key={t}>{t}</option>)}</select></div>
    <div className="card flush">{!rows?<Loading/>:list.length?<table className="tbl"><thead><tr><th>Date</th><th>Order</th><th>Type</th><th>Method</th><th>Details</th><th className="r">Amount</th></tr></thead><tbody>{list.map(r=><tr key={r._id}><td className="nowrap">{dt(r.created_at)}</td><td><a className="lnk" href={`/orders?open=${r.order_id}`}>#{r.order_id}</a></td><td>{String(r.type).replaceAll('_',' ')}</td><td>{r.payment_method||'—'}</td><td><small className="muted">{r.courier?`${r.courier} · COD ${tk(r.cod_amount)}`:r.note||''}</small></td><td className="r"><b>{tk(r.amount)}</b></td></tr>)}</tbody></table>:<Empty text="No ledger entries yet." icon="ledger"/>}</div></Shell>;
}
