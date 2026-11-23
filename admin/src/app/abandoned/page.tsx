'use client';
import {useEffect,useState} from 'react';
import Shell from '@/components/Shell';
import Icon from '@/components/Icon';
import {PageHead,Empty,Loading,toast,Tabs} from '@/components/ui';
import {api,put,tk,dt} from '@/lib/api';

/** People who typed their mobile number at checkout but did not place the order (after 30 minutes). Call them to help. */
const TABS=[{key:'active',label:'To call'},{key:'contacted',label:'Contacted'},{key:'converted',label:'Ordered later'},{key:'lost',label:'Not interested'},{key:'open',label:'Still on checkout'}];
const local=(p:string)=>String(p||'').replace(/^\+?88/,'');
export default function Abandoned(){
  const[tab,setTab]=useState('active');const[d,setD]=useState<any>(null);
  const load=()=>api('/admin/abandoned?status='+tab).then(setD).catch(e=>toast.err(e.message));useEffect(()=>{setD(null);load()},[tab]);
  async function mark(r:any,status:string){const note=status==='contacted'?prompt('Note (optional): what did they say?',r.note||''):r.note;if(note===null)return;
    try{await put(`/admin/abandoned/${r._id}`,{status,note});toast.ok(status==='contacted'?'Marked as contacted':status==='lost'?'Marked not interested':'Moved back');load()}catch(e:any){toast.err(e.message)}}
  const w=d?.week||{};const left=(w.abandoned||0)+(w.contacted||0)+(w.lost||0);
  return <Shell><PageHead title="Abandoned checkouts" sub={`People who typed their mobile number at checkout but did not order within ${d?.wait_minutes||30} minutes. A quick call often saves the order.`}/>
    {d&&<div className="ab-kpis"><div><b>{left+(w.converted||0)}</b><small>reached checkout with a number (7 days)</small></div><div><b>{w.converted||0}</b><small>ordered</small></div><div><b>{left}</b><small>left without ordering</small></div><div><b>{w.contacted||0}</b><small>you contacted</small></div></div>}
    <Tabs value={tab} onChange={setTab} tabs={TABS}/>
    <div className="ab-list">{!d?<Loading/>:!d.rows.length?<Empty text={tab==='active'?'Nobody to call right now.':'Nothing here.'} icon="cart"/>:d.rows.map((r:any)=>{const ph=local(r.phone);
      return <article key={r._id} className="card ab-card">
        <div className="ab-top"><div><b>{r.name||'No name'}</b><small className="muted">{r.district||'—'} · {dt(r.abandoned_at||r.updated_at)}{r.visits>1?` · came back ${r.visits}×`:''}</small></div><b className="ab-total">{tk(r.total)}</b></div>
        <ul className="ab-items">{(r.items||[]).map((i:any,k:number)=><li key={k}><span>{i.name}{i.frame_color?` (${i.frame_color})`:''}</span><span>{i.quantity} × {tk(i.unit_price)}</span></li>)}</ul>
        {r.note&&<p className="tiny ab-note">📝 {r.note}</p>}
        {r.status==='converted'&&r.order_id&&<p className="tiny good">✓ Ordered: <a href={`/orders?open=${r.order_id}`}>{r.order_id}</a></p>}
        <div className="ab-act"><a className="btn btn-sm" href={`tel:${ph}`}><Icon name="phone" size={15}/>Call {ph}</a>
          <a className="btn btn-sm btn-soft" href={`https://wa.me/88${ph}?text=${encodeURIComponent(`Assalamu alaikum${r.name?' '+r.name.split(' ')[0]:''}, EMXIN Technologies theke bolchi. Apni ${(r.items||[]).map((i:any)=>i.name).join(', ')} order korte chachchilen, kono help lagbe?`)}`} target="_blank" rel="noopener">WhatsApp</a>
          {r.status!=='converted'&&<>{r.status!=='contacted'&&<button className="btn btn-sm btn-ghost" onClick={()=>mark(r,'contacted')}><Icon name="check" size={15}/>Contacted</button>}
            {r.status!=='lost'&&<button className="btn btn-sm btn-ghost" onClick={()=>mark(r,'lost')}>Not interested</button>}
            {(r.status==='lost'||r.status==='contacted')&&<button className="btn btn-sm btn-ghost" onClick={()=>mark(r,'abandoned')}>Back to “To call”</button>}</>}</div>
      </article>})}</div>
  </Shell>;
}
