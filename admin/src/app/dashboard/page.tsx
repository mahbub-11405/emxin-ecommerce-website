'use client';
import {useCallback,useEffect,useState} from 'react';
import Link from 'next/link';
import Shell from '@/components/Shell';
import Icon from '@/components/Icon';
import {Status,Loading} from '@/components/ui';
import {api,tk,num,dt} from '@/lib/api';

const RANGES=[['today','Today'],['yesterday','Yesterday'],['7d','Last 7 Days'],['30d','Last 30 Days']] as const;
const METHOD_COLORS:Record<string,string>={cod:'#8b5cf6',bkash:'#22c55e',paystation:'#22c55e',nagad:'#f97316',bank:'#3b82f6',card:'#0ea5e9',rocket:'#a855f7',other:'#94a3b8'};
const PAY_ICON:Record<string,{icon:string;cls:string;label:string}>={cod:{icon:'cube',cls:'pi-cod',label:'COD'},paystation:{icon:'lockCard',cls:'pi-digital',label:'Digital'},bkash:{icon:'bolt',cls:'pi-bkash',label:'bKash'},nagad:{icon:'bolt',cls:'pi-nagad',label:'Nagad'},bank:{icon:'ledger',cls:'pi-bank',label:'Bank'},card:{icon:'lockCard',cls:'pi-digital',label:'Card'}};

function Spark({data,color}:{data:number[];color:string}){
  const d=data?.length?data:[0,0];const max=Math.max(1,...d);const min=Math.min(...d);const w=96,h=40;
  const pts=d.map((v,i)=>[i/(d.length-1||1)*w,h-4-((v-min)/((max-min)||1))*(h-10)]);
  const path=pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
  return <svg className="spark" viewBox={`0 0 ${w} ${h}`} aria-hidden="true"><defs><linearGradient id={'sg'+color.slice(1)} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".25"/><stop offset="1" stopColor={color} stopOpacity="0"/></linearGradient></defs><path d={path+` L${w} ${h} L0 ${h} Z`} fill={`url(#sg${color.slice(1)})`}/><path d={path} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
function Change({v}:{v:number|null|undefined}){if(v===null||v===undefined)return <span className="chg flat">— vs previous</span>;const up=v>=0;return <span className={'chg '+(up?'up':'down')}>{up?'▲':'▼'} {up?'+':''}{v}% <span>vs previous</span></span>}

function LineChart({labels,a,b}:{labels:string[];a:number[];b:number[]}){
  const W=760,H=360,L=44,R=14,T=14,B=34;const max=Math.max(5,...a,...b);const step=Math.pow(10,Math.floor(Math.log10(max)));const top=Math.ceil(max/(step/2))*(step/2);
  const ticks=[0,1,2,3,4,5].map(i=>Math.round(top/5*i));
  const x=(i:number)=>L+(labels.length>1?i/(labels.length-1):0.5)*(W-L-R);const y=(v:number)=>T+(1-v/top)*(H-T-B);
  const line=(s:number[])=>s.map((v,i)=>{if(i===0)return `M${x(0)},${y(v)}`;const px=x(i-1),py=y(s[i-1]),cx=x(i),cy=y(v),m=(cx-px)/2;return `C${px+m},${py} ${cx-m},${cy} ${cx},${cy}`}).join(' ');
  const area=(s:number[])=>line(s)+` L${x(s.length-1)},${y(0)} L${x(0)},${y(0)} Z`;
  const[hov,setHov]=useState<number|null>(null);
  const every=Math.max(1,Math.ceil(labels.length/12));
  return <div className="lc"><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Visitors and purchases chart" onMouseLeave={()=>setHov(null)}>
    <defs><linearGradient id="ga" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#3b6cf6" stopOpacity=".28"/><stop offset="1" stopColor="#3b6cf6" stopOpacity=".02"/></linearGradient><linearGradient id="gb" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#22c55e" stopOpacity=".22"/><stop offset="1" stopColor="#22c55e" stopOpacity="0"/></linearGradient></defs>
    {ticks.map(t=><g key={t}><line x1={L} x2={W-R} y1={y(t)} y2={y(t)} stroke="#eef1f6"/><text x={L-10} y={y(t)+4} textAnchor="end" className="ax">{t}</text></g>)}
    {labels.map((l,i)=>i%every===0&&<text key={i} x={x(i)} y={H-10} textAnchor="middle" className="ax">{l}</text>)}
    <path d={area(a)} fill="url(#ga)"/><path d={line(a)} fill="none" stroke="#3b6cf6" strokeWidth="2.6"/>
    <path d={area(b)} fill="url(#gb)"/><path d={line(b)} fill="none" stroke="#22c55e" strokeWidth="2.6"/>
    {a.map((v,i)=><circle key={'a'+i} cx={x(i)} cy={y(v)} r={hov===i?6:4.5} fill="#3b6cf6" stroke="#fff" strokeWidth="2"/>)}
    {b.map((v,i)=><circle key={'b'+i} cx={x(i)} cy={y(v)} r={hov===i?6:4.5} fill="#22c55e" stroke="#fff" strokeWidth="2"/>)}
    {labels.map((_,i)=><rect key={'h'+i} x={x(i)-(W-L-R)/labels.length/2} y={T} width={(W-L-R)/labels.length} height={H-T-B} fill="transparent" onMouseEnter={()=>setHov(i)}/>)}
    {hov!==null&&<g pointerEvents="none"><line x1={x(hov)} x2={x(hov)} y1={T} y2={H-B} stroke="#cbd5e1" strokeDasharray="3 3"/><g transform={`translate(${Math.min(x(hov)+10,W-150)},${T+6})`}><rect width="140" height="58" rx="8" fill="#0b1838"/><text x="12" y="20" fill="#fff" fontSize="12" fontWeight="700">{labels[hov]}</text><text x="12" y="37" fill="#93b4ff" fontSize="12">Visitors: {a[hov]}</text><text x="12" y="51" fill="#86efac" fontSize="12">Purchases: {b[hov]}</text></g></g>}
  </svg></div>;
}
function Donut({items,total}:{items:any[];total:number}){
  const R=58,C=2*Math.PI*R;let off=0;
  return <div className="donut"><svg viewBox="0 0 160 160" aria-hidden="true"><circle cx="80" cy="80" r={R} fill="none" stroke="#eef1f6" strokeWidth="20"/>
    {items.map((m,i)=>{const len=total?m.count/total*C:0;const el=<circle key={i} cx="80" cy="80" r={R} fill="none" stroke={METHOD_COLORS[m.key]||'#94a3b8'} strokeWidth="20" strokeDasharray={`${Math.max(0,len-1.5)} ${C}`} strokeDashoffset={-off} transform="rotate(-90 80 80)"/>;off+=len;return el})}
  </svg><div className="donut-c"><b>{num(total)}</b><span>Orders</span></div></div>;
}

export default function Dashboard(){
  const[range,setRange]=useState('today');const[custom,setCustom]=useState({start:'',end:''});const[showCustom,setShowCustom]=useState(false);
  const[d,setD]=useState<any>(null);const[err,setErr]=useState('');const[glance,setGlance]=useState(true);
  const load=useCallback(()=>{const qs=range==='custom'?`range=custom&start=${custom.start}&end=${custom.end}`:`range=${range}`;api('/admin/dashboard/v2?'+qs).then(x=>{setD(x);setErr('')}).catch(e=>setErr(e.message))},[range,custom]);
  useEffect(()=>{load();const t=setInterval(load,60000);return()=>clearInterval(t)},[load]);
  const label=range==='custom'?'Custom':RANGES.find(r=>r[0]===range)?.[1]||'Today';
  const c=d?.cards;
  return <Shell>
    <div className="dash-head"><div><h1>Dashboard</h1><p>Overview of your store performance</p></div>
      <div className="dash-right"><div className="seg">{RANGES.map(([k,l])=><button key={k} className={range===k?'on':''} onClick={()=>{setRange(k);setShowCustom(false)}}>{l}</button>)}<button className={range==='custom'?'on':''} onClick={()=>setShowCustom(!showCustom)}><Icon name="calendar" size={16}/>Custom</button></div>
        {showCustom&&<div className="custom-range"><input type="date" value={custom.start} onChange={e=>setCustom({...custom,start:e.target.value})}/><span>to</span><input type="date" value={custom.end} onChange={e=>setCustom({...custom,end:e.target.value})}/><button className="btn btn-sm" disabled={!custom.start||!custom.end} onClick={()=>{setRange('custom');setShowCustom(false);setTimeout(load,0)}}>Apply</button></div>}
        <div className="updated">Last updated: {d?dt(d.last_updated):'—'} <span className="live"><i/>Live</span></div></div></div>
    {err&&<div className="alert err">{err}</div>}
    {!d?<Loading/>:<>
    <div className="kpis">
      <div className="kpi"><span className="kpi-ico k-blue"><Icon name="customers" size={24}/></span><div><small>{label}'s Visitors</small><b>{num(c.visitors.value)}</b><Change v={c.visitors.change}/></div><Spark data={c.visitors.spark} color="#3b6cf6"/></div>
      <div className="kpi"><span className="kpi-ico k-green"><Icon name="cartPlain" size={24}/></span><div><small>{label}'s Purchases</small><b>{num(c.purchases.value)}</b><Change v={c.purchases.change}/></div><Spark data={c.purchases.spark} color="#22c55e"/></div>
      <div className="kpi"><span className="kpi-ico k-sky"><span className="tk">৳</span></span><div><small>{label}'s Sales (Paid)</small><b>{tk(c.sales.value)}</b><Change v={c.sales.change}/></div><Spark data={c.sales.spark} color="#3b6cf6"/></div>
      <div className="kpi"><span className="kpi-ico k-purple"><Icon name="cube" size={24}/></span><div><small>Total Orders ({label})</small><b>{num(c.orders.value)}</b><span className="chg flat">Paid: <b>{c.orders.paid}</b> &nbsp;|&nbsp; COD: <b>{c.orders.cod}</b></span></div><Spark data={c.orders.spark} color="#8b5cf6"/></div>
    </div>
    <div className="dash-mid">
      <section className="card"><div className="card-h"><h2>Visitors vs Purchases ({label})</h2><div className="legend"><span><i style={{background:'#3b6cf6'}}/>Visitors</span><span><i style={{background:'#22c55e'}}/>Purchases</span></div></div><LineChart labels={d.chart.labels} a={d.chart.visitors} b={d.chart.purchases}/></section>
      {glance&&<section className="card glance"><div className="card-h"><h2>{label} at a Glance</h2><button className="ib" aria-label="Hide" onClick={()=>setGlance(false)}><Icon name="close" size={18}/></button></div>
        {[['customers','Visitors',d.glance.visitors,'g-blue'],['eyeView','Product Views',d.glance.product_views,'g-purple'],['cartPlain','Add to Cart',d.glance.add_to_cart,'g-blue'],['arrowFwd','Checkout Started',d.glance.checkout_started,'g-ink'],['bag','Orders Placed',d.glance.orders_placed,'g-ink']].map(([ic,l,v,cl])=><div className="gl-row" key={l as string}><Icon name={ic as string} size={20} className={cl as string}/><span>{l}</span><b><i/>{num(v)}</b></div>)}
        <div className="gl-row strong"><span className="okdot"><Icon name="check" size={13} stroke={3}/></span><span>Successful Purchases</span><b>{num(d.glance.successful_purchases)}</b></div>
        {d.glance.visitors>0&&<p className="muted tiny">Conversion: {(d.glance.successful_purchases/d.glance.visitors*100).toFixed(2)}% · Cart → checkout: {d.glance.add_to_cart?Math.round(d.glance.checkout_started/d.glance.add_to_cart*100):0}%</p>}
      </section>}
      <section className="card"><div className="card-h"><h2>Orders by Payment Method ({label})</h2></div>
        <Donut items={d.payment_methods.items} total={d.payment_methods.total}/>
        <div className="pm-list">{d.payment_methods.items.length?d.payment_methods.items.map((m:any)=><div key={m.key}><i style={{background:METHOD_COLORS[m.key]||'#94a3b8'}}/><span>{m.label}</span><b>{m.count} ({m.percent}%)</b></div>):<p className="muted">No orders in this period.</p>}</div>
      </section>
    </div>
    <div className="dash-bottom">
      <section className="card"><div className="card-h"><h2>Sales &amp; Visitors Summary</h2></div><table className="tbl summary"><thead><tr><th>Period</th><th>Visitors</th><th>Purchases</th><th>Conversion</th><th className="r">Sales (Paid)</th></tr></thead><tbody>{d.summary.map((r:any,i:number)=><tr key={r.period} className={i===0?'hl':''}><td><b>{r.period}</b></td><td>{num(r.visitors)}</td><td>{num(r.purchases)}</td><td>{r.conversion.toFixed(2)}%</td><td className="r"><b>{tk(r.sales)}</b></td></tr>)}</tbody></table></section>
      <section className="card"><div className="card-h"><h2>Recent Orders ({label})</h2><Link className="lnk" href="/orders">View All Orders <Icon name="arrowRight" size={16}/></Link></div>
        <table className="tbl"><thead><tr><th>Order ID</th><th>Customer</th><th>Amount</th><th>Payment</th><th>Status</th></tr></thead><tbody>{d.recent_orders.length?d.recent_orders.map((o:any)=>{const pk=o.payment_channel||o.payment_method;const pi=PAY_ICON[pk]||PAY_ICON.paystation;return <tr key={o.order_id}><td><Link className="lnk" href={`/orders?open=${o.order_id}`}>#{o.order_id}</Link></td><td>{o.customer_name}</td><td>{tk(o.pricing?.grand_total)}</td><td><span className="pay"><span className={'pi '+pi.cls}><Icon name={pi.icon} size={13} stroke={2.2}/></span>{pk==='cod'?'COD':pi.label}</span></td><td><Status s={o.order_status}/></td></tr>}):<tr><td colSpan={5} className="muted">No orders yet.</td></tr>}</tbody></table></section>
    </div>
    {d.low_stock?.length>0&&<section className="card lowstock"><div className="card-h"><h2>Low stock alerts</h2><Link className="lnk" href="/products">Manage inventory <Icon name="arrowRight" size={16}/></Link></div><div className="ls-list">{d.low_stock.map((p:any)=><Link key={p._id} href={`/products?edit=${p._id}`}><b>{p.name}</b><span className={p.stock<=0?'out':''}>{p.stock<=0?'Out of stock':`${p.stock} left`}</span></Link>)}</div></section>}
    </>}
  </Shell>;
}
