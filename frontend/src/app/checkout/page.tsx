import Checkout from './Checkout';
import {safeJSON} from '@/lib/api';
export const metadata={title:'Checkout'};
export default async function Page({searchParams}:{searchParams:Promise<any>}){
  const sp=await searchParams;const home=await safeJSON<any>('/home',{});
  return <main className="wrap section-sm"><h1 className="page-title">Checkout</h1><Checkout productId={sp.product||''} initialQty={Math.max(1,Number(sp.qty)||1)} initialColor={sp.color||'Black'} settings={home.settings||{}}/></main>;
}
