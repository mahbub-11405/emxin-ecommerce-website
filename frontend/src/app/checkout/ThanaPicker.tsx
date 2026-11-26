'use client';
import {useEffect,useId,useMemo,useRef,useState} from 'react';
import Icon from '@/components/Icon';
import {DISTRICTS} from '@/lib/districts';
import {THANAS,DIVISION_OF,searchThana,placeLabel,type Place} from '@/lib/thanas';

/** Thana box: type a few letters ("mono") → pick "Monohardi, Narsingdi · Dhaka Division" → thana, district and division are set.
 *  Same thana name in several districts → one line each, the customer picks theirs. Not in the list → choose the district and keep the typed name. */
export default function ThanaPicker({thana,district,onPick,inputId}:{thana:string;district:string;onPick:(p:{thana:string;district:string},done:boolean)=>void;inputId?:string}){
  const known=!!thana&&(THANAS[district]||[]).includes(thana);
  const[q,setQ]=useState('');const[open,setOpen]=useState(false);const[hi,setHi]=useState(0);
  const[manual,setManual]=useState(!!thana&&!known);
  const box=useRef<HTMLInputElement>(null);const lid=useId();
  const res=useMemo(()=>searchThana(q),[q]);
  useEffect(()=>{setHi(0)},[q]);
  const pick=(p:Place)=>{setQ('');setOpen(false);setManual(false);onPick({thana:p.thana,district:p.district},true)};

  // picked: one tidy line with a Change link
  if(thana&&district&&!manual)return <div className="tp-done"><Icon name="checkCircle" size={18}/>
    <span><b>{thana}, {district}</b><small>{DIVISION_OF[district]?`${DIVISION_OF[district]} Division`:''}</small></span>
    <button type="button" className="tp-change" onClick={()=>{onPick({thana:'',district},false);setTimeout(()=>box.current?.focus(),30)}}>Change</button></div>;

  if(manual)return <div className="tp-manual">
    <select aria-label="District" value={district} onChange={e=>onPick({thana,district:e.target.value},false)}>{DISTRICTS.map(d=><option key={d}>{d}</option>)}</select>
    <input id={inputId} required minLength={2} maxLength={60} value={thana} onChange={e=>onPick({thana:e.target.value,district},false)} placeholder="Thana / area name"/>
    <button type="button" className="tp-change" onClick={()=>{setManual(false);onPick({thana:'',district},false)}}>Search the list again</button></div>;

  return <div className="tp">
    <input ref={box} id={inputId} role="combobox" aria-expanded={open&&res.length>0} aria-controls={lid} aria-autocomplete="list" autoComplete="off"
      required value={q} placeholder="Type your thana, e.g. Mirpur, Panchlaish, Monohardi"
      onChange={e=>{setQ(e.target.value);setOpen(true)}} onFocus={()=>setOpen(true)} onBlur={()=>setTimeout(()=>setOpen(false),150)}
      onKeyDown={e=>{if(!res.length)return;if(e.key==='ArrowDown'){e.preventDefault();setHi(h=>Math.min(res.length-1,h+1))}else if(e.key==='ArrowUp'){e.preventDefault();setHi(h=>Math.max(0,h-1))}else if(e.key==='Enter'){e.preventDefault();pick(res[hi])}}}/>
    {open&&q.trim().length>=2&&<ul className="tp-list" id={lid} role="listbox">
      {res.map((p,i)=><li key={p.district+p.thana} role="option" aria-selected={i===hi} className={i===hi?'on':''} onMouseDown={e=>{e.preventDefault();pick(p)}}>
        <Icon name="pin" size={15}/><span><b>{p.thana}</b><small>{p.district}{p.division?` · ${p.division} Division`:''}</small></span></li>)}
      {!res.length&&<li className="tp-none">No thana found for “{q}”.</li>}
      <li className="tp-other" onMouseDown={e=>{e.preventDefault();setManual(true);setOpen(false);onPick({thana:q.trim(),district},false)}}>Not in the list? Choose your district and keep “{q.trim()}”</li>
    </ul>}
  </div>;
}
export {placeLabel};
