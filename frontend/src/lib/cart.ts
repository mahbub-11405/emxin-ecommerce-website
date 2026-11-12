'use client';
export type CartItem={product_id:string;quantity:number;frame_color:string};
const KEY='emxin_cart';
export function readCart():CartItem[]{try{const v=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(v)?v:[]}catch{return[]}}
export function writeCart(items:CartItem[]){try{localStorage.setItem(KEY,JSON.stringify(items))}catch{}window.dispatchEvent(new Event('emxin:cart'))}
export function addToCart(product_id:string,quantity=1,frame_color='Black'){
  const cart=readCart();const found=cart.find(x=>x.product_id===product_id&&x.frame_color===frame_color);
  if(found)found.quantity=Math.min(9999,found.quantity+quantity);else cart.push({product_id,quantity,frame_color});
  writeCart(cart);
}
export const cartCount=()=>readCart().reduce((n,x)=>n+x.quantity,0);
