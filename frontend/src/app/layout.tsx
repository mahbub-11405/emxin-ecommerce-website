import './globals.css';
import Link from 'next/link';
import {safeJSON,isHttp} from '@/lib/api';
import AnalyticsTracker from '@/components/AnalyticsTracker';
import Icon from '@/components/Icon';
import LogoutUI from '@/components/LogoutUI';
import MetaPixel from '@/components/MetaPixel';
import JsonLd from '@/components/JsonLd';
import {SITE_URL,SITE_NAME,abs} from '@/lib/seo';
import {CartBadge,AccountLink,NavLinks,WishBadge} from '@/components/HeaderClient';
import Social from '@/components/Social';
import {OfferBar,OfferPopup} from '@/components/Offer';

export async function generateMetadata(){
  const site=await safeJSON<any>('/site-content',{});const seo=site.seo||{};
  const title=seo.title||'EMXIN Technologies — Smart Gadgets. Smarter Living.';
  const description=seo.description||'AI smart glasses, smart sunglasses and premium frames in Bangladesh. Fast delivery, secure payment and dealer pricing.';
  const keywords=String(seo.keywords||'').split(',').map((k:string)=>k.trim()).filter(Boolean);
  const fbv=site.tracking?.facebook_domain_verification;
  return {metadataBase:new URL(SITE_URL),title:{default:title,template:'%s | EMXIN Technologies'},description,...(keywords.length?{keywords}:{}),applicationName:SITE_NAME,
    openGraph:{type:'website',siteName:SITE_NAME,locale:'en_BD',title,description,url:'/',images:isHttp(seo.image)?[{url:seo.image,width:1200,height:630}]:[]},
    twitter:{card:'summary_large_image',title,description,images:isHttp(seo.image)?[seo.image]:[]},
    robots:{index:true,follow:true,googleBot:{index:true,follow:true,'max-image-preview':'large','max-snippet':-1}},
    ...(seo.google_verification||fbv?{verification:{...(seo.google_verification?{google:seo.google_verification}:{}),...(fbv?{other:{'facebook-domain-verification':fbv}}:{})}}:{}),
    icons:{icon:isHttp(site.branding?.favicon_url)?[{url:site.branding.favicon_url}]:[{url:'/favicon-48.png',sizes:'48x48',type:'image/png'},{url:'/icon-192.png',sizes:'192x192',type:'image/png'}],apple:'/apple-touch-icon.png'}}; // EMXIN “E” icon unless another favicon is uploaded in Admin → Branding
}
export const viewport={width:'device-width',initialScale:1,themeColor:'#1f5cff'};

export default async function Layout({children}:{children:React.ReactNode}){
  const[site,cats,offer]=await Promise.all([safeJSON<any>('/site-content',{}),safeJSON<any[]>('/categories',[]),safeJSON<any>('/coupons/featured',{})]);
  const logo=isHttp(site.branding?.logo_url)?site.branding.logo_url:'/branding/emxin-logo-light.png';
  const logoDark=isHttp(site.branding?.logo_dark_url)?site.branding.logo_dark_url:'/branding/emxin-logo-dark.png';
  const links=site.links||{};
  const year=new Date().getFullYear();
  return <html lang="en"><head>
    <link rel="preconnect" href="https://fonts.googleapis.com"/><link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin=""/>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Hind+Siliguri:wght@400;500;600;700&display=swap" rel="stylesheet"/>
  </head><body>
    <AnalyticsTracker/><LogoutUI/><MetaPixel id={site.tracking?.meta_pixel_id||''}/>
    <JsonLd data={[{'@context':'https://schema.org','@type':'Organization','@id':SITE_URL+'/#org',name:SITE_NAME,url:SITE_URL,logo:abs(logo),
      ...(links.support_phone?{contactPoint:[{'@type':'ContactPoint',telephone:links.support_phone,contactType:'customer service',areaServed:'BD',availableLanguage:['en','bn']}]}:{}),
      ...(links.support_email?{email:links.support_email}:{}),sameAs:[links.facebook_url,links.instagram_url,links.youtube_url].filter((x:any)=>isHttp(x))},
      {'@context':'https://schema.org','@type':'WebSite','@id':SITE_URL+'/#site',name:SITE_NAME,alternateName:['EMXIN','EMXIN Tech','tech.emxin.com'],url:SITE_URL,publisher:{'@id':SITE_URL+'/#org'},
      potentialAction:{'@type':'SearchAction',target:{'@type':'EntryPoint',urlTemplate:SITE_URL+'/shop?q={search_term_string}'},'query-input':'required name=search_term_string'}}]}/>
    {offer?.code?<><OfferBar c={offer}/><OfferPopup c={offer}/></>:site.announcement?.enabled&&site.announcement?.text&&<div className="announce">{site.announcement.href?<Link href={site.announcement.href}>{site.announcement.text}</Link>:site.announcement.text}</div>}
    <header className="hdr"><div className="wrap hdr-row">
      <Link className="hdr-logo" href="/" aria-label="EMXIN Technologies home"><img src={logo} alt="EMXIN Technologies"/></Link>
      <NavLinks categories={cats}/>
      <form action="/shop" className="hdr-search" role="search"><input name="q" placeholder="Search products..." aria-label="Search products"/><button aria-label="Search"><Icon name="search" size={17}/></button></form>
      <div className="hdr-actions">
        <Link className="hdr-util" href="/track-order"><Icon name="track" size={19}/><small>Track Order</small></Link>
        <AccountLink/>
        <WishBadge/>
        <CartBadge/>
      </div>
    </div></header>
    {children}
    <footer className="ftr"><div className="wrap ftr-grid">
      <div className="ftr-brand"><Link href="/"><img src={logoDark} alt="EMXIN Technologies"/></Link><p>{site.footer?.tagline||'Smart Gadgets. Smarter Living.'}</p>
        <p className="soc-title">Need help with an order? Message us:</p><Social links={links}/>
        <div className="ftr-social">{links.support_phone&&<a href={'tel:'+links.support_phone} aria-label="Call support"><Icon name="phone" size={18}/></a>}{links.support_email&&<a href={'mailto:'+links.support_email} aria-label="Email support"><Icon name="mail" size={18}/></a>}</div>
      </div>
      <div><h4>Shop</h4>{(cats.length?cats:[{slug:'smart-glasses',name:'Smart Glasses'},{slug:'sunglasses',name:'Sunglasses'},{slug:'frames',name:'Frames'}]).slice(0,6).map((c:any)=><Link key={c.slug} href={`/shop?category=${c.slug}`}>{c.name}</Link>)}</div>
      <div><h4>Support</h4><Link href="/track-order">Track Order</Link><Link href="/return-policy">Return Policy</Link><Link href={links.support_url||'/contact'}>Contact Support</Link><Link href="/payments">Payment Options</Link><Link href="/delivery">Delivery Information</Link></div>
      <div><h4>Business</h4><Link href="/dealer">Become a Dealer</Link><Link href="/dealer#benefits">Dealer Benefits</Link><Link href="/account">Dealer Account</Link></div>
    </div><div className="wrap ftr-bottom"><span>© {year} EMXIN Technologies. All Rights Reserved.</span><span><Link href="/privacy-policy">Privacy Policy</Link><Link href="/terms">Terms & Conditions</Link><Link href="/return-policy">Return Policy</Link></span></div></footer>
  </body></html>;
}
