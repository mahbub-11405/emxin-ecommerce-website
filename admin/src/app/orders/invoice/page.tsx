'use client';
import {useEffect,useState} from 'react';
import {api,tk,dt} from '@/lib/api';
export default function Invoice(){
  const[o,setO]=useState<any>(null);const[err,setErr]=useState('');
  useEffect(()=>{const id=new URLSearchParams(location.search).get('id');if(!id)return;api(`/admin/orders/${id}/detail`).then(d=>{setO(d.order);setTimeout(()=>window.print(),400)}).catch(e=>setErr(e.message))},[]);
  if(err)return <p style={{padding:40}}>{err}</p>;if(!o)return <p style={{padding:40}}>Loading…</p>;const p=o.pricing||{};
  return <div className="invoice"><header><img src="/branding/emxin-logo-light.png" alt="EMXIN"/><div><h1>INVOICE</h1><p>#{o.order_id}<br/>{dt(o.created_at)}</p></div></header>
    <section className="inv-two"><div><h4>Bill to</h4><p><b>{o.customer_name}</b>{o.shop_name&&<><br/>{o.shop_name}</>}<br/>{o.phone}<br/>{o.address}, {o.district}</p></div><div><h4>Payment</h4><p>{o.payment_method?.toUpperCase()} · {o.payment_status}<br/>Order status: {o.order_status}</p></div></section>
    <table><thead><tr><th>Item</th><th>Colour</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead><tbody>{o.items.map((i:any,k:number)=><tr key={k}><td>{i.name}</td><td>{i.frame_color}</td><td>{i.quantity}</td><td>{tk(i.unit_price)}</td><td>{tk(i.unit_price*i.quantity)}</td></tr>)}</tbody></table>
    <div className="inv-tot">{[['Subtotal',p.subtotal],['Discounts',-(p.bulk_discount+p.coupon_discount+p.payment_discount)],['Delivery',p.delivery_charge+(p.estimated_shipping||0)]].map(([l,v])=><div key={l as string}><span>{l}</span><span>{tk(v)}</span></div>)}<div className="g"><span>Grand total</span><b>{tk(p.grand_total)}</b></div><div><span>Collect on delivery</span><b>{tk(p.cod_due)}</b></div></div>
    <footer>Thank you for shopping with EMXIN Technologies.</footer></div>;
}
