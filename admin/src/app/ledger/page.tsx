'use client';
import {useEffect,useMemo,useState} from 'react';
import Shell from '@/components/Shell';
import Icon from '@/components/Icon';
import PayBadge from '@/components/PayBadge';
import {PageHead,Empty,Loading,toast} from '@/components/ui';
import {api,tk,dt,tm,downloadCSV} from '@/lib/api';

/** Money ledger in plain words: what happened, how it was paid, and whether money actually came in. */
const TYPES:Record<string,{label:string;tone:string;icon:string;help:string}>={
  order_created:{label:'Order placed',tone:'blue',icon:'orders',help:'Order value when the customer ordered. Not money yet.'},
  payment_received:{label:'Money received',tone:'green',icon:'cash',help:'Money that really came in: bKash/Nagad verified by you, or cash the courier collected.'},
  refund:{label:'Refund',tone:'red',icon:'returnArrow',help:'Money paid back to a customer.'},
  courier_created:{label:'Sent to courier',tone:'gray',icon:'truck',help:'Parcel booked with the courier and how much cash they will collect.'},
};
const CH:Record<string,string>={bkash:'bKash',nagad:'Nagad',cod:'Cash on Delivery',bank:'Bank',rocket:'Rocket',card:'Card',paystation:'Online',manual:'bKash / Nagad'};
const chanOf=(r:any)=>r.channel||(r.payment_method==='manual'?(r.order?.payment_channel||'bkash'):r.payment_method)||'';
function what(r:any){
  const c=CH[chanOf(r)]||chanOf(r)||'—';const o=r.order;
  if(r.type==='order_created')return `${o?.dealer_id?'Dealer':'Customer'} ordered · will pay by ${c}`+(o&&['Cancelled','Returned'].includes(o.order_status)?` · later ${o.order_status}`:'');
  if(r.type==='payment_received'){
    if(r.source==='courier_delivered')return `Courier delivered and collected the cash${r.courier?` (${r.courier})`:''}`;
    if(r.payment_method==='cod')return 'Cash on delivery marked as collected';
    return `${c} payment verified${o?.trx_id?` · TrxID ${o.trx_id}`:''}`;
  }
  if(r.type==='refund')return 'Money returned to the customer';
  if(r.type==='courier_created')return `Parcel booked with ${String(r.courier||'courier').replace(/^./,(x:string)=>x.toUpperCase())}`+(r.cod_amount!=null?` · courier collects ${tk(r.cod_amount)}`:'');
  return String(r.type||'').replaceAll('_',' ');
}
const dayKey=(s:any)=>new Date(s).toDateString();
function dayLabel(s:any){const d=new Date(s);const t=new Date();const y=new Date();y.setDate(t.getDate()-1);
  const base=d.toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short',year:'numeric'});
  return d.toDateString()===t.toDateString()?`Today · ${base}`:d.toDateString()===y.toDateString()?`Yesterday · ${base}`:base}

export default function Ledger(){
  const[d,setD]=useState<any>(null);const[type,setType]=useState('');const[q,setQ]=useState('');const[start,setStart]=useState('');const[end,setEnd]=useState('');
  useEffect(()=>{const s=new URLSearchParams({limit:'500'});if(type)s.set('type',type);if(q.trim())s.set('q',q.trim());if(start)s.set('start',start);if(end)s.set('end',end);
    const t=setTimeout(()=>api('/admin/ledger?'+s).then(setD).catch(e=>toast.err(e.message)),q?300:0);return()=>clearTimeout(t)},[type,q,start,end]);
  const rows:any[]=d?.rows||[];const T=d?.totals||{};
  const amt=(k:string)=>Number(T[k]?.amount||0);const cnt=(k:string)=>Number(T[k]?.count||0);
  const groups=useMemo(()=>{const g:{key:string;at:any;rows:any[];inn:number}[]=[];for(const r of rows){const k=dayKey(r.created_at);let x=g[g.length-1];if(!x||x.key!==k){x={key:k,at:r.created_at,rows:[],inn:0};g.push(x)}x.rows.push(r);if(r.type==='payment_received')x.inn+=Number(r.amount||0);if(r.type==='refund')x.inn+=Number(r.amount||0)}return g},[rows]);
  const filtered=!!(type||q||start||end);
  return <Shell><PageHead title="Ledger" sub="Every order and every taka in plain words: what happened, how it was paid, and whether the money actually came in.">
      <button className="btn btn-ghost" onClick={()=>downloadCSV('emxin-ledger.csv',rows,[['Date',r=>dt(r.created_at)],['Order','order_id'],['Customer',r=>r.order?.customer_name||''],['Phone',r=>r.order?.phone||''],['Entry',r=>TYPES[r.type]?.label||r.type],['What happened',what],['Payment',r=>CH[chanOf(r)]||chanOf(r)],['Amount','amount'],['Note','note']])}><Icon name="download" size={17}/>Export</button></PageHead>
    <div className="lg-kpis">
      <div className="t-blue"><small><Icon name="orders" size={15}/>Orders placed</small><b>{tk(amt('order_created'))}</b><span>{cnt('order_created')} orders · value booked, not money yet</span></div>
      <div className="t-green"><small><Icon name="cash" size={15}/>Money received</small><b>{tk(amt('payment_received'))}</b><span>{cnt('payment_received')} payments · bKash/Nagad verified + COD collected</span></div>
      <div className="t-red"><small><Icon name="returnArrow" size={15}/>Refunds</small><b>{tk(Math.abs(amt('refund')))}</b><span>{cnt('refund')} refunds</span></div>
      <div className="t-ink"><small><Icon name="taka" size={15}/>Net in hand</small><b>{tk(amt('payment_received')+amt('refund'))}</b><span>money received − refunds</span></div>
    </div>
    <div className="filters">
      <div className="search-in"><Icon name="search" size={17}/><input placeholder="Order ID, customer name or phone" value={q} onChange={e=>setQ(e.target.value)}/></div>
      <select value={type} onChange={e=>setType(e.target.value)}><option value="">All entries</option>{Object.entries(TYPES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select>
      <label className="lg-date"><small>From</small><input type="date" value={start} onChange={e=>setStart(e.target.value)}/></label>
      <label className="lg-date"><small>To</small><input type="date" value={end} onChange={e=>setEnd(e.target.value)}/></label>
      {filtered&&<button className="btn btn-sm btn-ghost" onClick={()=>{setType('');setQ('');setStart('');setEnd('')}}><Icon name="close" size={14}/>Clear filters</button>}
    </div>
    <div className="lg-legend">{Object.entries(TYPES).map(([k,v])=><span key={k}><i className={'lg-tag t-'+v.tone}><Icon name={v.icon} size={13}/>{v.label}</i>{v.help}</span>)}</div>
    <div className="card flush">{!d?<Loading/>:rows.length?<div className="tbl-wrap"><table className="tbl lg">
      <thead><tr><th>Time</th><th>Order & customer</th><th>What happened</th><th>Payment</th><th className="r">Amount</th></tr></thead>
      {groups.map(g=><tbody key={g.key}>
        <tr className="lg-day"><td colSpan={4}>{dayLabel(g.at)}</td><td className="r">{g.inn?<span className="lg-in">Received {tk(g.inn)}</span>:<span className="muted">No money in</span>}</td></tr>
        {g.rows.map(r=>{const t=TYPES[r.type]||{label:r.type,tone:'gray',icon:'ledger'};const a=Number(r.amount||0);const ch=chanOf(r);
          return <tr key={r._id}>
            <td className="nowrap"><b>{tm(r.created_at)}</b></td>
            <td>{r.order_id?<a className="lnk mono" href={`/orders?open=${r.order_id}`}>#{r.order_id}</a>:'—'}{r.order&&<><br/><small className="muted">{r.order.customer_name}{r.order.phone?` · ${r.order.phone}`:''}</small></>}</td>
            <td><i className={'lg-tag t-'+t.tone}><Icon name={t.icon} size={13}/>{t.label}</i><br/><small>{what(r)}</small>{r.note&&<><br/><small className="muted">Note: {r.note}</small></>}</td>
            <td>{ch?<PayBadge k={ch==='manual'?'bkash':ch}/>:'—'}</td>
            <td className="r nowrap">{r.type==='payment_received'?<b className="lg-plus">+ {tk(a)}</b>:r.type==='refund'?<b className="lg-minus">− {tk(Math.abs(a))}</b>:r.type==='courier_created'?<span className="muted">{r.cod_amount!=null?`COD ${tk(r.cod_amount)}`:'—'}</span>:<span className="lg-booked">{tk(a)}</span>}</td>
          </tr>})}
      </tbody>)}
    </table></div>:<Empty text={filtered?'Nothing matches these filters.':'No ledger entries yet.'} icon="ledger"/>}</div>
    {rows.length>=500&&<p className="tiny muted">Showing the latest 500 entries. Use the dates or search to see older ones; the totals above always cover the whole filter.</p>}
  </Shell>;
}
