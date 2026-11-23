'use client';
import {useMemo,useState} from 'react';
import Icon from '@/components/Icon';

/** Which products a coupon works on: every product, or only the ticked ones (grouped by category, with search). */
export default function ProductPick({products,value,onChange}:{products:any[];value:string[];onChange:(ids:string[],only:boolean)=>void}){
  const[only,setOnly]=useState(value.length>0);const[q,setQ]=useState('');
  const groups=useMemo(()=>{const qq=q.trim().toLowerCase();const g:Record<string,any[]>={};
    for(const p of products){if(qq&&!`${p.name} ${p.subtitle||''} ${p.sku||''} ${p.category_slug||''}`.toLowerCase().includes(qq))continue;
      const k=p.category_name||(p.category_slug||'other').replace(/-/g,' ').replace(/\b\w/g,(c:string)=>c.toUpperCase());(g[k]=g[k]||[]).push(p)}
    return Object.entries(g).sort((a,b)=>a[0].localeCompare(b[0]))},[products,q]);
  const has=(id:string)=>value.includes(id);
  const flip=(id:string)=>onChange(has(id)?value.filter(x=>x!==id):[...value,id],true);
  const setGroup=(list:any[],on:boolean)=>{const ids=list.map(p=>p._id);onChange(on?[...new Set([...value,...ids])]:value.filter(x=>!ids.includes(x)),true)};
  const img=(p:any)=>p.images?.[0]||(p.media||[]).find((m:any)=>m.type!=='video')?.url||'';
  return <div className="span cp-pick">
    <b className="cp-pick-t">Works on</b>
    <div className="cp-pick-mode" role="radiogroup">
      <label className={!only?'on':''}><input type="radio" checked={!only} onChange={()=>{setOnly(false);onChange([],false)}}/>All products</label>
      <label className={only?'on':''}><input type="radio" checked={only} onChange={()=>{setOnly(true);onChange(value,true)}}/>Only the products I select</label>
    </div>
    {only&&<>
      <div className="cp-pick-bar"><label className="cp-pick-q"><Icon name="search" size={15}/><input placeholder="Search products" value={q} onChange={e=>setQ(e.target.value)}/></label>
        <span className={'cp-pick-n'+(value.length?'':' warn')}>{value.length?`${value.length} selected`:'Select at least one'}</span>
        {value.length>0&&<button type="button" className="btn btn-sm btn-ghost" onClick={()=>onChange([],true)}>Clear</button>}</div>
      <div className="cp-pick-list">{groups.length?groups.map(([cat,list])=>{const all=list.every(p=>has(p._id));
        return <div key={cat} className="cp-pick-g"><div className="cp-pick-gh"><b>{cat}</b><small className="muted">{list.filter(p=>has(p._id)).length}/{list.length}</small>
            <button type="button" className="btn btn-sm btn-ghost" onClick={()=>setGroup(list,!all)}>{all?'Untick all':'Tick all'}</button></div>
          {list.map(p=><label key={p._id} className={'cp-pick-row'+(has(p._id)?' on':'')}><input type="checkbox" checked={has(p._id)} onChange={()=>flip(p._id)}/>
            <i>{img(p)?<img src={img(p)} alt=""/>:<Icon name="box" size={16}/>}</i>
            <span><b>{p.name}</b><small className="muted">{[p.subtitle,p.sku].filter(Boolean).join(' · ')}</small></span>
            <em>৳ {Math.round(Number(p.sale_price||p.price)||0).toLocaleString('en-IN')}</em></label>)}</div>}):<p className="muted tiny">No product matches “{q}”.</p>}</div>
      <p className="tiny muted">The discount is worked out only on these products. Other products in the same cart (for example power banks) get no coupon discount, and the minimum order counts only these products.</p>
    </>}
  </div>;
}
