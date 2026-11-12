import Link from 'next/link';
import {safeJSON} from '@/lib/api';
import ProductCard from '@/components/ProductCard';
import Icon from '@/components/Icon';
import SortSelect from './SortSelect';

export const metadata={title:'Shop'};
export default async function Shop({searchParams}:{searchParams:Promise<any>}){
  const sp=await searchParams;
  const keys=['category','brand','q','camera','availability','min_price','max_price','sort','collection'];
  const qs=new URLSearchParams();keys.forEach(k=>{if(sp[k])qs.set(k,String(sp[k]))});
  const[ps,brands,cats]=await Promise.all([safeJSON<any[]>(`/products?limit=100&${qs}`,[]),safeJSON<any[]>(`/brands${sp.category?'?category='+encodeURIComponent(sp.category):''}`,[]),safeJSON<any[]>('/categories',[])]);
  const cat=cats.find(c=>c.slug===sp.category);
  const link=(patch:Record<string,string|undefined>)=>{const n=new URLSearchParams(qs);Object.entries(patch).forEach(([k,v])=>v?n.set(k,v):n.delete(k));const s=n.toString();return '/shop'+(s?'?'+s:'')};
  const title=sp.title||(sp.collection==='offers'?'Offers':sp.collection==='new'?'New Collection':cat?.name||(sp.q?`Results for “${sp.q}”`:'All Products'));
  const Opt=({on,href,children}:{on:boolean;href:string;children:React.ReactNode})=><Link href={href} className={'flt-opt'+(on?' on':'')} aria-current={on?'true':undefined}><i/>{children}</Link>;
  return <main className="wrap section-sm">
    <nav className="crumbs"><Link href="/">Home</Link><Icon name="chevronRight" size={14}/><Link href="/shop">Shop</Link>{cat&&<><Icon name="chevronRight" size={14}/><span>{cat.name}</span></>}</nav>
    <div className="shop-head"><div><h1>{title}</h1><span className="muted">{ps.length} product{ps.length===1?'':'s'} found</span></div><SortSelect value={sp.sort||'featured'}/></div>
    <div className="shop">
      <aside className="flt" aria-label="Filters">
        <h4>Categories</h4><Opt on={!sp.category} href={link({category:undefined,brand:undefined})}>All Products</Opt>{cats.map(c=><Opt key={c.slug} on={sp.category===c.slug} href={link({category:c.slug,brand:undefined})}>{c.name}</Opt>)}
        {brands.length>0&&<><h4>Brand</h4>{brands.map(b=><Opt key={b.slug} on={sp.brand===b.slug} href={link({brand:sp.brand===b.slug?undefined:b.slug})}>{b.name}</Opt>)}</>}
        <h4>Camera</h4><Opt on={sp.camera==='with'} href={link({camera:sp.camera==='with'?undefined:'with'})}>With Camera</Opt><Opt on={sp.camera==='without'} href={link({camera:sp.camera==='without'?undefined:'without'})}>Without Camera</Opt>
        <h4>Availability</h4><Opt on={sp.availability==='in_stock'} href={link({availability:sp.availability==='in_stock'?undefined:'in_stock'})}>In Stock</Opt><Opt on={sp.availability==='out_of_stock'} href={link({availability:sp.availability==='out_of_stock'?undefined:'out_of_stock'})}>Stock Out</Opt>
        <h4>Price Range</h4><form className="flt-price" action="/shop">{keys.filter(k=>!['min_price','max_price'].includes(k)&&sp[k]).map(k=><input key={k} type="hidden" name={k} value={sp[k]}/>)}<input name="min_price" inputMode="numeric" placeholder="Min ৳" defaultValue={sp.min_price}/><span>–</span><input name="max_price" inputMode="numeric" placeholder="Max ৳" defaultValue={sp.max_price}/><button className="btn btn-sm">Go</button></form>
        {qs.toString()&&<Link className="flt-clear" href="/shop">Clear all filters</Link>}
      </aside>
      {ps.length?<div className="pc-grid three">{ps.map(p=><ProductCard p={p} key={p._id}/>)}</div>:<div className="empty-state panel"><Icon name="search" size={34}/><h3>No products match these filters</h3><Link className="btn" href="/shop">Show all products</Link></div>}
    </div>
  </main>;
}
