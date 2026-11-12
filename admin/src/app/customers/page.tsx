'use client';
import {useEffect,useMemo,useState} from 'react';
import Shell from '@/components/Shell';
import Icon from '@/components/Icon';
import {PageHead,Drawer,Empty,Loading,toast,Field,Status,Tabs} from '@/components/ui';
import {api,put,tk,dt,downloadCSV} from '@/lib/api';
const LEADS=['New Lead','Contacted','Interested','Follow-up','Converted','Not Interested'];
export default function Customers(){
  const[rows,setRows]=useState<any[]|null>(null);const[tab,setTab]=useState('all');const[q,setQ]=useState('');const[sel,setSel]=useState<any>(null);const[note,setNote]=useState('');
  const load=()=>api('/admin/customers'+(tab==='no_order'?'?no_order=true':tab==='hot'?'?priority=Hot':'')).then(setRows).catch(e=>toast.err(e.message));
  useEffect(()=>{load()},[tab]);useEffect(()=>{const s=new URLSearchParams(location.search).get('q');if(s)setQ(s)},[]);
  const list=useMemo(()=>(rows||[]).filter(c=>!q||`${c.name} ${c.phone} ${c.email} ${c.shop_name}`.toLowerCase().includes(q.toLowerCase())),[rows,q]);
  async function save(patch:any){try{await put(`/admin/customers/${sel._id}/crm`,patch);toast.ok('Saved');setSel({...sel,...patch});load()}catch(e:any){toast.err(e.message)}}
  return <Shell><PageHead title="Customers & CRM" sub="Registered customers, lead status, follow-ups and on-site activity."><button className="btn btn-ghost" onClick={()=>downloadCSV('emxin-customers.csv',list,[['Name','name'],['Phone','phone'],['Email','email'],['Shop','shop_name'],['Lead','lead_status'],['Priority','lead_priority'],['Orders','total_orders'],['Total purchase','total_purchase'],['Joined',r=>dt(r.created_at)],['Last active',r=>dt(r.last_active_at)]])}><Icon name="download" size={17}/>Export</button></PageHead>
    <Tabs value={tab} onChange={setTab} tabs={[{key:'all',label:'All customers'},{key:'hot',label:'Hot leads'},{key:'no_order',label:'Registered, no order'}]}/>
    <div className="filters"><div className="search-in"><Icon name="search" size={17}/><input placeholder="Name, phone, email, shop" value={q} onChange={e=>setQ(e.target.value)}/></div></div>
    <div className="card flush">{!rows?<Loading/>:list.length?<div className="tbl-wrap"><table className="tbl"><thead><tr><th>Customer</th><th>Contact</th><th>Lead</th><th>Orders</th><th>Total purchase</th><th>Next follow-up</th><th>Last active</th></tr></thead><tbody>{list.map(c=><tr key={c._id} className="click" onClick={()=>{setSel(c);setNote('')}}>
      <td><b>{c.name}</b><br/><small className="muted">{c.shop_name||'Retail customer'}</small></td><td>{c.phone}<br/><small className="muted">{c.email}</small></td><td><Status s={c.lead_priority||'Cold'}/> <small>{c.lead_status||'New Lead'}</small></td><td>{c.total_orders||0}</td><td>{tk(c.total_purchase)}</td><td>{c.next_followup_at?String(c.next_followup_at).slice(0,10):'—'}</td><td className="nowrap">{dt(c.last_active_at)}</td></tr>)}</tbody></table></div>:<Empty text="No customers in this view." icon="customers"/>}</div>
    <Drawer open={!!sel} title={sel?.name||''} onClose={()=>setSel(null)}>{sel&&<div className="stack">
      <p><a className="lnk" href={`tel:${sel.phone}`}><Icon name="phone" size={15}/> {sel.phone}</a>{sel.email&&<> · {sel.email}</>}<br/><small className="muted">Joined {dt(sel.created_at)} · {sel.location||''}</small></p>
      <div className="fgrid"><Field label="Lead status"><select value={sel.lead_status||'New Lead'} onChange={e=>save({lead_status:e.target.value})}>{LEADS.map(l=><option key={l}>{l}</option>)}</select></Field>
      <Field label="Priority"><select value={sel.lead_priority||'Cold'} onChange={e=>save({lead_priority:e.target.value})}>{['Hot','Warm','Cold'].map(l=><option key={l}>{l}</option>)}</select></Field>
      <Field label="Assigned to"><input defaultValue={sel.assigned_sales_person||''} onBlur={e=>e.target.value!==(sel.assigned_sales_person||'')&&save({assigned_sales_person:e.target.value})}/></Field>
      <Field label="Next follow-up"><input type="date" defaultValue={sel.next_followup_at?String(sel.next_followup_at).slice(0,10):''} onChange={e=>save({next_followup_at:e.target.value||null})}/></Field></div>
      <Field label="Add sales note"><div className="row"><input value={note} onChange={e=>setNote(e.target.value)} placeholder="Called, interested in 30 pcs next week"/><button className="btn btn-sm" disabled={!note.trim()} onClick={()=>{save({sales_notes:[...(sel.sales_notes||[]),{text:note.trim(),at:new Date().toISOString()}]});setNote('')}}>Add</button></div></Field>
      {(sel.sales_notes||[]).length>0&&<ul className="notes-list">{[...sel.sales_notes].reverse().map((n:any,i:number)=><li key={i}><p>{n.text||String(n)}</p>{n.at&&<small className="muted">{dt(n.at)}</small>}</li>)}</ul>}
      <h4>Recent activity</h4>{(sel.recent_activity||[]).length?<ul className="act">{sel.recent_activity.map((a:any)=><li key={a._id}><b>{a.event_type.replaceAll('_',' ')}</b>{a.product_name&&<> · {a.product_name}</>}<small className="muted">{dt(a.created_at)}</small></li>)}</ul>:<p className="muted">No tracked activity yet.</p>}
      <a className="btn btn-soft" href={`/orders?q=${encodeURIComponent(sel.phone)}`}>View orders</a></div>}</Drawer></Shell>;
}
