'use client';
import {useEffect,useState} from 'react';
import Shell from '@/components/Shell';
import Icon from '@/components/Icon';
import {PageHead,Drawer,Empty,Loading,toast,Field,Toggle,Confirm,Status} from '@/components/ui';
import {api,put,del,postJSON,tk,dateOnly} from '@/lib/api';
const BLANK:any={code:'',type:'fixed',value:100,max_discount:null,min_order:0,usage_limit:null,active:true,allow_bulk:false,starts_at:'',ends_at:'',description:'',show_public:false};
const d10=(s:any)=>s?String(s).slice(0,10):'';
export default function Coupons(){
  const[rows,setRows]=useState<any[]|null>(null);const[f,setF]=useState<any>(null);const[orig,setOrig]=useState('');
  const load=()=>api('/admin/coupons').then(setRows).catch(e=>toast.err(e.message));useEffect(()=>{load()},[]);
  async function save(e:React.FormEvent){e.preventDefault();try{const b={...f,value:Number(f.value),min_order:Number(f.min_order)||0,max_discount:f.max_discount?Number(f.max_discount):null,usage_limit:f.usage_limit?Number(f.usage_limit):null,starts_at:f.starts_at||null,ends_at:f.ends_at||null};['_id','used','total_discount','created_at','updated_at','created_by'].forEach(k=>delete b[k]);if(orig)await put(`/admin/coupons/${orig}`,b);else await postJSON('/admin/coupons',b);toast.ok('Coupon saved');setF(null);load()}catch(x:any){toast.err(x.message)}}
  const state=(c:any)=>{const n=Date.now();if(!c.active)return 'Disabled';if(c.ends_at&&new Date(c.ends_at).getTime()<n)return 'Expired';if(c.starts_at&&new Date(c.starts_at).getTime()>n)return 'Scheduled';if(c.usage_limit&&c.used>=c.usage_limit)return 'Used up';return 'Active'};
  return <Shell><PageHead title="Coupons" sub="Discount codes customers enter at checkout. Bulk orders skip coupons unless allowed."><button className="btn" onClick={()=>{setOrig('');setF({...BLANK})}}><Icon name="plus" size={18}/>Create coupon</button></PageHead>
    <div className="card flush">{!rows?<Loading/>:rows.length?<table className="tbl"><thead><tr><th>Code</th><th>Discount</th><th>Conditions</th><th>Validity</th><th>Usage</th><th>Status</th><th className="r"/></tr></thead><tbody>{rows.map(c=><tr key={c.code}><td><b className="mono">{c.code}</b><br/><small className="muted">{c.description}</small></td><td>{c.type==='percentage'?`${c.value}%`:tk(c.value)}{c.max_discount?<small className="muted"> (max {tk(c.max_discount)})</small>:null}</td><td><small>{c.min_order?`Min ${tk(c.min_order)}`:'No minimum'}{c.allow_bulk?' · bulk OK':''}</small></td><td><small>{c.starts_at?dateOnly(c.starts_at):'Now'} → {c.ends_at?dateOnly(new Date(new Date(c.ends_at).getTime()-864e5)):'No end'}</small></td><td>{c.used}{c.usage_limit?` / ${c.usage_limit}`:''}<br/><small className="muted">{tk(c.total_discount)} given</small></td><td><Status s={state(c)}/></td>
      <td className="r nowrap"><button className="btn btn-sm btn-soft" onClick={()=>{setOrig(c.code);setF({...c,starts_at:d10(c.starts_at),ends_at:c.ends_at?d10(new Date(new Date(c.ends_at).getTime()-864e5).toISOString()):''})}}><Icon name="edit" size={15}/>Edit</button><Confirm cls="ib danger" text={`Delete coupon ${c.code}?`} onYes={async()=>{await del(`/admin/coupons/${c.code}`);load()}}><Icon name="trash" size={16}/></Confirm></td></tr>)}</tbody></table>:<Empty text="No coupons yet." icon="coupons"/>}</div>
    <Drawer open={!!f} title={orig?`Edit ${orig}`:'Create coupon'} onClose={()=>setF(null)}>{f&&<form onSubmit={save} className="fgrid">
      <Field label="Code *"><input required className="mono" value={f.code} onChange={e=>setF({...f,code:e.target.value.toUpperCase()})}/></Field>
      <Field label="Type"><select value={f.type} onChange={e=>setF({...f,type:e.target.value})}><option value="fixed">Fixed amount (৳)</option><option value="percentage">Percentage (%)</option></select></Field>
      <Field label="Value *"><input required type="number" min="1" value={f.value} onChange={e=>setF({...f,value:e.target.value})}/></Field>
      <Field label="Max discount (৳)" hint="For percentage coupons"><input type="number" value={f.max_discount??''} onChange={e=>setF({...f,max_discount:e.target.value})}/></Field>
      <Field label="Minimum order (৳)"><input type="number" value={f.min_order} onChange={e=>setF({...f,min_order:e.target.value})}/></Field>
      <Field label="Usage limit" hint="Empty = unlimited"><input type="number" value={f.usage_limit??''} onChange={e=>setF({...f,usage_limit:e.target.value})}/></Field>
      <Field label="Starts"><input type="date" value={f.starts_at||''} onChange={e=>setF({...f,starts_at:e.target.value})}/></Field><Field label="Ends (inclusive)"><input type="date" value={f.ends_at||''} onChange={e=>setF({...f,ends_at:e.target.value})}/></Field>
      <Field label="Description" span><input value={f.description} onChange={e=>setF({...f,description:e.target.value})}/></Field>
      <div className="span stack"><Toggle checked={f.active} onChange={v=>setF({...f,active:v})} label="Active"/><Toggle checked={f.allow_bulk} onChange={v=>setF({...f,allow_bulk:v})} label="Allow on bulk / dealer orders"/><Toggle checked={!!f.show_public} onChange={v=>setF({...f,show_public:v})} label="Show in “Available coupons” at checkout (off = secret code you share yourself)"/><button className="btn">Save coupon</button></div></form>}</Drawer></Shell>;
}
