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
  // pool = everything the search / collection allows; each filter's count is worked out from it, so an option that would show 0 products is greyed out
  const poolQs=new URLSearchParams();['q','collection'].forEach(k=>{if(sp[k])poolQs.set(k,String(sp[k]))});
  const[ps,brands,cats,pool]=await Promise.all([safeJSON<any[]>(`/products?limit=100&${qs}`,[]),safeJSON<any[]>(`/brands${sp.category?'?category='+encodeURIComponent(sp.category):''}`,[]),safeJSON<any[]>('/categories',[]),safeJSON<any[]>(`/products?limit=100&${poolQs}`,[])]);
  const price=(p:any)=>Number(p.sale_price||p.price||0);
  const test:Record<string,(p:any)=>boolean>={
    category:p=>!sp.category||p.category_slug===sp.category, brand:p=>!sp.brand||p.brand_slug===sp.brand,
    camera:p=>!sp.camera||(sp.camera==='with'?!!p.has_camera:!p.has_camera),
    availability:p=>!sp.availability||(sp.availability==='in_stock'?Number(p.stock)>0:Number(p.stock)<=0),
    price:p=>(!sp.min_price||price(p)>=Number(sp.min_price))&&(!sp.max_price||price(p)<=Number(sp.max_price))};
  const except=(k:string)=>pool.filter(p=>Object.entries(test).every(([n,t])=>n===k||t(p)));
  const count=(k:string,f:(p:any)=>boolean)=>except(k).filter(f).length;
  const camPool=except('camera');const showCamera=!!sp.camera||(camPool.some(p=>p.has_camera)&&camPool.some(p=>!p.has_camera));
  const cat=cats.find(c=>c.slug===sp.category);
  const link=(patch:Record<string,string|undefined>)=>{const n=new URLSearchParams(qs);Object.entries(patch).forEach(([k,v])=>v?n.set(k,v):n.delete(k));const s=n.toString();return '/shop'+(s?'?'+s:'')};
  const title=sp.title||(sp.collection==='offers'?'Offers':sp.collection==='new'?'New Collection':cat?.name||(sp.q?`Results for “${sp.q}”`:'All Products'));
  const Opt=({on,href,n,children}:{on:boolean;href:string;n?:number;children:React.ReactNode})=>n===0&&!on
    ?<span className="flt-opt off" aria-disabled="true"><i/>{children}<em>0</em></span>
    :<Link href={href} className={'flt-opt'+(on?' on':'')} aria-current={on?'true':undefined}><i/>{children}{n!=null&&<em>{n}</em>}</Link>;
  // active filters as removable chips (shown when nothing matches)
  const chips=[sp.q&&{k:'q',label:`“${sp.q}”`},cat&&{k:'category',label:cat.name},sp.brand&&{k:'brand',label:brands.find((b:any)=>b.slug===sp.brand)?.name||sp.brand},
    sp.camera&&{k:'camera',label:sp.camera==='with'?'With Camera':'Without Camera'},sp.availability&&{k:'availability',label:sp.availability==='in_stock'?'In Stock':'Stock Out'},
    (sp.min_price||sp.max_price)&&{k:'price',label:`৳${sp.min_price||0} – ${sp.max_price?'৳'+sp.max_price:'any'}`}].filter(Boolean) as {k:string;label:string}[];
  return <main className="wrap section-sm">
    <nav className="crumbs"><Link href="/">Home</Link><Icon name="chevronRight" size={14}/><Link href="/shop">Shop</Link>{cat&&<><Icon name="chevronRight" size={14}/><span>{cat.name}</span></>}</nav>
    <div className="shop-head"><div><h1>{title}</h1><span className="muted">{ps.length} product{ps.length===1?'':'s'} found</span></div><div className="shop-tools"><label htmlFor="flt-tg" className="btn btn-outline btn-sm flt-btn"><Icon name="filter" size={16}/>Filters{['category','brand','camera','availability','min_price','max_price'].filter(k=>sp[k]).length>0&&<em>{['category','brand','camera','availability','min_price','max_price'].filter(k=>sp[k]).length}</em>}</label><SortSelect value={sp.sort||'featured'}/></div></div>
    {/* phones: the filter panel is folded behind the “Filters” button (CSS-only toggle, works without JS) */}
    <input type="checkbox" id="flt-tg" className="flt-tg" hidden/>
    <div className="shop">
      <aside className="flt" aria-label="Filters">
        <h4>Categories</h4><Opt on={!sp.category} href={link({category:undefined,brand:undefined})} n={count('category',()=>true)}>All Products</Opt>{cats.map(c=><Opt key={c.slug} on={sp.category===c.slug} href={link({category:c.slug,brand:undefined})} n={count('category',p=>p.category_slug===c.slug)}>{c.name}</Opt>)}
        {brands.length>0&&<><h4>Brand</h4>{brands.map(b=><Opt key={b.slug} on={sp.brand===b.slug} href={link({brand:sp.brand===b.slug?undefined:b.slug})} n={count('brand',p=>p.brand_slug===b.slug)}>{b.name}</Opt>)}</>}
        {showCamera&&<><h4>Camera</h4><Opt on={sp.camera==='with'} href={link({camera:sp.camera==='with'?undefined:'with'})} n={count('camera',p=>!!p.has_camera)}>With Camera</Opt><Opt on={sp.camera==='without'} href={link({camera:sp.camera==='without'?undefined:'without'})} n={count('camera',p=>!p.has_camera)}>Without Camera</Opt></>}
        <h4>Availability</h4><Opt on={sp.availability==='in_stock'} href={link({availability:sp.availability==='in_stock'?undefined:'in_stock'})} n={count('availability',p=>Number(p.stock)>0)}>In Stock</Opt><Opt on={sp.availability==='out_of_stock'} href={link({availability:sp.availability==='out_of_stock'?undefined:'out_of_stock'})} n={count('availability',p=>Number(p.stock)<=0)}>Stock Out</Opt>
        <h4>Price Range</h4><form className="flt-price" action="/shop">{keys.filter(k=>!['min_price','max_price'].includes(k)&&sp[k]).map(k=><input key={k} type="hidden" name={k} value={sp[k]}/>)}<input name="min_price" inputMode="numeric" placeholder="Min ৳" defaultValue={sp.min_price}/><span>–</span><input name="max_price" inputMode="numeric" placeholder="Max ৳" defaultValue={sp.max_price}/><button className="btn btn-sm">Go</button></form>
        {qs.toString()&&<Link className="flt-clear" href="/shop">Clear all filters</Link>}
      </aside>
      {ps.length?<div className="pc-grid three">{ps.map(p=><ProductCard p={p} key={p._id} tag={sp.collection==='new'&&p.stock>0?'New':undefined}/>)}</div>:<div className="empty-state panel"><Icon name="search" size={34}/><h3>No products match these filters</h3>{chips.length>0&&<><p className="muted">Remove a filter to see more:</p><div className="flt-chips">{chips.map(c=><Link key={c.k} className="flt-chip" href={link(c.k==='price'?{min_price:undefined,max_price:undefined}:c.k==='category'?{category:undefined,brand:undefined}:{[c.k]:undefined})} aria-label={`Remove filter ${c.label}`}>{c.label} <span aria-hidden="true">×</span></Link>)}</div></>}<Link className="btn" href="/shop">Show all products</Link></div>}
    </div>
  </main>;
}
