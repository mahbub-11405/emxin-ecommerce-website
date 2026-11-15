'use client';
export type CartItem={product_id:string;quantity:number;frame_color:string};
const KEY='emxin_cart';
export function readCart():CartItem[]{try{const v=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(v)?v:[]}catch{return[]}}
export function writeCart(items:CartItem[]){try{localStorage.setItem(KEY,JSON.stringify(items))}catch{}window.dispatchEvent(new Event('emxin:cart'))}
/** How many of this product (all colours) are already in the cart. */
export const inCart=(product_id:string,cart=readCart())=>cart.filter(x=>x.product_id===product_id).reduce((n,x)=>n+x.quantity,0);
/** Adds to the cart without ever going above the stock (all colours of the product together).
 *  Returns how many were actually added (0 = the cart already holds all the stock). */
export function addToCart(product_id:string,quantity=1,frame_color='Black',stock?:number):number{
  const cart=readCart();
  const room=stock==null||!isFinite(Number(stock))?9999:Math.max(0,Number(stock)-inCart(product_id,cart));
  const add=Math.min(quantity,room);if(add<=0)return 0;
  const found=cart.find(x=>x.product_id===product_id&&x.frame_color===frame_color);
  if(found)found.quantity+=add;else cart.push({product_id,quantity:add,frame_color});
  writeCart(cart);return add;
}
export const cartCount=()=>readCart().reduce((n,x)=>n+x.quantity,0);
