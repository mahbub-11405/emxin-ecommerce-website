'use client';
import {useCallback,useEffect,useState} from 'react';
import Shell from '@/components/Shell';
import Icon from '@/components/Icon';
import {PageHead,Tabs,Empty,Loading,toast,askDelete,Drawer} from '@/components/ui';
import {api,postJSON,dt,tk} from '@/lib/api';

const KINDS:[string,string][]=[['','All'],['order','Orders'],['product','Products'],['category','Categories'],['brand','Brands'],['coupon','Coupons'],['review','Reviews'],['media','Media'],['dealer','Dealers']];
const WHERE:Record<string,string>={order:'Orders',product:'Products',category:'Categories',brand:'Brands',coupon:'Coupons',review:'Reviews & Q&A',media:'Media Library',dealer:'Dealers'};

function Peek({id}:{id:string}){
  const[d,setD]=useState<any>(null);
  useEffect(()=>{api('/admin/recycle-bin/'+id).then(setD).catch(e=>toast.err(e.message))},[id]);
  if(!d)return <Loading/>;const o=d.doc||{};
  return <div>
    <p><span className="st st-gray">{d.kind_label}</span> <b>{d.label}</b><br/><small className="muted">{d.sub}</small></p>
    <p className="tiny muted">Deleted {dt(d.deleted_at)} by {d.deleted_role||'admin'} · original ID <span className="mono">{d.doc_id}</span></p>
    {d.kind==='order'&&<div className="cr-idbox"><div><small>Customer</small><b>{o.customer_name}</b><small>{o.phone}</small></div><div><small>Total</small><b>{tk(o.pricing?.grand_total)}</b><small>{o.payment_status} · {o.order_status}</small></div>
      <div style={{gridColumn:'1/-1'}}><small>Items</small><b>{(o.items||[]).map((i:any)=>`${i.name} × ${i.quantity}`).join(', ')}</b></div></div>}
    {d.kind==='dealer'&&<div className="cr-idbox"><div><small>Dealer</small><b>{o.shop_name}</b><small>{o.name} · {o.phone}</small></div><div><small>Dealer ID</small><b className="mono">{o.dealer_code||'—'}</b><small>was {o.status}</small></div></div>}
    {d.kind==='media'&&o.url&&<img src={o.url} alt="" style={{maxWidth:'100%',borderRadius:12}}/>}
    {d.related_summary?.length>0&&<p className="tiny muted">Also kept with it: {d.related_summary.map((r:any)=>`${r.count} ${r.collection.replace('_',' ')}`).join(', ')}.</p>}
    <p className="tiny muted">Restore puts it back in {WHERE[d.kind]||'its page'} with the same ID{d.kind==='order'?', reserves the stock again and adds it back to the customer’s totals':d.kind==='dealer'?', back on the same website account with the same dealer ID and discount tier':''}.</p>
  </div>;
}

export default function RecycleBin(){
  const[kind,setKind]=useState('');const[q,setQ]=useState('');const[d,setD]=useState<any>(null);const[sel,setSel]=useState<string[]>([]);const[peek,setPeek]=useState('');const[busy,setBusy]=useState(false);
  const load=useCallback(()=>{const s=new URLSearchParams();if(kind)s.set('kind',kind);if(q.trim())s.set('q',q.trim());api('/admin/recycle-bin?'+s).then(x=>{setD(x);setSel(v=>v.filter(id=>x.rows.some((r:any)=>r._id===id)))}).catch(e=>toast.err(e.message))},[kind,q]);
  useEffect(()=>{const t=setTimeout(load,q?300:0);return()=>clearTimeout(t)},[load,q]);
  async function restore(ids:string[]){setBusy(true);try{const r=await postJSON('/admin/recycle-bin/restore',{ids});toast.ok(`Restored: ${r.restored.join(', ')}`);if(r.errors?.length)toast.err(r.errors.join(' · '));setSel([]);setPeek('');load()}catch(e:any){toast.err(e.message)}finally{setBusy(false)}}
  async function purge(ids:string[],all=false){
    const n=all?d?.total:ids.length;
    if(!await (all?askDelete('Empty the Recycle Bin?',`All ${n} item(s) in the bin are erased for good, including media files in S3. Nothing can be restored after this.`,true,'EMPTY','Empty bin'):askDelete(`Delete ${n} item${n>1?'s':''} forever?`,'They cannot be restored after this.',true)))return;
    setBusy(true);try{const r=await postJSON('/admin/recycle-bin/purge',{ids,all,confirm:all?'empty':'delete'});toast.ok(`${r.deleted} item(s) deleted forever`);setSel([]);setPeek('');load()}catch(e:any){toast.err(e.message)}finally{setBusy(false)}}
  const rows=d?.rows||[];
  return <Shell>
    <PageHead title="Recycle Bin" sub="Everything deleted in the admin panel lands here. Restore brings it back to the same place with the same ID, so orders, reports and links work as before.">{d?.total>0&&<button className="btn btn-ghost danger" disabled={busy} onClick={()=>purge([],true)}><Icon name="trash" size={16}/>Empty bin</button>}</PageHead>
    <Tabs value={kind} onChange={k=>{setKind(k);setSel([])}} tabs={KINDS.map(([k,l])=>({key:k,label:l,count:k?(d?.counts?.[k]||0):(d?.total||0)}))}/>
    {sel.length>0&&<div className="bulkbar"><b><span className="bb-n">{sel.length}</span>selected</b><span className="sp"/><button className="btn btn-sm btn-ghost" onClick={()=>setSel([])}><Icon name="close" size={15}/>Clear selection</button>
      <button className="btn btn-sm" disabled={busy} onClick={()=>restore(sel)}><Icon name="refresh" size={15}/>Restore</button><button className="btn btn-sm btn-danger" disabled={busy} onClick={()=>purge(sel)}><Icon name="trash" size={15}/>Delete forever</button></div>}
    <div className="card flush"><div className="filters" style={{padding:'12px 12px 0'}}><div className="search-in"><Icon name="search" size={17}/><input placeholder="Search by order ID, name, code…" value={q} onChange={e=>setQ(e.target.value)}/></div></div>
      {!d?<Loading/>:rows.length?<div className="tbl-wrap"><table className="tbl"><thead><tr><th className="ck"><input type="checkbox" aria-label="Select all" checked={rows.length>0&&rows.every((r:any)=>sel.includes(r._id))} onChange={e=>setSel(e.target.checked?rows.map((r:any)=>r._id):[])}/></th><th>Item</th><th>Type</th><th>Deleted</th><th/></tr></thead>
        <tbody>{rows.map((r:any)=><tr key={r._id} className="click" onClick={()=>setPeek(r._id)}>
          <td className="ck" onClick={e=>e.stopPropagation()}><input type="checkbox" aria-label={`Select ${r.label}`} checked={sel.includes(r._id)} onChange={e=>setSel(e.target.checked?[...sel,r._id]:sel.filter(x=>x!==r._id))}/></td>
          <td><div className="row" style={{gap:10,flexWrap:'nowrap'}}>{r.thumb&&<img className="rb-thumb" src={r.thumb} alt=""/>}<div><b>{r.label}</b><br/><small className="muted">{r.sub}</small></div></div></td>
          <td><span className="st st-gray rb-kind">{r.kind_label}</span></td><td className="nowrap"><small>{dt(r.deleted_at)}</small><br/><small className="muted">by {r.deleted_role||'admin'}</small></td>
          <td className="r nowrap" onClick={e=>e.stopPropagation()}><button className="btn btn-sm btn-soft" disabled={busy} onClick={()=>restore([r._id])}><Icon name="refresh" size={14}/>Restore</button> <button className="ib danger" title="Delete forever" disabled={busy} onClick={()=>purge([r._id])}><Icon name="trash" size={16}/></button></td></tr>)}</tbody></table></div>
        :<Empty text={kind?'Nothing of this type in the bin.':'The Recycle Bin is empty.'} icon="trash"/>}</div>
    <Drawer open={!!peek} title="Deleted item" onClose={()=>setPeek('')} width={520} footer={peek?<div className="row-gap"><button className="btn" disabled={busy} onClick={()=>restore([peek])}><Icon name="refresh" size={16}/>Restore</button><button className="btn btn-ghost danger" disabled={busy} onClick={()=>purge([peek])}>Delete forever</button></div>:null}>{peek&&<Peek id={peek}/>}</Drawer>
  </Shell>;
}
