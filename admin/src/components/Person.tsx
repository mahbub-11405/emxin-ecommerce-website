'use client';
import Link from 'next/link';
import {useCallback,useEffect,useState} from 'react';
import Icon from './Icon';
import {Drawer,Loading,Field,Status,toast} from './ui';
import {api,put,postJSON,tk,dt,dateOnly} from '@/lib/api';

/** Who someone is to EMXIN, used everywhere the same way. */
export const ROLE:Record<string,{label:string;cls:string}>={
  retail:{label:'Retail customer',cls:'rl-retail'},dealer:{label:'Dealer',cls:'rl-dealer'},
  applicant:{label:'Dealer applicant',cls:'rl-applicant'},suspended:{label:'Suspended dealer',cls:'rl-suspended'},
};
export function RolePill({role,dealer,rejected,small}:{role:string;dealer?:any;rejected?:boolean;small?:boolean}){
  const r=ROLE[role]||ROLE.retail;
  return <span className={'rl '+r.cls+(small?' sm':'')}><i/>{r.label}{role==='dealer'&&dealer?.code?<em className="mono">{dealer.code}</em>:null}{role==='applicant'?<em>Pending</em>:null}{rejected&&role==='retail'?<em className="rl-note">dealer application rejected</em>:null}</span>;
}
export function TierBar({t}:{t:any}){
  if(!t)return null;
  return <div className="tier"><div className="tier-steps">{t.tiers.map((p:number,i:number)=><span key={i} className={i<t.step?'done':i===t.step?'on':''}><b>{p}%</b><small>{i===t.tiers.length-1?`${i+1}th+`:['1st','2nd','3rd'][i]||`${i+1}th`}</small></span>)}</div>
    <small className="muted">{t.fixed?`Fixed ${t.current}% (set by EMXIN)`:`${t.completed} completed dealer order${t.completed===1?'':'s'} · now ${t.current}%`}{t.next!=null&&!t.fixed?` · next order gets ${t.next}%`:''}</small></div>;
}
const LEADS=['New Lead','Contacted','Interested','Follow-up','Converted','Not Interested'];
const JICON:Record<string,string>={join:'user',order:'orders',apply:'dealers',active:'checkCircle',rejected:'close',suspended:'info'};

/** One person, everything in one place: identity, role, money, journey, dealer tier, orders, CRM, linked accounts. */
export function PersonDrawer({id,onClose,onChanged}:{id:string;onClose:()=>void;onChanged?:()=>void}){
  const[d,setD]=useState<any>(null);const[note,setNote]=useState('');const[otab,setOtab]=useState('all');
  const load=useCallback(()=>{if(id)api('/admin/people/'+id).then(setD).catch(e=>toast.err(e.message))},[id]);
  useEffect(()=>{setD(null);load()},[load]);
  const c=d?.customer;
  async function save(patch:any){try{await put(`/admin/customers/${id}/crm`,patch);setD({...d,customer:{...c,...patch}});onChanged?.()}catch(e:any){toast.err(e.message)}}
  async function link(other:string,unlink=false){try{await postJSON(`/admin/people/${id}/link`,{other_id:other,unlink});toast.ok(unlink?'Unlinked':'Linked as the same person');load()}catch(e:any){toast.err(e.message)}}
  const orders=(d?.orders||[]).filter((o:any)=>otab==='all'||(o.customer_type||'retail')===otab);
  return <Drawer open={!!id} width={640} title={c?.name||'Customer'} onClose={onClose}>{!d?<Loading/>:<div className="pd">
    <div className="pd-head"><span className={'pd-av '+(ROLE[d.role]?.cls||'')}>{(c.name||'?').trim()[0]?.toUpperCase()}</span><div>
      <RolePill role={d.role} dealer={d.dealer} rejected={d.rejected}/>
      <p><a className="lnk" href={`tel:${c.phone}`}>{c.phone}</a>{c.email&&<> · {c.email}</>}{d.dealer?.shop&&<><br/><b>{d.dealer.shop}</b> · {d.dealer.shop_type}</>}</p>
      <small className="muted">{c.source==='dealer_application'?'Joined directly as a dealer':'Website customer'} since {dateOnly(c.created_at)}</small></div></div>

    <div className="pd-stats"><div><small>Orders</small><b>{d.stats.orders}</b></div><div><small>Spent</small><b>{tk(d.stats.spent)}</b></div><div><small>Avg order</small><b>{tk(d.stats.avg)}</b></div><div><small>Last order</small><b>{d.stats.last_order?dateOnly(d.stats.last_order):'—'}</b></div></div>
    {(d.stats.retail.n>0||d.stats.dealer.n>0)&&<div className="pd-split"><span className="rl rl-retail sm"><i/>Retail {d.stats.retail.n} · {tk(d.stats.retail.amount)}</span><span className="rl rl-dealer sm"><i/>Dealer {d.stats.dealer.n} · {tk(d.stats.dealer.amount)}</span>{d.stats.cancelled>0&&<small className="muted">{d.stats.cancelled} cancelled/returned not counted</small>}</div>}

    <h4>Journey</h4>
    <ol className="pd-j">{d.journey.map((j:any,i:number)=><li key={i} className={'j-'+j.kind}><span><Icon name={JICON[j.kind]||'info'} size={14}/></span><div><b>{j.text}</b><small>{dt(j.at)}</small></div></li>)}</ol>

    {d.dealer&&<><h4>Dealer</h4><div className="pd-dealer"><div><RolePill role={d.role} dealer={d.dealer} rejected={d.rejected} small/>{d.dealer.note&&<p className="tiny muted">Note: {d.dealer.note}</p>}</div>
      {d.tier?<TierBar t={d.tier}/>:<p className="tiny muted">{d.dealer.status==='Pending'?'Waiting for approval.':d.dealer.status==='Rejected'?'Buys at retail prices.':'No dealer discount while suspended.'}</p>}
      <Link className="btn btn-sm btn-soft" href={`/dealers?open=${d.dealer._id}`}><Icon name="dealers" size={15}/>Open in Dealers</Link></div></>}

    <h4>Orders <span className="pd-otabs">{[['all','All'],['retail','Retail'],['dealer','Dealer']].map(([k,l])=><button key={k} className={otab===k?'on':''} onClick={()=>setOtab(k)}>{l}</button>)}</span></h4>
    {orders.length?<table className="tbl pd-orders"><tbody>{orders.map((o:any)=><tr key={o.order_id}><td><Link className="lnk mono" href={`/orders?open=${o.order_id}`}>#{o.order_id}</Link><br/><small className="muted">{dt(o.created_at)}</small></td>
      <td><span className={'rl sm '+((o.customer_type||'retail')==='dealer'?'rl-dealer':'rl-retail')}><i/>{(o.customer_type||'retail')==='dealer'?'Dealer':'Retail'}</span></td><td><Status s={o.order_status}/></td><td className="r"><b>{tk(o.pricing?.grand_total)}</b></td></tr>)}</tbody></table>:<p className="muted">No orders here.</p>}

    <h4>CRM</h4>
    <div className="fgrid"><Field label="Lead status"><select value={c.lead_status||'New Lead'} onChange={e=>save({lead_status:e.target.value})}>{LEADS.map(l=><option key={l}>{l}</option>)}</select></Field>
      <Field label="Priority"><select value={c.lead_priority||'Cold'} onChange={e=>save({lead_priority:e.target.value})}>{['Hot','Warm','Cold'].map(l=><option key={l}>{l}</option>)}</select></Field>
      <Field label="Assigned to"><input defaultValue={c.assigned_sales_person||''} onBlur={e=>e.target.value!==(c.assigned_sales_person||'')&&save({assigned_sales_person:e.target.value})}/></Field>
      <Field label="Next follow-up"><input type="date" defaultValue={c.next_followup_at?String(c.next_followup_at).slice(0,10):''} onChange={e=>save({next_followup_at:e.target.value||null})}/></Field></div>
    <Field label="Add sales note"><div className="row"><input value={note} onChange={e=>setNote(e.target.value)} placeholder="Called, interested in 30 pcs next week"/><button className="btn btn-sm" disabled={!note.trim()} onClick={()=>{save({sales_notes:[...(c.sales_notes||[]),{text:note.trim(),at:new Date().toISOString()}]});setNote('')}}>Add</button></div></Field>
    {(c.sales_notes||[]).length>0&&<ul className="notes-list">{[...c.sales_notes].reverse().map((n:any,i:number)=><li key={i}><p>{n.text||String(n)}</p>{n.at&&<small className="muted">{dt(n.at)}</small>}</li>)}</ul>}

    {(d.linked.length>0||d.matches.length>0)&&<><h4>Same person, other number</h4>
      {d.linked.map((x:any)=><div key={x._id} className="pd-link"><Icon name="checkCircle" size={16}/><div><b>{x.name}</b> · {x.phone}<br/><RolePill role={x.role} dealer={x.dealer} small/></div><button className="btn btn-sm btn-ghost" onClick={()=>link(x._id,true)}>Unlink</button></div>)}
      {d.matches.map((x:any)=><div key={x._id} className="pd-link maybe"><Icon name="info" size={16}/><div><b>{x.name}</b> · {x.phone} <small className="muted">({x.why})</small><br/><RolePill role={x.role} dealer={x.dealer} small/></div><button className="btn btn-sm btn-soft" onClick={()=>link(x._id)}>Link as same person</button></div>)}
      <p className="tiny muted">Linking only connects the two profiles. Each number keeps its own orders and login; nothing is merged.</p></>}

    <h4>Recent activity on the website</h4>{d.activity.length?<ul className="act">{d.activity.map((a:any)=><li key={a._id}><b>{a.event_type.replaceAll('_',' ')}</b>{a.product_name&&<> · {a.product_name}</>}<small className="muted">{dt(a.created_at)}</small></li>)}</ul>:<p className="muted">No tracked activity yet.</p>}
  </div>}</Drawer>;
}
