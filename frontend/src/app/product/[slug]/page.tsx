import {safeJSON} from '@/lib/api';
import ProductDetails from './ProductDetails';
import ProductViewTracker from '@/components/ProductViewTracker';
import Link from 'next/link';
import JsonLd from '@/components/JsonLd';
import {deliveryDays} from '@/lib/delivery';
import {SITE_URL,SITE_NAME,abs,clip,productImages,price} from '@/lib/seo';

/** "AIMB G2 Pro – AI Smart Glasses (With Camera)": what people type in Google, without repeating words. */
const fullName=(p:any)=>p.subtitle&&!String(p.name).toLowerCase().includes(String(p.subtitle).toLowerCase())?`${p.name} – ${p.subtitle}`:p.name;
const metaDescription=(p:any)=>clip(p.seo_description||p.description||`Buy ${fullName(p)} in Bangladesh at ৳${price(p).toLocaleString('en-IN')}. 100% original, cash on delivery and fast delivery across Bangladesh from ${SITE_NAME}.`);

export async function generateMetadata({params}:{params:Promise<{slug:string}>}){
  const {slug}=await params;const p=await safeJSON<any>('/products/'+slug,null);
  if(!p)return {title:'Product not found',robots:{index:false}};
  const title=p.seo_title||`${fullName(p)} Price in Bangladesh`;const description=metaDescription(p);const imgs=productImages(p).slice(0,4);
  return {title,description,alternates:{canonical:`/product/${p.slug}`},
    openGraph:{type:'website',title,description,url:`/product/${p.slug}`,images:imgs.map(url=>({url,alt:p.name}))},
    twitter:{card:'summary_large_image',title,description,images:imgs.slice(0,1)},
    other:{'product:price:amount':String(price(p)),'product:price:currency':'BDT','product:availability':Number(p.stock)>0?'in stock':'out of stock','product:brand':p.brand_name||''}};
}
export default async function Product({params}:{params:Promise<{slug:string}>}){
  const {slug}=await params;
  const[p,settings,site,cats,offer]=await Promise.all([safeJSON<any>('/products/'+slug,null),safeJSON<any>('/home',{}),safeJSON<any>('/site-content',{}),safeJSON<any[]>('/categories',[]),safeJSON<any>('/coupons/featured',{})]);
  if(!p)return <main className="wrap section empty-state"><h1>Product not found</h1><p className="muted">It may have been removed or is temporarily hidden.</p><Link className="btn" href="/shop">Browse products</Link></main>;
  const cfg=settings.settings||{};
  // dealer offer depends on the product's category: standard tiers, a fixed maximum (e.g. power banks 5%), or none
  const tiersAll:number[]=Array.isArray(site.dealer_tiers)?site.dealer_tiers.map(Number):[];
  const cat=(Array.isArray(cats)?cats:[]).find((c:any)=>c.slug===p.category_slug)||{};
  const mode=cat.dealer_mode||'tiers';const first=tiersAll[0]||Number(cfg.bulk_discount_percent||5);
  const dealerPercent=mode==='none'?0:mode==='fixed'?Math.min(first,Number(cat.dealer_percent??first)):first;
  const dealerTiers=mode==='tiers'?tiersAll:mode==='fixed'?[Number(cat.dealer_percent??first)]:[];
  const url=`${SITE_URL}/product/${p.slug}`;const imgs=productImages(p);
  const ld:any[]=[{'@context':'https://schema.org','@type':'Product','@id':url+'#product',name:fullName(p),url,image:imgs.length?imgs:undefined,description:clip(p.description||metaDescription(p),4900),
    sku:p.sku||undefined,mpn:p.model||undefined,model:p.model||undefined,category:p.category_name||undefined,brand:{'@type':'Brand',name:p.brand_name||SITE_NAME},
    ...(Number(p.review_count)>0&&Number(p.rating)>0?{aggregateRating:{'@type':'AggregateRating',ratingValue:Number(p.rating).toFixed(1),reviewCount:Number(p.review_count)}}:{}),
    offers:{'@type':'Offer',url,priceCurrency:'BDT',price:price(p),itemCondition:'https://schema.org/NewCondition',
      availability:Number(p.stock)>0?'https://schema.org/InStock':'https://schema.org/OutOfStock',seller:{'@id':SITE_URL+'/#org'},
      shippingDetails:{'@type':'OfferShippingDetails',shippingDestination:{'@type':'DefinedRegion',addressCountry:'BD'},
        shippingRate:{'@type':'MonetaryAmount',value:Number(cfg.dhaka_delivery_charge??70),currency:'BDT'}}}},
    {'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'Home',item:SITE_URL+'/'},
      ...(p.category_slug?[{'@type':'ListItem',position:2,name:p.category_name||cat.name||'Shop',item:abs('/shop?category='+encodeURIComponent(p.category_slug))}]:[]),
      {'@type':'ListItem',position:p.category_slug?3:2,name:p.name,item:url}]}];
  const faq=(p.faq||[]).filter((x:any)=>x?.question&&x?.answer);
  if(faq.length)ld.push({'@context':'https://schema.org','@type':'FAQPage',mainEntity:faq.map((x:any)=>({'@type':'Question',name:x.question,acceptedAnswer:{'@type':'Answer',text:x.answer}}))});
  return <main className="wrap section-sm"><JsonLd data={ld}/><ProductViewTracker id={p._id} name={p.name} value={price(p)}/><ProductDetails product={p} bulkThreshold={Number(cfg.bulk_threshold_qty||20)} retailCap={Number(site.retail_max_qty_per_product||cfg.retail_max_qty_per_product||5)} dealerPercent={dealerPercent} dealerTiers={dealerTiers} dealerFixed={mode==='fixed'} offer={offer?.code&&(!offer.product_ids?.length||offer.product_ids.includes(p._id))?offer:null} defaultBanner={cat.banner_url||site.branding?.product_banner_url||''} links={site.links||{}} delivery={{dhaka:Number(cfg.dhaka_delivery_charge??70),outside:Number(cfg.outside_dhaka_delivery_charge??130),...(()=>{const d=deliveryDays(cfg);return {dhakaDays:d.dhaka,outsideDays:d.outside}})()}}/></main>;
}
