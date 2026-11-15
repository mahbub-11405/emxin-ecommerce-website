'use client';
import {useCallback,useEffect,useState} from 'react';
import Link from 'next/link';
import Shell from '@/components/Shell';
import Icon from '@/components/Icon';
import PayBadge from '@/components/PayBadge';
import {PageHead,Drawer,Empty,Loading,toast,Field} from '@/components/ui';
import {api,postJSON,tk,dt} from '@/lib/api';

const Pill=({s}:{s:any})=><span className={'st st-'+(s?.tone||'gray')}>{s?.label||'—'}</span>;

function Detail({id,onChanged}:{id:string;onChanged:()=>void}){
  const[d,setD]=useState<any>(null);const[busy,setBusy]=useState('');
  const[m,setM]=useState({phone:'',message:'',sms:true});
  const load=useCallback(()=>api(`/admin/courier/orders/${id}`).then(x=>{setD(x);setM(v=>({...v,phone:v.phone||x.rider_phone||x.rider_phones?.[0]||''}))}).catch(e=>toast.err(e.message)),[id]);
  useEffect(()=>{load()},[load]);
  async function run(label:string,fn:()=>Promise<any>){setBusy(label);try{const r=await fn();toast.ok(label+(r?.changed===false&&r?.reason?` — ${r.reason}`:''));await load();onChanged()}catch(e:any){toast.err(e.message)}finally{setBusy('')}}
  if(!d)return <Loading/>;
  const copy=(t:string)=>{navigator.clipboard?.writeText(t);toast.ok('Copied')};
  return <div>
    <div className="cr-head"><div><div className="cr-big">{d.status.label}</div><small className="muted">{d.courier_name} · updated {d.updated_at?dt(d.updated_at):'—'}</small></div>
      <div className="row-gap">{d.tracking_url&&<a className="btn btn-soft btn-sm" href={d.tracking_url} target="_blank" rel="noreferrer"><Icon name="track" size={15}/>Courier tracking page</a>}
        <button className="btn btn-sm" disabled={!!busy} onClick={()=>run('Status checked',()=>postJSON(`/admin/courier/orders/${id}/refresh`,{}))}><Icon name="refresh" size={15}/>Check status now</button></div></div>
    <div className="cr-idbox">
      <div><small>EMXIN order ID</small><b><Link className="lnk" href={`/orders?open=${d.order_id}`}>#{d.order_id}</Link></b></div>
      <div><small>{d.courier_name} consignment ID</small><b className="mono">{d.consignment_id||'—'}{d.consignment_id&&<button className="ib" title="Copy" onClick={()=>copy(d.consignment_id)}><Icon name="copy" size={13}/></button>}</b></div>
      <div><small>Tracking code</small><b className="mono">{d.tracking_code||'—'}{d.tracking_code&&<button className="ib" title="Copy" onClick={()=>copy(d.tracking_code)}><Icon name="copy" size={13}/></button>}</b></div>
      <div><small>Collect on delivery</small><b>{tk(d.cod_due)}</b>{d.delivery_charge!=null&&<small>Courier charge {tk(d.delivery_charge)}</small>}</div>
    </div>
    <p><b>{d.customer_name}</b> · <a className="lnk" href={`tel:${d.phone}`}>{d.phone}</a><br/><span className="muted">{d.address}, {d.district}</span></p>
    <p className="muted tiny">{d.items_list?.map((i:any)=>`${i.name} × ${i.quantity}`).join(' · ')} · <PayBadge o={d}/></p>

    <section className="cr-rider"><b><Icon name="truck" size={16}/> Delivery man</b>
      {d.rider_phones?.length?<div className="row">{d.rider_phones.map((p:string)=><span key={p} className="row"><b className="mono">{p}</b><a className="btn btn-sm btn-soft" href={`tel:${p}`}><Icon name="phone" size={14}/>Call</a><a className="btn btn-sm btn-ghost" href={`https://wa.me/88${p}`} target="_blank" rel="noreferrer">WhatsApp</a></span>)}</div>
        :<p className="tiny muted">The courier has not shared the rider yet. When Steadfast assigns a rider, the number usually appears in their tracking message and shows here.</p>}
      <div className="fgrid"><Field label="Rider mobile"><input value={m.phone} onChange={e=>setM({...m,phone:e.target.value})} placeholder="01XXXXXXXXX"/></Field>
        <Field label="Message" span><input value={m.message} onChange={e=>setM({...m,message:e.target.value})} placeholder="e.g. Customer asks to deliver after 5 pm. Call before coming."/></Field></div>
      <div className="row"><label className="row tiny"><input type="checkbox" checked={m.sms} onChange={e=>setM({...m,sms:e.target.checked})}/> Send as SMS to the rider (1 SMS credit)</label>
        <button className="btn btn-sm" disabled={!!busy||!m.message.trim()} onClick={()=>run(m.sms?'SMS queued to rider':'Note saved',()=>postJSON(`/admin/courier/orders/${id}/rider-message`,m).then(()=>setM({...m,message:''})))}><Icon name="send" size={14}/>{m.sms?'Send SMS':'Save note'}</button></div>
      {d.courier_notes?.length>0&&<ul className="cr-feed">{d.courier_notes.map((n:any,i:number)=><li key={i}><time>{dt(n.at)}{n.sms?` · SMS to ${n.phone}`:' · note'}</time><span>{n.text}</span></li>)}</ul>}
    </section>

    <h4>Courier history</h4>
    {d.events?.length?<ol className="cr-tl">{d.events.map((e:any,i:number)=><li key={i} className={'t-'+e.status_info.tone}><time>{dt(e.at)} · {e.source==='steadfast_webhook'?'Steadfast':e.source==='status_check'?'status check':e.source==='emxin'?'EMXIN':e.source}</time><p><b>{e.status_info.label}</b>{e.message&&<> — {e.message}</>}</p>{e.cod_amount!=null&&<small className="muted">COD {tk(e.cod_amount)}{e.delivery_charge!=null?` · charge ${tk(e.delivery_charge)}`:''}</small>}</li>)}</ol>
      :<p className="muted">No courier updates yet.</p>}
  </div>;
}

export default function Courier(){
  const[d,setD]=useState<any>(null);const[status,setStatus]=useState('active');const[q,setQ]=useState('');const[open,setOpen]=useState('');const[busy,setBusy]=useState(false);
  const load=useCallback(()=>{const s=new URLSearchParams();if(status)s.set('status',status);if(q.trim())s.set('q',q.trim());api('/admin/courier/overview?'+s).then(setD).catch(e=>toast.err(e.message))},[status,q]);
  useEffect(()=>{const t=setTimeout(load,q?300:0);return()=>clearTimeout(t)},[load,q]);
  useEffect(()=>{const o=new URLSearchParams(location.search).get('open');if(o)setOpen(o)},[]);
  async function sync(){setBusy(true);try{const r=await postJSON('/admin/courier/sync',{});toast.ok(`Checked ${r.checked} parcels · ${r.changed} changed`);load()}catch(e:any){toast.err(e.message)}finally{setBusy(false)}}
  const active=d?d.statuses.filter((s:any)=>!s.finished).reduce((n:number,s:any)=>n+s.count,0):0;
  const chips=d?[{key:'active',label:'On the way',count:active},{key:'',label:'All',count:Object.values(d.counts).reduce((a:any,b:any)=>a+b,0)},...d.statuses.filter((s:any)=>s.count>0||['delivered','cancelled','hold'].includes(s.key)).map((s:any)=>({key:s.key,label:s.label,count:s.count}))]:[];
  return <Shell>
    <PageHead title="Courier" sub="Every parcel after you confirm an order: our order ID and the courier's ID side by side, live status, rider and full history until delivery."><button className="btn btn-ghost" disabled={busy} onClick={sync}><Icon name="refresh" size={17}/>{busy?'Checking…':'Check all now'}</button></PageHead>
    {d&&!d.setup.steadfast_enabled&&<div className="cr-setup"><b>Steadfast is not connected yet.</b> In the backend <code>.env</code> set <code>STEADFAST_ENABLED=true</code>, <code>STEADFAST_API_KEY</code>, <code>STEADFAST_SECRET_KEY</code> (Steadfast portal → API) and a long random <code>STEADFAST_WEBHOOK_SECRET</code>. Then in the Steadfast portal → Webhook, set the callback URL to <code>{d.setup.webhook_url}</code> with that secret as the Bearer token. After that, confirmed orders go to Steadfast automatically and every status update lands here.</div>}
    {d&&d.setup.steadfast_enabled&&!d.setup.webhook_token_set&&<div className="cr-setup">Live updates are off: set <code>STEADFAST_WEBHOOK_SECRET</code> and add the webhook <code>{d.setup.webhook_url}</code> in the Steadfast portal. Until then statuses are checked every 30 minutes.</div>}
    {d?.ready_to_send>0&&<div className="cr-setup"><b>{d.ready_to_send}</b> confirmed order(s) are not with a courier yet{d.setup.steadfast_enabled?' — Steadfast did not accept them (see the order timeline for the reason). Fix the address/phone and press “Send to Steadfast” in the order.':' — they were confirmed before Steadfast was connected. After connecting, open each one and press “Send to Steadfast”.'} <Link className="lnk" href="/orders?status=Confirmed">Open confirmed orders</Link></div>}
    <div className="cr-chips">{chips.map((c:any)=><button key={c.key||'all'} className={'cr-chip'+(status===c.key?' on':'')} onClick={()=>setStatus(c.key)}>{c.label}<em>{c.count}</em></button>)}</div>
    <div className="cr-grid">
      <div className="card flush"><div className="filters" style={{padding:'12px 12px 0'}}><div className="search-in"><Icon name="search" size={17}/><input placeholder="Order ID, consignment ID, tracking code, customer, phone" value={q} onChange={e=>setQ(e.target.value)}/></div></div>
        {!d?<Loading/>:d.rows.length?<div className="tbl-wrap"><table className="tbl"><thead><tr><th>Order / Courier ID</th><th>Customer</th><th>Status</th><th>Collect</th><th>Payment</th><th>Updated</th><th/></tr></thead><tbody>{d.rows.map((r:any)=><tr key={r.order_id} className="click" onClick={()=>setOpen(r.order_id)}>
          <td><div className="cr-ids"><b className="lnk">#{r.order_id}</b><small>{r.courier_name} <span className="mono">{r.consignment_id||'—'}</span></small>{r.tracking_code&&<small className="mono">{r.tracking_code}</small>}</div></td>
          <td>{r.customer_name}<br/><small className="muted">{r.phone} · {r.district}</small></td>
          <td><Pill s={r.status}/>{r.last_message&&<><br/><small className="muted">{r.last_message.slice(0,70)}</small></>}</td>
          <td><b>{tk(r.cod_due)}</b></td><td><PayBadge o={r}/></td><td className="nowrap"><small>{r.updated_at?dt(r.updated_at):'—'}</small></td><td><Icon name="chevronRight" size={18}/></td></tr>)}</tbody></table></div>
          :<Empty text={status==='active'?'No parcels on the way.':'No parcels here.'} icon="orders"/>}</div>
      <section className="card"><div className="card-h"><h2>Courier activity</h2></div>
        {d?.feed?.length?<ul className="cr-feed">{d.feed.map((f:any,i:number)=><li key={i}><time>{dt(f.at)} · {f.courier}</time><span><button className="lnk" style={{background:'none',border:0,padding:0}} onClick={()=>setOpen(f.order_id)}>#{f.order_id}</button> <Pill s={f.status}/></span>{f.message&&<small className="muted">{f.message}</small>}</li>)}</ul>:<p className="muted">No courier activity yet.</p>}
        {d?.last_sync?.at&&<p className="tiny muted">Last status check: {dt(d.last_sync.at)}</p>}</section>
    </div>
    <Drawer open={!!open} title={<>Parcel · #{open}</>} onClose={()=>{setOpen('');history.replaceState(null,'','/courier')}} width={620}>{open&&<Detail id={open} onChanged={load}/>}</Drawer>
  </Shell>;
}
