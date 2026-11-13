'use client';
import {useEffect,useState} from 'react';
import Shell from '@/components/Shell';
import Icon from '@/components/Icon';
import {PageHead,Empty,Loading,toast,Field,Status} from '@/components/ui';
import {api,postJSON,dt} from '@/lib/api';
export default function Marketing(){
  const[d,setD]=useState<any>(null);const[box,setBox]=useState<any[]>([]);const[seg,setSeg]=useState('no_order');const[msg,setMsg]=useState('');const[busy,setBusy]=useState(false);
  const load=()=>{api('/admin/marketing/segments').then(setD).catch(e=>toast.err(e.message));api('/admin/sms/outbox').then(setBox).catch(()=>{})};useEffect(()=>{load()},[]);
  const s=d?.segments?.find((x:any)=>x.key===seg);const parts=Math.ceil((msg.length+25)/(/[^\x00-\x7F]/.test(msg)?67:153))||1;
  async function send(){if(!confirm(`Queue this SMS for ${s?.count||0} recipients? SMS credits will be used when you dispatch.`))return;setBusy(true);try{const r=await postJSON('/admin/marketing/campaigns',{segment:seg,message:msg});toast.ok(`${r.queued} messages queued`);setMsg('');load()}catch(e:any){toast.err(e.message)}finally{setBusy(false)}}
  async function dispatch(){setBusy(true);try{const r=await postJSON('/admin/sms/dispatch',{});toast.ok(`Sent ${r.sent}, failed ${r.failed}`);load()}catch(e:any){toast.err(e.message)}finally{setBusy(false)}}
  return <Shell><PageHead title="Marketing" sub="SMS campaigns to customer segments via BulkSMSBD, plus the transactional SMS outbox."/>
    {!d?<Loading/>:<div className="two-col">
      <section className="card"><h2>New SMS campaign</h2><div className="seg-cards">{d.segments.map((x:any)=><button key={x.key} className={seg===x.key?'on':''} onClick={()=>setSeg(x.key)}><b>{x.count}</b><span>{x.label}</span></button>)}</div>
        <Field label="Message" hint={`${msg.length} chars · ~${parts} SMS part(s) per recipient · “Reply STOP to opt out.” is added automatically`}><textarea rows={4} maxLength={600} value={msg} onChange={e=>setMsg(e.target.value)} placeholder="EMXIN: New AIMB G2 Pro stock arrived! Order now at emxin.com.bd"/></Field>
        <button className="btn" disabled={busy||msg.length<5||!s?.count} onClick={send}><Icon name="send" size={17}/>Queue for {s?.count||0} recipients</button><p className="tiny muted">Super Admin only. Messages wait in the outbox until you press Dispatch.</p>
        <h3 className="mt">Recent campaigns</h3>{d.campaigns.length?<table className="tbl compact"><tbody>{d.campaigns.map((c:any)=><tr key={c._id}><td>{dt(c.created_at)}</td><td>{c.segment}</td><td>{c.recipients}</td><td className="ellipsis">{c.message}</td></tr>)}</tbody></table>:<p className="muted">No campaigns yet.</p>}</section>
      <section className="card"><div className="card-h"><h2>SMS outbox</h2><button className="btn btn-sm" disabled={busy} onClick={dispatch}><Icon name="send" size={15}/>Dispatch pending</button></div>
        {box.length?<table className="tbl compact"><thead><tr><th>Phone</th><th>Message</th><th>Status</th><th/></tr></thead><tbody>{box.map(m=><tr key={m._id}><td className="nowrap">{m.phone}<br/><small className="muted">{dt(m.created_at)}</small></td><td className="ellipsis">{m.message}</td><td><Status s={m.status}/>{m.error&&<br/>}{m.error&&<small className="err">{m.error}</small>}</td><td>{m.status==='failed'&&<button className="btn btn-sm btn-ghost" onClick={async()=>{await postJSON(`/admin/sms/${m.event_key}/retry`,{});load()}}>Retry</button>}</td></tr>)}</tbody></table>:<Empty text="Outbox is empty." icon="message"/>}</section></div>}
  </Shell>;
}
