import type {MetadataRoute} from 'next';
import {safeJSON} from '@/lib/api';
import {SITE_URL,productImages} from '@/lib/seo';
export const dynamic='force-dynamic';
/** Every page Google should know about. New products appear here by themselves. */
export default async function sitemap():Promise<MetadataRoute.Sitemap>{
  const[ps,cats]=await Promise.all([safeJSON<any[]>('/feeds/products',[]),safeJSON<any[]>('/categories',[])]);
  const u=(p:string)=>SITE_URL+p;const today=new Date();
  const pages:[string,number,'daily'|'weekly'|'monthly'|'yearly'][]=[['/',1,'daily'],['/shop',.9,'daily'],['/new-collection',.8,'weekly'],['/offers',.8,'daily'],['/dealer',.6,'monthly'],
    ['/contact',.5,'monthly'],['/delivery',.4,'monthly'],['/payments',.4,'monthly'],['/return-policy',.3,'yearly'],['/privacy-policy',.2,'yearly'],['/terms',.2,'yearly'],['/track-order',.3,'monthly']];
  return [
    ...pages.map(([p,priority,changeFrequency])=>({url:u(p),lastModified:today,changeFrequency,priority})),
    ...(Array.isArray(cats)?cats:[]).map((c:any)=>({url:u('/shop?category='+encodeURIComponent(c.slug)),lastModified:today,changeFrequency:'weekly' as const,priority:.8})),
    ...(Array.isArray(ps)?ps:[]).map((p:any)=>({url:u('/product/'+p.slug),lastModified:new Date(p.updated_at||p.created_at||today),changeFrequency:'weekly' as const,priority:.9,images:productImages(p).slice(0,5)})),
  ];
}
