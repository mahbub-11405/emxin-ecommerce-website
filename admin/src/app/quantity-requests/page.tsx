'use client';
import {useEffect,useState} from 'react';
import Shell from '@/components/Shell';
import Icon from '@/components/Icon';
import {PageHead,Drawer,Empty,Loading,toast,Field,Status,Tabs} from '@/components/ui';
import {api,put,dt} from '@/lib/api';
const ST=['New','Contacted','Quoted','Converted','Closed'];
export default function QR(){
  const[rows,setRows]=useState<any[]|null>(null);const[tab,setTab]=useState('New');const[sel,setSel]=useState<any>(null);const[note,setNote]=useState('');
  const load=()=>api('/admin/quantity-requests').then(setRows).catch(e=>toast.err(e.message));useEffect(()=>{load()},[]);
  async function upd(patch:any){try{await put(`/admin/quantity-requests/${sel._id}`,patch);toast.ok('Updated');setSel({...sel,...patch,notes:patch.note?[...(sel.notes||[]),{text:patch.note,at:new Date().toISOString()}]:sel.notes});setNote('');load()}catch(e:any){toast.err(e.message)}}
  const list=(rows||[]).filter(r=>tab==='All'||(r.status||'New')===tab);
  return <Shell><PageHead title="Quantity Requests" sub="Bulk & restock requests from the product page drawer. Urgent first."/>
    <Tabs value={tab} onChange={setTab} tabs={[...ST.map(s=>({key:s,label:s,count:(rows||[]).filter(r=>(r.status||'New')===s).length})),{key:'All',label:'All',count:rows?.length||0}]}/>
    <div className="card flush">{!rows?<Loading/>:list.length?<table className="tbl"><thead><tr><th>Need</th><th>Product</th><th>Shop / contact</th><th>Quantity</th><th>Dealer</th><th>Received</th><th>Status</th></tr></thead><tbody>{list.map(r=><tr key={r._id} className="click" onClick={()=>setSel(r)}>
      <td><Status s={r.urgency}/></td><td>{r.product_name}</td><td><b>{r.shop_name}</b><br/><small className="muted">{r.name} · {r.phone}</small></td><td><b>{r.total_quantity||Object.values(r.color_quantities||{}).reduce((a:any,b:any)=>a+b,0)} pcs</b><br/><small className="muted">{Object.entries(r.color_quantities||{}).filter(([,q]:any)=>q>0).map(([c,q])=>`${c}: ${q}`).join(', ')}</small></td><td>{r.dealer_opt_in?<span className="st st-purple">Wants dealer</span>:'—'}</td><td className="nowrap">{dt(r.created_at)}</td><td><Status s={r.status||'New'}/></td></tr>)}</tbody></table>:<Empty text="No requests in this view." icon="cube"/>}</div>
    <Drawer open={!!sel} title={sel?.shop_name||''} onClose={()=>setSel(null)}>{sel&&<div className="stack">
      <p><Status s={sel.urgency}/> <b>{sel.product_name}</b> — {sel.total_quantity} pcs</p><p>{sel.name} · <a className="lnk" href={`tel:${sel.phone}`}>{sel.phone}</a>{sel.email&&<> · {sel.email}</>}</p>{sel.message&&<blockquote className="quote">{sel.message}</blockquote>}
      <Field label="Status"><select value={sel.status||'New'} onChange={e=>upd({status:e.target.value})}>{ST.map(s=><option key={s}>{s}</option>)}</select></Field>
      <Field label="Assigned to"><input defaultValue={sel.assigned_to||''} onBlur={e=>e.target.value!==(sel.assigned_to||'')&&upd({assigned_to:e.target.value})}/></Field>
      <Field label="Add note"><div className="row"><input value={note} onChange={e=>setNote(e.target.value)} placeholder="Quoted ৳5,224/pc, waiting for confirmation"/><button className="btn btn-sm" disabled={!note.trim()} onClick={()=>upd({note})}>Add</button></div></Field>
      {(sel.notes||[]).length>0&&<ul className="notes-list">{[...sel.notes].reverse().map((n:any,i:number)=><li key={i}><p>{n.text}</p><small className="muted">{dt(n.at)}</small></li>)}</ul>}
      <a className="btn btn-soft" href={`tel:${sel.phone}`}><Icon name="phone" size={16}/>Call now</a></div>}</Drawer></Shell>;
}
