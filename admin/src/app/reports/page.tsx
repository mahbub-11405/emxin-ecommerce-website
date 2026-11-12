'use client';
import {useEffect,useState} from 'react';
import Shell from '@/components/Shell';
import Icon from '@/components/Icon';
import {PageHead,Loading,toast,Status} from '@/components/ui';
import {api,tk,num,downloadCSV} from '@/lib/api';
function Bars({labels,values,money}:{labels:string[];values:number[];money?:boolean}){const max=Math.max(1,...values);const every=Math.max(1,Math.ceil(labels.length/10));
  return <div className="bars">{values.map((v,i)=><div key={i} className="bar" title={`${labels[i]}: ${money?tk(v):v}`}><i style={{height:`${v/max*100}%`}}/><small>{i%every===0?labels[i]:''}</small></div>)}</div>}
export default function Reports(){
  const[range,setRange]=useState('30d');const[d,setD]=useState<any>(null);const[s,setS]=useState('');const[e,setE]=useState('');
  const load=(r=range)=>{setD(null);api(`/admin/reports/overview?range=${r}${r==='custom'?`&start=${s}&end=${e}`:''}`).then(setD).catch(x=>toast.err(x.message))};useEffect(()=>{load()},[range]);
  const t=d?.totals;
  return <Shell><PageHead title="Reports & Analytics" sub="Sales, conversion, best sellers, districts and inventory.">
    <div className="seg">{[['7d','7 days'],['30d','30 days']].map(([k,l])=><button key={k} className={range===k?'on':''} onClick={()=>setRange(k)}>{l}</button>)}</div>
    <input type="date" value={s} onChange={x=>setS(x.target.value)}/><input type="date" value={e} onChange={x=>setE(x.target.value)}/><button className="btn btn-sm btn-soft" disabled={!s||!e} onClick={()=>{setRange('custom');load('custom')}}>Apply</button></PageHead>
    {!d?<Loading/>:<>
    <div className="mini-kpis six">{[['Paid sales',tk(t.paid_sales)],['Booked value',tk(t.booked_value)],['Orders',num(t.orders)],['Avg. order',tk(t.avg_order_value)],['Conversion',t.conversion+'%'],['New customers',num(t.new_customers)],['Discounts given',tk(t.discounts)],['Delivery charged',tk(t.delivery_collected)],['Visitors',num(t.visitors)],['Cancelled / returned',num(t.cancelled_or_returned)]].map(([l,v])=><div key={l}><small>{l}</small><b>{v}</b></div>)}</div>
    <div className="two-col"><section className="card"><h2>Paid sales</h2><Bars labels={d.labels} values={d.series.sales} money/></section><section className="card"><h2>Orders</h2><Bars labels={d.labels} values={d.series.orders}/></section></div>
    <div className="two-col">
      <section className="card"><div className="card-h"><h2>Best sellers</h2><button className="btn btn-sm btn-ghost" onClick={()=>downloadCSV('best-sellers.csv',d.top_products,[['Product','name'],['Qty','qty'],['Revenue','revenue']])}><Icon name="download" size={15}/>CSV</button></div><table className="tbl compact"><thead><tr><th>Product</th><th>Qty</th><th className="r">Revenue</th></tr></thead><tbody>{d.top_products.map((p:any)=><tr key={p.name}><td>{p.name}</td><td>{p.qty}</td><td className="r">{tk(p.revenue)}</td></tr>)}</tbody></table>{!d.top_products.length&&<p className="muted">No sales in this period.</p>}</section>
      <section className="card"><h2>Orders by district</h2>{d.districts.map((x:any)=><div className="hbar" key={x.district}><span>{x.district}</span><i><em style={{width:`${x.orders/(d.districts[0]?.orders||1)*100}%`}}/></i><b>{x.orders}</b></div>)}{!d.districts.length&&<p className="muted">No data.</p>}
        <h3 className="mt">Order status</h3><div className="row wrap">{Object.entries(d.status_split).map(([k,v]:any)=><span key={k}><Status s={k}/> {v}</span>)}</div></section></div>
    <section className="card"><div className="card-h"><h2>Inventory</h2><button className="btn btn-sm btn-ghost" onClick={()=>downloadCSV('inventory.csv',d.inventory,[['Product','name'],['Stock','stock'],['Reserved','reserved'],['Sold','sold_count'],['Status','status'],['Price','price']])}><Icon name="download" size={15}/>CSV</button></div><table className="tbl compact"><thead><tr><th>Product</th><th>Status</th><th>Available</th><th>Reserved</th><th>Sold</th><th className="r">Stock value</th></tr></thead><tbody>{d.inventory.map((p:any)=><tr key={p._id}><td>{p.name}</td><td><Status s={p.status}/></td><td><b className={p.stock<=5?'err':''}>{p.stock}</b></td><td>{p.reserved||0}</td><td>{p.sold_count||0}</td><td className="r">{tk((p.sale_price||p.price)*Math.max(0,p.stock))}</td></tr>)}</tbody></table></section></>}
  </Shell>;
}
