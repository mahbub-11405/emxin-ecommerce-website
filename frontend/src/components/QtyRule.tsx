'use client';
import Icon from './Icon';

/** Retail: 1–5 pcs of each product. Dealer / bulk: 20+ pcs in total. Nothing in between (6–19 of one product). */
type Line={product_id:string;quantity:number;[k:string]:any};

/** Bring every over-the-limit product down to the retail cap (takes pieces off its last colour first). */
export function toCap<T extends Line>(items:T[],cap:number,over:string[]):T[]{
  const left:Record<string,number>={};over.forEach(id=>left[id]=items.reduce((n,x)=>x.product_id===id?n+x.quantity:n,0)-cap);
  return [...items].reverse().map(x=>{const l=left[x.product_id];if(!l||l<=0)return x;const take=Math.min(l,x.quantity-1);left[x.product_id]=l-take;return {...x,quantity:x.quantity-take}}).reverse();
}
/** Add the missing pieces to the first over-the-limit product so the order reaches the dealer / bulk minimum. */
export function toBulk<T extends Line>(items:T[],bulk:number,over:string[]):T[]{
  const have=items.reduce((n,x)=>n+x.quantity,0);const add=bulk-have;if(add<=0)return items;
  const i=Math.max(0,items.findIndex(x=>over.includes(x.product_id)));
  return items.map((x,j)=>j===i?{...x,quantity:x.quantity+add}:x);
}

export default function QtyRule({qty,cap,bulk,names,dealer,onCap,onBulk}:{qty:number;cap:number;bulk:number;names:string[];dealer?:boolean;onCap?:()=>void;onBulk?:()=>void}){
  const need=Math.max(0,bulk-qty);const pct=Math.min(100,Math.round(qty/bulk*100));
  return <div className="qrule" role="alert">
    <div className="qrule-top"><span className="qrule-ic"><Icon name="info" size={22}/></span><div>
      <b className="qrule-title">{dealer?<>As a dealer, order <u>{bulk}+ pcs</u> in total</>:<>{qty} pcs is between retail and dealer quantity</>}</b>
      <p>{dealer?<>Dealer price starts at <b>{bulk} pcs</b>. You have <b>{qty} pcs</b>, add <b>{need} more</b> to order as a dealer, or order up to <b>{cap} pcs</b> of each product at the retail price.</>
        :<>Retail: up to <b>{cap} pcs of each product</b>. Dealer / bulk: <b>{bulk}+ pcs</b> in total. {names.length>0&&<>Too many of <b>{names.join(', ')}</b>.</>}</>}</p></div></div>
    <div className="qrule-bar" aria-hidden="true"><i style={{width:pct+'%'}}/><span>{qty} / {bulk} pcs</span></div>
    <div className="qrule-act">{onBulk&&<button type="button" className="btn btn-sm" onClick={onBulk}><Icon name="plus" size={15}/>Make it {bulk} pcs{dealer?' (dealer price)':''}</button>}
      {onCap&&<button type="button" className="btn btn-sm btn-outline" onClick={onCap}>Keep {cap} pcs each (retail)</button>}</div>
  </div>;
}
