import Link from 'next/link';

/** An order as a bill: one row per product (qty × price = amount), then discounts, delivery and what is paid / still to pay. */
const tk=(n:any)=>'৳ '+Math.round(Math.abs(Number(n)||0)).toLocaleString('en-IN');

export function payLine(o:any):{label:string;amount:number;tone:'good'|'due'|'muted'}[]{
  const p=o.pricing||{};const grand=Number(p.grand_total)||0;const adv=Number(p.advance_required)||0;const cod=Number(p.cod_due)||0;const s=o.payment_status;
  if(o.order_status==='Cancelled'||o.order_status==='Returned')return [{label:s==='Refunded'?'Refunded':s==='Paid'?'Paid (refund by EMXIN)':'Nothing to pay',amount:s==='Unpaid'?0:grand,tone:'muted'}];
  if(s==='Paid')return [{label:'Total paid',amount:grand,tone:'good'}];
  if(s==='Advance Paid')return [{label:'Advance paid',amount:adv,tone:'good'},{label:'Pay on delivery',amount:cod||grand-adv,tone:'due'}];
  if(s==='Pending Advance Payment')return [{label:'Advance to pay now',amount:adv,tone:'due'},{label:'Then pay on delivery',amount:cod||grand-adv,tone:'due'}];
  if(o.payment_method==='cod')return [{label:'Pay on delivery',amount:cod||grand,tone:'due'}];
  return [{label:'Total to pay',amount:grand,tone:'due'}];
}

export default function OrderBill({o}:{o:any}){
  const items=o.items||[];const p=o.pricing||{};const pcs=items.reduce((n:number,i:any)=>n+(Number(i.quantity)||0),0);
  const extra=([['Dealer discount',-p.bulk_discount],['Coupon'+(o.coupon_code?` (${o.coupon_code})`:''),-p.coupon_discount],['Advance payment discount'+(p.digital_payment_discount_percent?` (${p.digital_payment_discount_percent}%)`:''),-p.payment_discount],['Delivery charge',p.delivery_charge],['Extra shipping',p.estimated_shipping]] as [string,number][]).filter(([,v])=>Number(v));
  return <div className="bill">
    <table>
      <thead><tr><th className="bill-n">#</th><th>Product</th><th className="r">Qty</th><th className="r">Price</th><th className="r">Amount</th></tr></thead>
      <tbody>{items.map((i:any,k:number)=><tr key={k}><td className="bill-n">{k+1}</td>
        <td>{i.slug?<Link href={`/product/${i.slug}`}><b>{i.name}</b></Link>:<b>{i.name}</b>}{i.frame_color&&<small>{i.frame_color}</small>}</td>
        <td className="r">{i.quantity} pc{i.quantity===1?'':'s'}</td><td className="r">{tk(i.unit_price)}</td><td className="r"><b>{tk((Number(i.unit_price)||0)*(Number(i.quantity)||0))}</b></td></tr>)}</tbody>
      <tfoot>
        <tr><td className="bill-n"/><td>Subtotal</td><td className="r">{pcs} pc{pcs===1?'':'s'}</td><td/><td className="r">{tk(p.subtotal)}</td></tr>
        {extra.map(([l,v])=><tr key={l} className={v<0?'good':''}><td className="bill-n"/><td colSpan={3}>{l}</td><td className="r">{v<0?'− ':'+ '}{tk(v)}</td></tr>)}
        <tr className="bill-tot"><td className="bill-n"/><td colSpan={3}>Total</td><td className="r">{tk(p.grand_total)}</td></tr>
      </tfoot>
    </table>
    <div className="bill-pay">{payLine(o).map(x=><div key={x.label} className={x.tone}><span>{x.label}</span><b>{tk(x.amount)}</b></div>)}</div>
  </div>;
}
