'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {usePathname,useRouter} from 'next/navigation';
import Icon from './Icon';
import {Toaster} from './ui';
import {api,dt} from '@/lib/api';

type Sub={href:string;label:string;roles?:string[]};
type Item={href:string;label:string;icon:string;badge?:string;roles?:string[];children?:Sub[]};
const SA=['super_admin'],MGR=['super_admin','admin'];
/** Menu per role. Super Admin sees everything; the backend enforces the same rules. */
const NAV:Item[]=[
  {href:'/dashboard',label:'Dashboard',icon:'dashboard'},
  {href:'/orders',label:'Orders',icon:'orders',badge:'orders_pending',roles:[...MGR,'sales','support','inventory']},
  {href:'/products',label:'Products',icon:'products',roles:[...MGR,'inventory']},
  {href:'/categories',label:'Categories',icon:'categories',roles:[...MGR,'inventory']},
  {href:'/media',label:'Media Library',icon:'upload',roles:[...MGR,'inventory','marketing']},
  {href:'/brands',label:'Brands',icon:'brands',roles:[...MGR,'inventory']},
  {href:'/customers',label:'Customers',icon:'customers',roles:[...MGR,'sales','support','marketing'],children:[{href:'/customers',label:'Customers & CRM'},{href:'/quantity-requests',label:'Quantity Requests',roles:[...MGR,'sales','support','marketing']},{href:'/reviews',label:'Reviews & Q&A',roles:[...MGR,'support','marketing']}]},
  {href:'/dealers',label:'Dealers',icon:'dealers',badge:'dealers_pending',roles:[...MGR,'sales']},
  {href:'/coupons',label:'Coupons',icon:'coupons',roles:[...MGR,'marketing']},
  {href:'/marketing',label:'Marketing',icon:'marketing',roles:[...MGR,'marketing']},
  {href:'/homepage-builder',label:'CMS / Homepage',icon:'cms',roles:[...MGR,'marketing'],children:[{href:'/homepage-builder',label:'Homepage Builder'},{href:'/homepage-builder?tab=pages',label:'Policy Pages'}]},
  {href:'/reports',label:'Reports & Analytics',icon:'reports',roles:[...MGR,'sales','marketing'],children:[{href:'/reports',label:'Sales Reports'},{href:'/payments',label:'Payments',roles:[...MGR,'sales']},{href:'/ledger',label:'Ledger',roles:MGR}]},
  {href:'/settings',label:'Settings',icon:'settings',roles:MGR,children:[{href:'/settings',label:'Store Settings'},{href:'/staff',label:'Staff Accounts',roles:SA},{href:'/audit-log',label:'Audit Log',roles:SA}]},
];
export const ROLE_LABEL:Record<string,string>={super_admin:'Super Admin',admin:'Admin',sales:'Sales',marketing:'Marketing',inventory:'Inventory',support:'Support'};
export default function Shell({children}:{children:React.ReactNode}){
  const path=usePathname()||'';const router=useRouter();
  const[me,setMe]=useState<any>(null);const[counts,setCounts]=useState<any>({});const[open,setOpen]=useState<string>('');const[mobile,setMobile]=useState(false);
  const[q,setQ]=useState('');const[res,setRes]=useState<any>(null);const[bell,setBell]=useState(false);const[notes,setNotes]=useState<any[]>([]);const[menu,setMenu]=useState(false);
  const searchRef=useRef<HTMLInputElement>(null);
  const signOut=()=>{if(!window.confirm('Log out of EMXIN Admin?'))return;try{localStorage.removeItem('admin_token')}catch{}router.push('/login')};
  useEffect(()=>{api('/admin/me').then(setMe).catch(()=>{});const load=()=>api('/admin/counts').then(setCounts).catch(()=>{});load();const t=setInterval(load,60000);return()=>clearInterval(t)},[]);
  useEffect(()=>{const g=NAV.find(n=>n.children?.some(c=>path.startsWith(c.href.split('?')[0])));if(g)setOpen(g.href);setMobile(false)},[path]);
  useEffect(()=>{const k=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();searchRef.current?.focus()}};addEventListener('keydown',k);return()=>removeEventListener('keydown',k)},[]);
  useEffect(()=>{if(q.trim().length<2){setRes(null);return}const t=setTimeout(()=>api('/admin/search?q='+encodeURIComponent(q.trim())).then(setRes).catch(()=>{}),250);return()=>clearTimeout(t)},[q]);
  const active=(h:string)=>path===h.split('?')[0]||path.startsWith(h.split('?')[0]+'/');
  const unread=(counts.orders_pending||0)+(counts.quantity_requests_new||0)+(counts.dealers_pending||0)+(counts.reviews_pending||0);
  return <div className={'shell'+(mobile?' nav-open':'')}>
    <aside className="side">
      <Link href="/dashboard" className="side-brand"><img src="/branding/emxin-logo-dark.png" alt="EMXIN"/><span>Admin</span></Link>
      <nav>{NAV.filter(n=>!me||!n.roles||n.roles.includes(me.role)).map(n=>{const kids=n.children?.filter(c=>!me||!c.roles||c.roles.includes(me.role));const isOpen=open===n.href;const on=active(n.href)||!!n.children?.some(c=>active(c.href));
        return <div key={n.href} className={'side-item'+(on?' on':'')}>
          {n.children?<button type="button" className="side-link" onClick={()=>setOpen(isOpen?'':n.href)} aria-expanded={isOpen}><Icon name={n.icon} size={20} stroke={1.7}/><span>{n.label}</span><Icon name="chevronDown" size={16} className={'chev'+(isOpen?' up':'')}/></button>
          :<Link className="side-link" href={n.href}><Icon name={n.icon} size={20} stroke={1.7}/><span>{n.label}</span>{n.badge&&counts[n.badge]>0&&<em className="side-badge">{counts[n.badge]}</em>}</Link>}
          {kids&&isOpen&&<div className="side-sub">{kids.map(c=><Link key={c.href} href={c.href} className={active(c.href)&&!c.href.includes('?')?'on':''}>{c.label}{c.href==='/quantity-requests'&&counts.quantity_requests_new>0&&<em className="side-badge sm">{counts.quantity_requests_new}</em>}{c.href==='/reviews'&&(counts.reviews_pending+counts.questions_pending)>0&&<em className="side-badge sm">{counts.reviews_pending+counts.questions_pending}</em>}</Link>)}</div>}
        </div>})}</nav>
      <button className="side-store side-logout" onClick={signOut}><Icon name="logout" size={18}/>Logout</button>
      <a className="side-store" href={process.env.NEXT_PUBLIC_STORE_URL||'https://emxin-dev.duckdns.org'} target="_blank" rel="noopener"><Icon name="eyeView" size={18}/>View storefront</a>
    </aside>
    <div className="side-scrim" onClick={()=>setMobile(false)}/>
    <div className="body">
      <header className="topbar">
        <button className="ib burger" aria-label="Menu" onClick={()=>setMobile(!mobile)}><Icon name="menu" size={24}/></button>
        <div className="gsearch"><Icon name="search" size={18}/><input ref={searchRef} value={q} onChange={e=>setQ(e.target.value)} onBlur={()=>setTimeout(()=>setRes(null),200)} placeholder="Search orders, customers, products..."/><kbd>Ctrl + K</kbd>
          {res&&<div className="gsearch-res">{(['orders','customers','products','dealers'] as const).map(k=>res[k]?.length?<div key={k}><h6>{k}</h6>{res[k].map((x:any)=><a key={x._id} href={k==='orders'?`/orders?open=${x.order_id}`:k==='customers'?`/customers?q=${encodeURIComponent(x.phone||x.name)}`:k==='products'?`/products?edit=${x._id}`:'/dealers'}><b>{x.order_id||x.name||x.shop_name}</b><small>{k==='orders'?`${x.customer_name} · ${x.order_status}`:k==='products'?`Stock ${x.stock}`:x.phone||x.email||x.status}</small></a>)}</div>:null)}{!['orders','customers','products','dealers'].some(k=>res[k]?.length)&&<p className="muted pad">No matches</p>}</div>}
        </div>
        <div className="top-right">
          <div className="pop-wrap"><button className="ib bell" aria-label="Notifications" onClick={()=>{setBell(!bell);if(!bell)api('/admin/notifications').then(setNotes).catch(()=>{})}}><Icon name="bell" size={23}/>{unread>0&&<i className="dot"/>}</button>
            {bell&&<div className="pop notes" onMouseLeave={()=>setBell(false)}><h6>Notifications</h6>{notes.length?notes.map((n,i)=><a key={i} href={n.href}><b>{n.title}</b><small>{n.text}</small><time>{dt(n.created_at)}</time></a>):<p className="muted pad">You're all caught up.</p>}</div>}</div>
          <div className="pop-wrap"><button className="who" onClick={()=>setMenu(!menu)}><span className="avatar">{(me?.name||'A')[0].toUpperCase()}</span><span className="who-t"><b>{me?.name||'Admin'}</b><small>{ROLE_LABEL[me?.role]||'—'}</small></span><Icon name="chevronDown" size={16}/></button>
            {menu&&<div className="pop" onMouseLeave={()=>setMenu(false)}><p className="pad muted">{me?.email}</p><button onClick={()=>router.push('/profile')}><Icon name="secure" size={17}/>Change password</button><button onClick={signOut}><Icon name="logout" size={17}/>Logout</button></div>}</div>
        </div>
      </header>
      <main className="main">{me?.must_change_password&&!path.startsWith('/profile')&&<div className="alert warn">You're using a temporary password. <Link className="lnk" href="/profile">Set your own password now</Link></div>}{children}</main>
    </div>
    <Toaster/>
  </div>;
}
