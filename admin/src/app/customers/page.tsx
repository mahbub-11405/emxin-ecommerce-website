'use client';
import {useEffect,useState} from 'react';
import Shell from '@/components/Shell';
import Icon from '@/components/Icon';
import {PersonDrawer,RolePill} from '@/components/Person';
import {PageHead,Empty,Loading,toast,Status} from '@/components/ui';
import {api,tk,dt,downloadCSV} from '@/lib/api';

/** Everyone who knows EMXIN: one person = one phone number. Dealer is a role on the same account. */
const TABS:[string,string][]=[['all','All'],['retail','Retail'],['dealer','Dealers'],['applicant','Dealer applicants'],['lead','Leads (no order)'],['hot','Hot']];
const pct=(a:number,b:number)=>b?Math.round(a/b*100):0;

export default function Customers(){
  const[d,setD]=useState<any>(null);const[tab,setTab]=useState('all');const[q,setQ]=useState('');const[open,setOpen]=useState('');
  const load=()=>{const s=new URLSearchParams({tab});if(q.trim())s.set('q',q.trim());return api('/admin/people?'+s).then(setD).catch(e=>toast.err(e.message))};
  useEffect(()=>{const t=setTimeout(load,q?300:0);return()=>clearTimeout(t)},[tab,q]);
  useEffect(()=>{const p=new URLSearchParams(location.search);if(p.get('q'))setQ(p.get('q')||'');if(p.get('open'))setOpen(p.get('open')||'');if(p.get('tab'))setTab(p.get('tab')||'all')},[]);
  const S=d?.summary;const F=d?.funnel;const rows:any[]=d?.rows||[];
  const card=(k:string,label:string,n:number,sub:string,cls:string)=><button className={'pc '+cls+(tab===k?' on':'')} onClick={()=>setTab(tab===k?'all':k)}><small><i/>{label}</small><b>{n}</b><span>{sub}</span></button>;
  return <Shell><PageHead title="Customers & CRM" sub="Everyone who buys from EMXIN. One mobile number is one person; a dealer is the same account with the dealer role.">
      <button className="btn btn-ghost" onClick={()=>downloadCSV('emxin-people.csv',rows,[['Name','name'],['Phone','phone'],['Email','email'],['Role',r=>r.role_label],['Dealer ID',r=>r.dealer?.code||''],['Shop',r=>r.dealer?.shop||r.shop_name||''],['Shop type',r=>r.dealer?.shop_type||''],['Retail orders',r=>r.split.retail.n],['Retail ৳',r=>r.split.retail.amount],['Dealer orders',r=>r.split.dealer.n],['Dealer ৳',r=>r.split.dealer.amount],['Lead','lead_status'],['Priority','lead_priority'],['Joined',r=>dt(r.created_at)],['Last active',r=>dt(r.last_active_at)]])}><Icon name="download" size={17}/>Export</button></PageHead>
    {S&&<div className="pcards">
      {card('retail','Retail customers',S.retail.n,`${tk(S.retail.amount)} from retail orders`,'rl-retail')}
      {card('dealer','Dealers (active)',S.dealer.n,`${tk(S.dealer.amount)} from dealer orders`,'rl-dealer')}
      {card('applicant','Dealer applicants',S.applicant.n,S.applicant.n?'waiting for your review':'nobody waiting','rl-applicant')}
      {card('lead','Leads (no order yet)',S.lead.n,'registered, follow up','rl-lead')}
    </div>}
    {F&&<div className="pfunnel"><span><b>{F.registered}</b> registered</span><i>→</i><span><b>{F.ordered}</b> ordered <em>{pct(F.ordered,F.registered)}%</em></span><i>→</i><span><b>{F.repeat}</b> ordered again <em>{pct(F.repeat,F.ordered)}%</em></span><i>→</i><span><b>{F.became_dealer}</b> {F.became_dealer===1?'customer became a dealer':'customers became dealers'}</span></div>}
    <div className="ptabs">{TABS.map(([k,l])=><button key={k} className={tab===k?'on':''} onClick={()=>setTab(k)}>{l}</button>)}</div>
    <div className="filters"><div className="search-in"><Icon name="search" size={17}/><input placeholder="Name, phone, email, shop, dealer ID" value={q} onChange={e=>setQ(e.target.value)}/></div></div>
    <div className="card flush">{!d?<Loading/>:rows.length?<div className="tbl-wrap"><table className="tbl"><thead><tr><th>Person</th><th>Contact</th><th>Orders</th><th>Spent</th><th>Lead</th><th>Next follow-up</th><th>Last active</th></tr></thead><tbody>{rows.map(c=><tr key={c._id} className="click" onClick={()=>setOpen(c._id)}>
      <td><b>{c.name||'—'}</b><br/><RolePill role={c.role} dealer={c.dealer} rejected={c.rejected} small/>{c.dealer?.shop&&<><br/><small className="muted">{c.dealer.shop} · {c.dealer.shop_type}</small></>}</td>
      <td>{c.phone}<br/><small className="muted">{c.email}</small></td>
      <td className="nowrap">{c.split.retail.n+c.split.dealer.n}{(c.split.retail.n>0&&c.split.dealer.n>0)||c.role==='dealer'?<><br/><small className="muted">{c.split.retail.n} retail · {c.split.dealer.n} dealer</small></>:null}</td>
      <td className="nowrap"><b>{tk(c.split.retail.amount+c.split.dealer.amount)}</b></td>
      <td><Status s={c.lead_priority||'Cold'}/> <small>{c.lead_status||'New Lead'}</small></td><td>{c.next_followup_at?String(c.next_followup_at).slice(0,10):'—'}</td><td className="nowrap"><small>{dt(c.last_active_at)}</small></td></tr>)}</tbody></table></div>
      :<Empty text="Nobody in this view." icon="customers"/>}</div>
    {d?.total>rows.length&&<p className="tiny muted">Showing {rows.length} of {d.total}. Search to find someone specific.</p>}
    <PersonDrawer id={open} onClose={()=>{setOpen('');history.replaceState(null,'','/customers')}} onChanged={load}/>
  </Shell>;
}
