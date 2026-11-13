'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import Icon from '@/components/Icon';
import GlassesArt from '@/components/GlassesArt';
import {postJSON,firstImage} from '@/lib/api';
import {track} from '@/lib/tracking';
import {swatch} from './PurchaseOptions';

const LEVELS=[
  {key:'Normal',icon:'cube',title:'Normal',text:'Regular request',cls:'lv-normal'},
  {key:'Priority',icon:'bolt',title:'Priority',text:'Need relatively earlier',cls:'lv-priority'},
  {key:'Urgent',icon:'flame',title:'Urgent',text:'Need as soon as possible',cls:'lv-urgent'},
];
function Stepper({value,onChange,min=0,label}:{value:number;onChange:(n:number)=>void;min?:number;label:string}){
  return <div className="stepper sm"><button type="button" aria-label={`Decrease ${label}`} onClick={()=>onChange(Math.max(min,value-1))}><Icon name="minus" size={16} stroke={2.2}/></button><input aria-label={label} inputMode="numeric" value={value} onChange={e=>onChange(Math.max(min,Math.min(100000,Number(e.target.value.replace(/\D/g,''))||0)))}/><button type="button" aria-label={`Increase ${label}`} onClick={()=>onChange(value+1)}><Icon name="plus" size={16} stroke={2.2}/></button></div>;
}
const ORD=['st','nd','rd'];
export default function QuantityRequest({product:p,open,onClose,dealerPercent=5,dealerTiers=[],bulkThreshold=20}:{product:any;open:boolean;onClose:()=>void;dealerPercent?:number;dealerTiers?:number[];bulkThreshold?:number}){
  const colors:string[]=useMemo(()=>p.colors?.length?p.colors:['Black'],[p]);
  const[total,setTotal]=useState(bulkThreshold);
  const[cq,setCq]=useState<Record<string,number>>(()=>Object.fromEntries(colors.map(c=>[c,0])));
  const[f,setF]=useState({name:'',shop_name:'',phone:'',email:'',urgency:'Normal',message:'',dealer_opt_in:true});
  const[state,setState]=useState<{kind:'idle'|'busy'|'ok'|'err';text?:string}>({kind:'idle'});
  const panel=useRef<HTMLElement>(null);
  useEffect(()=>{if(!open)return;document.body.style.overflow='hidden';panel.current?.focus();const k=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};addEventListener('keydown',k);return()=>{document.body.style.overflow='';removeEventListener('keydown',k)}},[open,onClose]);
  const allocated=Object.values(cq).reduce((a,b)=>a+b,0);
  const unit=Number(p.sale_price||p.price||0);
  const dealerPrice=Math.round(unit*(1-dealerPercent/100));
  // Dealer Benefits tiers (Settings → dealer_tiers, e.g. 5/8/12/15): 1st order is the headline %, the rest are listed here.
  const tiers=dealerTiers.filter(n=>n>0);const next=(tiers.length>1?tiers.slice(1):[8,12,15]);
  const mismatch=allocated>0&&allocated!==total;
  async function submit(e:React.FormEvent){
    e.preventDefault();
    if(total<1)return setState({kind:'err',text:'Required quantity must be at least 1.'});
    if(mismatch)return setState({kind:'err',text:`Colour quantities add up to ${allocated} pcs but the total is ${total} pcs. Please match them.`});
    const digits=f.phone.replace(/\D/g,'').replace(/^880/,'').replace(/^0/,'');
    if(!/^1[3-9]\d{8}$/.test(digits))return setState({kind:'err',text:'Enter a valid Bangladesh mobile number, e.g. 1712 345678.'});
    setState({kind:'busy'});
    try{
      await postJSON('/quantity-requests',{...f,phone:'+880'+digits,email:f.email||null,product_id:p._id,total_quantity:total,color_quantities:allocated?cq:{}});
      track('quantity_request',{product_id:p._id,product_name:p.name,metadata:{total,urgency:f.urgency}});
      if(f.dealer_opt_in)track('dealer_interest',{product_id:p._id});
      setState({kind:'ok',text:'Request submitted! Our team will call you shortly.'});
    }catch(err:any){setState({kind:'err',text:err.message})}
  }
  if(!open)return null;
  return <div className="drawer-root" role="dialog" aria-modal="true" aria-labelledby="qr-title">
    <div className="drawer-bg" onClick={onClose}/>
    <aside className="qr" ref={panel as any} tabIndex={-1}>
      <header className="qr-head"><span className="qr-logo"><Icon name="cube" size={26} stroke={1.8}/></span><h2 id="qr-title">Quantity Request</h2><button type="button" className="qr-x" onClick={onClose} aria-label="Close"><Icon name="close" size={22}/></button></header>
      <p className="qr-intro">Request a larger quantity or restock. Share your requirement and our team will contact you shortly.</p>
      {state.kind==='ok'?<div className="qr-done"><span><Icon name="check" size={30} stroke={3}/></span><h3>Request received</h3><p>{state.text}</p><p className="muted">We usually respond within business hours. For urgent needs, keep your phone reachable.</p><button className="btn btn-block" onClick={onClose}>Close</button></div>:
      <form onSubmit={submit} className="qr-form">
        <div className="qr-product">{firstImage(p)?<img src={firstImage(p)} alt=""/>:<GlassesArt variant={p.has_camera?'camera':'smart'}/>}<div><b>{p.name}</b><small>{p.subtitle||(p.category_name||'')}</small><span className="qr-stock"><Icon name="check" size={12} stroke={3}/> Current Stock: {Math.max(0,p.stock||0)} pcs</span></div></div>
        <label className="qr-field"><span>Your Name <em>*</em></span><input required placeholder="Enter your name" value={f.name} onChange={e=>setF({...f,name:e.target.value})}/></label>
        <label className="qr-field"><span>Shop / Business Name <em>*</em></span><input required placeholder="Enter your shop or business name" value={f.shop_name} onChange={e=>setF({...f,shop_name:e.target.value})}/></label>
        <label className="qr-field"><span>Phone Number <em>*</em></span><div className="qr-phone"><span className="qr-cc"><i className="flag-bd" aria-hidden="true"/><Icon name="chevronDown" size={13}/></span><span className="qr-code">+880</span><input required type="tel" inputMode="tel" placeholder="Enter phone number" value={f.phone} onChange={e=>setF({...f,phone:e.target.value})}/></div></label>
        <div className="qr-field"><span>Required Quantity (Total) <em>*</em></span><div className="qr-total"><Stepper label="total quantity" min={1} value={total} onChange={setTotal}/><span className="muted">pcs</span></div></div>
        <div className="qr-field"><span>Frame Color &amp; Quantity <em>*</em></span><div className="qr-colors">{colors.map(c=><div key={c} className="qr-color"><i style={{background:swatch(p,c)}}/><b>{c}</b><Stepper label={`${c} quantity`} value={cq[c]||0} onChange={n=>setCq({...cq,[c]:n})}/><small>pcs</small></div>)}</div>{allocated>0&&<small className={mismatch?'qr-warn':'qr-okline'}>{allocated} of {total} pcs allocated by colour</small>}</div>
        <label className={'qr-dealer'+(f.dealer_opt_in?' on':'')}>
          <input type="checkbox" checked={f.dealer_opt_in} onChange={e=>setF({...f,dealer_opt_in:e.target.checked})}/>
          <span className="qr-check"><Icon name="check" size={14} stroke={3.2}/></span>
          <span className="qr-dealer-body"><b>Become a Dealer &amp; Get Extra {dealerPercent}% Discount</b>
            <ul><li><Icon name="check" size={13} stroke={3}/>Exclusive dealer pricing ({dealerPercent}% additional discount)</li>{next.length>0&&<li className="qr-tiers"><Icon name="check" size={13} stroke={3}/><span>Next orders: {next.map((t,i)=><em key={i}>{i===next.length-1?`${i+2}${ORD[i+1]||'th'}+`:`${i+2}${ORD[i+1]||'th'}`} <b>{t}%</b></em>)}</span></li>}<li><Icon name="check" size={13} stroke={3}/>Priority restock &amp; early product updates</li><li><Icon name="check" size={13} stroke={3}/>Your orders will be tracked under Dealer Account</li></ul></span>
          <span className="qr-dprice"><small>Dealer Price</small><b>৳ {dealerPrice.toLocaleString('en-IN')} / pc</b></span>
        </label>
        <div className="qr-field"><span>Need Level / Urgency <em>*</em></span><div className="qr-levels" role="radiogroup">{LEVELS.map(l=><button type="button" role="radio" aria-checked={f.urgency===l.key} key={l.key} className={l.cls+(f.urgency===l.key?' on':'')} onClick={()=>setF({...f,urgency:l.key})}>
          {f.urgency===l.key&&<span className="lv-tick"><Icon name="check" size={11} stroke={3.4}/></span>}<Icon name={l.icon} size={22} stroke={1.8} fill={l.key==='Normal'?'none':'currentColor'}/><b>{l.title}</b><small>{l.text}</small></button>)}</div></div>
        <label className="qr-field"><span>Message (Optional)</span><textarea rows={3} placeholder="Tell us about your requirement, expected delivery time, or any other details..." value={f.message} onChange={e=>setF({...f,message:e.target.value})}/></label>
        {state.kind==='err'&&<p className="form-err" role="alert">{state.text}</p>}
        <button className="btn btn-lg btn-block" disabled={state.kind==='busy'}><Icon name="send" size={19} fill="currentColor" stroke={1.2}/>{state.kind==='busy'?'Submitting…':'Submit Request'}</button>
        <p className="qr-note">Dealer pricing is applied after EMXIN approves the dealer account. Approval is not automatic.</p>
      </form>}
    </aside>
  </div>;
}
