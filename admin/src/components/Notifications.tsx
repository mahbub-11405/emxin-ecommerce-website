'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import Icon from './Icon';
import {toast} from './ui';
import {api,tk,ago,dt} from '@/lib/api';
import {onLive} from '@/lib/live';

/** Bell menu: what needs someone now. New = arrived after you last opened the bell. */
const ICON:Record<string,string>={order:'orders',payment:'cash',courier:'truck',dealer:'dealers',quantity:'box',review:'star'};
const FILTERS=[['','All'],['order','Orders'],['payment','Payments'],['courier','Courier'],['other','Other']] as const;
const SEEN_KEY='admin_notes_seen';
const getSeen=()=>{try{return Number(localStorage.getItem(SEEN_KEY)||0)}catch{return 0}};

export default function Notifications({counts}:{counts:any}){
  const[open,setOpen]=useState(false);const[d,setD]=useState<{items:any[];summary:any[]}|null>(null);const[f,setF]=useState('');
  const[seen,setSeen]=useState(0);const box=useRef<HTMLDivElement>(null);const prev=useRef<number|null>(null);
  const total=(counts.orders_pending||0)+(counts.courier_attention||0)+(counts.dealers_pending||0)+(counts.quantity_requests_new||0)+(counts.reviews_pending||0)+(counts.questions_pending||0);
  const load=()=>api('/admin/notifications').then((x:any)=>setD(Array.isArray(x)?{items:x,summary:[]}:x)).catch(()=>{});
  useEffect(()=>{setSeen(getSeen())},[]);
  useEffect(()=>{if(!open)return;return onLive(load,d=>d?.d,500)},[open]);  // list updates while it is open
  // a new order while the admin is open: tell them right away
  useEffect(()=>{const n=counts.orders_pending;if(n==null)return;
    if(prev.current!=null&&n>prev.current){const more=n-prev.current;
      api('/admin/notifications').then((x:any)=>{const list=Array.isArray(x)?x:x?.items||[];setD(Array.isArray(x)?{items:x,summary:[]}:x);
        const o=list.find((i:any)=>i.type==='order');
        toast.note({icon:'orders',title:more>1?`${more} new orders`:'New order received',amount:o?.amount>0?tk(o.amount):undefined,
          text:o?[o.order_id&&'#'+o.order_id,o.who].filter(Boolean).join(' · ')+(more>1?` and ${more-1} more`:''):'Open the orders to confirm.',href:o?.href||'/orders?status=Pending Confirmation'})}).catch(()=>toast.note({icon:'orders',title:'New order received',href:'/orders?status=Pending Confirmation'}))}
    prev.current=n},[counts.orders_pending]);
  useEffect(()=>{document.title=total>0?`(${total}) EMXIN Admin`:'EMXIN Admin'},[total]);
  useEffect(()=>{if(!open)return;const c=(e:MouseEvent)=>{if(box.current&&!box.current.contains(e.target as Node))setOpen(false)};const k=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false)};
    document.addEventListener('mousedown',c);addEventListener('keydown',k);return()=>{document.removeEventListener('mousedown',c);removeEventListener('keydown',k)}},[open]);
  const items=d?.items||[];
  const isNew=(n:any)=>new Date(n.created_at).getTime()>seen;
  const fresh=items.filter(isNew).length;
  const shown=items.filter(n=>!f||(f==='other'?!['order','payment','courier'].includes(n.type):n.type===f));
  function toggle(){if(!open){load();setOpen(true)}else close()}
  function close(){setOpen(false);markSeen()}
  function markSeen(){const t=Date.now();try{localStorage.setItem(SEEN_KEY,String(t))}catch{}setSeen(t)}
  return <div className="pop-wrap" ref={box}>
    <button className={'ib bell'+(fresh>0&&!open?' ring':'')} aria-label={`Notifications${total?`, ${total} need action`:''}`} onClick={toggle}><Icon name="bell" size={23}/>{total>0&&<em className="bell-n">{total>99?'99+':total}</em>}</button>
    {open&&<div className="pop nt" role="dialog" aria-label="Notifications">
      <div className="nt-head"><b>Notifications</b>{fresh>0&&<span className="nt-new">{fresh} new</span>}<span className="sp"/>{fresh>0&&<button className="nt-link" onClick={markSeen}><Icon name="check" size={14}/>Mark all as seen</button>}</div>
      {d?.summary?.length?<div className="nt-sum">{d.summary.map((s:any)=><Link key={s.key} href={s.href} onClick={close} className={'nt-chip t-'+s.tone}><b>{s.count}</b>{s.label}</Link>)}</div>:null}
      <div className="nt-tabs">{FILTERS.map(([k,l])=><button key={k} className={f===k?'on':''} onClick={()=>setF(k)}>{l}</button>)}</div>
      <div className="nt-list">{!d?<p className="muted pad">Loading…</p>:shown.length?shown.map((n,i)=><Link key={i} href={n.href} onClick={close} className={'nt-item t-'+n.tone+(isNew(n)?' new':'')}>
        <span className="nt-ic">{(n.channel==='bkash'||n.channel==='nagad')?<img src={`/pay/${n.channel}.png`} alt={n.channel}/>:<Icon name={ICON[n.type]||'bell'} size={18}/>}</span>
        <span className="nt-body">
          <span className="nt-t"><b>{n.title}</b>{n.amount>0&&<em>{tk(n.amount)}</em>}</span>
          <span className="nt-who">{n.order_id&&<span className="mono">#{n.order_id}</span>}{n.order_id&&n.who?' · ':''}{n.who}</span>
          {n.text&&<small>{n.text}</small>}
          <time title={dt(n.created_at)}>{ago(n.created_at)}</time>
        </span>
        {isNew(n)&&<i className="nt-dot" aria-label="new"/>}
      </Link>):<div className="nt-empty"><Icon name="checkCircle" size={28}/><b>All caught up</b><small>Nothing waiting for you here.</small></div>}</div>
      <Link className="nt-foot" href="/orders?status=Pending Confirmation" onClick={close}>Open all pending orders<Icon name="arrowRight" size={15}/></Link>
    </div>}
  </div>;
}
