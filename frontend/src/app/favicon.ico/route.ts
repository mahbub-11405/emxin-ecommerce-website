import {safeJSON} from '@/lib/api';
import {SITE_URL} from '@/lib/seo';
export const revalidate=3600;
/** /favicon.ico: Google and some browsers ask for this exact address. It points to the same icon as the page's
 *  <link rel="icon">: the favicon uploaded in Admin → Branding, or the EMXIN "E" icon (48×48 PNG). */
export async function GET(){
  const site=await safeJSON<any>('/site-content',{});
  const up=site?.branding?.favicon_url;
  const to=typeof up==='string'&&/^https?:\/\//.test(up)?up:SITE_URL+'/favicon-48.png';
  return new Response(null,{status:301,headers:{Location:to,'Cache-Control':'public, max-age=86400'}});
}
