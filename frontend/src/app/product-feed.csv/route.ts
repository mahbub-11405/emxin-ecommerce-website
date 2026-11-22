import {safeJSON} from '@/lib/api';
import {SITE_URL,productImages,clip} from '@/lib/seo';
export const dynamic='force-dynamic';
/** Product catalog feed for Facebook / Instagram (Commerce Manager → Data source → Data feed → scheduled URL)
 *  and Google Merchant Center. IDs are the product IDs the Pixel sends, so dynamic ads can match them. */
const COLS=['id','title','description','availability','condition','price','sale_price','link','image_link','additional_image_link','brand','product_type','item_group_id','mpn'];
const cell=(v:any)=>{const s=String(v??'').replace(/\s+/g,' ').trim();return /[",]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s};
const money=(n:any)=>Number(n||0).toFixed(2)+' BDT';
export async function GET(){
  const ps=await safeJSON<any[]>('/feeds/products',[]);
  const rows=(Array.isArray(ps)?ps:[]).map((p:any)=>{const imgs=productImages(p);const sale=p.sale_price&&Number(p.sale_price)<Number(p.price);
    const title=[p.brand_name&&!String(p.name).toLowerCase().includes(String(p.brand_name).toLowerCase())?p.brand_name:'',p.name,p.subtitle&&!String(p.name).includes(p.subtitle)?'– '+p.subtitle:''].filter(Boolean).join(' ');
    return [p._id,clip(title,150),clip(p.seo_description||p.description||`${title}. Original product with fast delivery across Bangladesh from EMXIN Technologies.`,4900),
      Number(p.stock)>0?'in stock':'out of stock','new',money(p.price),sale?money(p.sale_price):'',`${SITE_URL}/product/${p.slug}`,imgs[0]||'',imgs.slice(1,10).join(','),
      p.brand_name||'EMXIN',p.category_name||'',p.slug,p.sku||p.model||''].map(cell).join(',')});
  return new Response([COLS.join(','),...rows].join('\n')+'\n',{headers:{'Content-Type':'text/csv; charset=utf-8','Cache-Control':'public, max-age=600'}});
}
