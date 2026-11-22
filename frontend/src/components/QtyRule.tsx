'use client';
import Link from 'next/link';
import Icon from './Icon';

/** Retail: 1–5 pcs of each product. Dealer / bulk: 20+ pcs in total. Nothing in between (6–19 of one product). */
type Line={product_id:string;quantity:number;[k:string]:any};

/** Bring every over-the-limit product down to the retail cap (takes pieces off its last colour first). */
export function toCap<T extends Line>(items:T[],cap:number,over:string[]):T[]{
  const left:Record<string,number>={};over.forEach(id=>left[id]=items.reduce((n,x)=>x.product_id===id?n+x.quantity:n,0)-cap);
  return [...items].reverse().map(x=>{const l=left[x.product_id];if(!l||l<=0)return x;const take=Math.min(l,x.quantity-1);left[x.product_id]=l-take;return {...x,quantity:x.quantity-take}}).reverse();
}
/** Pieces that can still be added to the cart without going above the stock (all colours of a product together). */
export function roomLeft(items:Line[],stock:Record<string,number>):number{
  const used:Record<string,number>={};items.forEach(x=>used[x.product_id]=(used[x.product_id]||0)+x.quantity);
  return Object.keys(used).reduce((n,id)=>n+Math.max(0,(stock[id]??0)-used[id]),0);
}
/** Add the missing pieces so the order reaches the dealer / bulk minimum: the over-the-limit products first, never above their stock. */
export function toBulk<T extends Line>(items:T[],bulk:number,over:string[],stock?:Record<string,number>):T[]{
  let add=bulk-items.reduce((n,x)=>n+x.quantity,0);if(add<=0)return items;
  const used:Record<string,number>={};items.forEach(x=>used[x.product_id]=(used[x.product_id]||0)+x.quantity);
  const out=items.map(x=>({...x}));
  const order=out.map((_,i)=>i).sort((a,b)=>Number(over.includes(out[b].product_id))-Number(over.includes(out[a].product_id)));
  for(const i of order){if(add<=0)break;const id=out[i].product_id;const room=stock?Math.max(0,(stock[id]??0)-used[id]):Infinity;const k=Math.min(add,room);if(k>0){out[i].quantity+=k;used[id]+=k;add-=k}}
  return out;
}

/** short = there is not enough stock for a dealer order: explain how to buy at the retail price (several orders of `cap`) or request 20+. */
export type Short={name:string;stock:number;have:number};
export default function QtyRule({qty,cap,bulk,names,dealer,onCap,onBulk,short,requestHref}:{qty:number;cap:number;bulk:number;names:string[];dealer?:boolean;onCap?:()=>void;onBulk?:()=>void;short?:Short|null;requestHref?:string}){
  const need=Math.max(0,bulk-qty);const pct=Math.min(100,Math.round(qty/bulk*100));
  if(short){
    const want=Math.min(short.have,short.stock);const orders=Math.max(1,Math.ceil(want/cap));
    const plan=Array.from({length:orders},(_,i)=>Math.min(cap,want-i*cap));
    return <div className="qrule" role="alert">
      <div className="qrule-top"><span className="qrule-ic"><Icon name="info" size={22}/></span><div>
        <b className="qrule-title">Only <u>{short.stock} pcs</u> of {short.name} in stock</b>
        <p>A dealer order needs <b>{bulk}+ pcs</b>, so it is not possible from the stock right now. Retail orders are up to <b>{cap} pcs</b> of each product per order.</p>
        {orders>1?<p>To buy all <b>{want} pcs</b> at the retail price, place <b>{orders} separate orders</b>: finish one order, then order again.</p>
          :<p>Order <b>{want} pcs</b> at the retail price now.</p>}</div></div>
      {orders>1&&<ol className="qrule-steps">{plan.map((n,i)=><li key={i}><b>Order {i+1}</b><span>{n} pcs</span></li>)}</ol>}
      <div className="qrule-act">{onCap&&<button type="button" className="btn btn-sm" onClick={onCap}><Icon name="check" size={15}/>{orders>1?`Keep ${cap} pcs now (order 1 of ${orders})`:`Keep ${cap} pcs (retail)`}</button>}
        {requestHref&&<Link className="btn btn-sm btn-outline" href={requestHref}><Icon name="send" size={15}/>Request {bulk}+ pcs (dealer price)</Link>}</div>
      {requestHref&&<p className="qrule-note">Need {bulk}+ pcs? Send a quantity request: EMXIN will arrange the stock and contact you with the dealer price.</p>}
    </div>;
  }
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

/** Works out `short` and the request link for the cart / checkout from the products' stock. */
export function qtyRuleStock(items:Line[],byId:Record<string,any>,bulk:number,over:string[]){
  const stock:Record<string,number>=Object.fromEntries(Object.entries(byId).map(([id,p])=>[id,Number(p?.stock)||0]));
  const qty=items.reduce((n,x)=>n+x.quantity,0);
  const canBulk=roomLeft(items,stock)>=bulk-qty;
  const p=byId[over[0]];const have=items.reduce((n,x)=>x.product_id===over[0]?n+x.quantity:n,0);
  return {stock,canBulk,short:!canBulk&&p?{name:p.name,stock:Number(p.stock)||0,have}:null,requestHref:p?.slug?`/product/${p.slug}?request=${bulk}`:'/shop'};
}
