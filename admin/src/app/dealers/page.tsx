'use client';
import {useEffect,useState} from 'react';
import Shell from '@/components/Shell';
import Icon from '@/components/Icon';
import {PageHead,Drawer,Empty,Loading,toast,Field,Status,Tabs,Toggle} from '@/components/ui';
import {api,put,postJSON,tk,dt} from '@/lib/api';
export default function Dealers(){
  const[rows,setRows]=useState<any[]|null>(null);const[leads,setLeads]=useState<any[]>([]);const[tab,setTab]=useState('Pending');const[sel,setSel]=useState<any>(null);const[ov,setOv]=useState<string>('');
  const load=()=>{api('/admin/dealers').then(setRows).catch(e=>toast.err(e.message));api('/admin/dealer-leads').then(setLeads).catch(()=>{})};useEffect(()=>{load()},[]);
  const cnt=(s:string)=>(rows||[]).filter(d=>d.status===s).length;
  async function status(d:any,s:string){const note=s==='Rejected'?prompt('Reason (internal note):')||'':'';try{if(s==='Active')await postJSON(`/admin/dealers/${d._id}/approve`,{});else await put(`/admin/dealers/${d._id}/status`,{status:s,note});toast.ok(`Dealer ${s.toLowerCase()} — SMS queued`);setSel(null);load()}catch(e:any){toast.err(e.message)}}
  const list=tab==='Leads'?[]:(rows||[]).filter(d=>tab==='All'||d.status===tab);
  return <Shell><PageHead title="Dealers" sub="Approve dealer applications, set discount tiers and review leads from checkout & quantity requests."/>
    <Tabs value={tab} onChange={setTab} tabs={[{key:'Pending',label:'Pending',count:cnt('Pending')},{key:'Active',label:'Active',count:cnt('Active')},{key:'Rejected',label:'Rejected',count:cnt('Rejected')},{key:'Suspended',label:'Suspended',count:cnt('Suspended')},{key:'All',label:'All',count:rows?.length||0},{key:'Leads',label:'Dealer leads',count:leads.length}]}/>
    <div className="card flush">{!rows?<Loading/>:tab==='Leads'?(leads.length?<table className="tbl"><thead><tr><th>Shop</th><th>Contact</th><th>Source</th><th>Updated</th></tr></thead><tbody>{leads.map(l=><tr key={l._id}><td><b>{l.shop_name}</b><br/><small className="muted">{l.name}</small></td><td>{l.phone}<br/><small className="muted">{l.email}</small></td><td>{l.source}</td><td>{dt(l.updated_at)}</td></tr>)}</tbody></table>:<Empty text="No dealer leads yet."/>):list.length?<table className="tbl"><thead><tr><th>Business</th><th>Contact</th><th>Type</th><th>Orders</th><th>Discount</th><th>Applied</th><th>Status</th><th className="r"/></tr></thead><tbody>{list.map(d=><tr key={d._id}>
      <td><b>{d.shop_name}</b><br/><small className="muted">{d.name}</small></td><td>{d.phone}<br/><small className="muted">{d.email}</small></td><td>{d.business_type}</td><td>{d.total_orders||0}<br/><small className="muted">{tk(d.total_purchase)}</small></td>
      <td>{d.discount_approved?(d.discount_override_percent!=null?`${d.discount_override_percent}% (fixed)`:'Tiered 5–15%'):<span className="muted">Not approved</span>}</td><td className="nowrap">{dt(d.created_at)}</td><td><Status s={d.status}/></td>
      <td className="r nowrap">{d.status==='Pending'&&<><button className="btn btn-sm" onClick={()=>status(d,'Active')}>Approve</button> <button className="btn btn-sm btn-ghost danger" onClick={()=>status(d,'Rejected')}>Reject</button> </>}<button className="btn btn-sm btn-soft" onClick={()=>{setSel(d);setOv(d.discount_override_percent!=null?String(d.discount_override_percent):'')}}>Manage</button></td></tr>)}</tbody></table>:<Empty text="No dealers here." icon="dealers"/>}</div>
    <Drawer open={!!sel} title={sel?.shop_name||''} onClose={()=>setSel(null)}>{sel&&<div className="stack">
      <p><b>{sel.name}</b> · {sel.business_type}<br/><a className="lnk" href={`tel:${sel.phone}`}>{sel.phone}</a>{sel.email&&<> · {sel.email}</>}<br/><span className="muted">{sel.address}</span></p>
      <p>Status: <Status s={sel.status}/>{sel.status_note&&<small className="muted"> — {sel.status_note}</small>}</p>
      <h4>Discount</h4><p className="tiny muted">Default tiers by completed bulk order: 1st 5% · 2nd 8% · 3rd 12% · 4th+ 15%. Set a fixed % to override.</p>
      <Toggle checked={!!sel.discount_approved} onChange={async v=>{try{await put(`/admin/dealers/${sel._id}/discount`,{approved:v,override_percent:ov===''?null:Number(ov)});setSel({...sel,discount_approved:v});load()}catch(e:any){toast.err(e.message)}}} label="Dealer discount approved"/>
      <Field label="Fixed discount override (%)" hint="Leave empty to use tiers"><div className="row"><input type="number" min="0" max="100" value={ov} onChange={e=>setOv(e.target.value)}/><button className="btn btn-sm" onClick={async()=>{try{await put(`/admin/dealers/${sel._id}/discount`,{approved:!!sel.discount_approved,override_percent:ov===''?null:Number(ov)});toast.ok('Discount saved');load()}catch(e:any){toast.err(e.message)}}}>Save</button></div></Field>
      <h4>Change status</h4><div className="row">{['Active','Suspended','Rejected','Pending'].filter(s=>s!==sel.status).map(s=><button key={s} className={'btn btn-sm '+(s==='Active'?'':'btn-ghost')} onClick={()=>status(sel,s)}>{s==='Active'?'Approve / Activate':s}</button>)}</div></div>}</Drawer></Shell>;
}
