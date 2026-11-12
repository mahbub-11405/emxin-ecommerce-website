import {safeJSON} from '@/lib/api';
import ProductDetails from './ProductDetails';
import ProductViewTracker from '@/components/ProductViewTracker';
import Link from 'next/link';

export async function generateMetadata({params}:{params:Promise<{slug:string}>}){
  const {slug}=await params;const p=await safeJSON<any>('/products/'+slug,null);
  if(!p)return {title:'Product not found'};
  return {title:p.name,description:(p.description||'').slice(0,155),openGraph:{images:p.images?.[0]?[p.images[0]]:[]}};
}
export default async function Product({params}:{params:Promise<{slug:string}>}){
  const {slug}=await params;
  const[p,settings,site]=await Promise.all([safeJSON<any>('/products/'+slug,null),safeJSON<any>('/home',{}),safeJSON<any>('/site-content',{})]);
  if(!p)return <main className="wrap section empty-state"><h1>Product not found</h1><p className="muted">It may have been removed or is temporarily hidden.</p><Link className="btn" href="/shop">Browse products</Link></main>;
  const cfg=settings.settings||{};
  return <main className="wrap section-sm"><ProductViewTracker id={p._id} name={p.name}/><ProductDetails product={p} bulkThreshold={Number(cfg.bulk_threshold_qty||20)} dealerPercent={Number(cfg.bulk_discount_percent||5)} defaultBanner={site.branding?.product_banner_url||''}/></main>;
}
