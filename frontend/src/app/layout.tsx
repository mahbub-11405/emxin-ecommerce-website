import './globals.css';
import Link from 'next/link';
import {safeJSON,isHttp} from '@/lib/api';
import AnalyticsTracker from '@/components/AnalyticsTracker';
import Icon from '@/components/Icon';
import {CartBadge,AccountLink,NavLinks} from '@/components/HeaderClient';

export async function generateMetadata(){
  const site=await safeJSON<any>('/site-content',{});const seo=site.seo||{};
  const title=seo.title||'EMXIN Technologies — Smart Gadgets. Smarter Living.';
  const description=seo.description||'AI smart glasses, smart sunglasses and premium frames in Bangladesh. Fast delivery, secure payment and dealer pricing.';
  return {title:{default:title,template:'%s | EMXIN Technologies'},description,openGraph:{title,description,images:isHttp(seo.image)?[seo.image]:[]},icons:{icon:isHttp(site.branding?.favicon_url)?site.branding.favicon_url:'/favicon.svg',apple:'/apple-touch-icon.png'}}; // built-in EMXIN icon unless Admin uploaded one
}
export const viewport={width:'device-width',initialScale:1,themeColor:'#1f5cff'};

export default async function Layout({children}:{children:React.ReactNode}){
  const[site,cats]=await Promise.all([safeJSON<any>('/site-content',{}),safeJSON<any[]>('/categories',[])]);
  const logo=isHttp(site.branding?.logo_url)?site.branding.logo_url:'/branding/emxin-logo-light.png';
  const logoDark=isHttp(site.branding?.logo_dark_url)?site.branding.logo_dark_url:'/branding/emxin-logo-dark.png';
  const links=site.links||{};
  const year=new Date().getFullYear();
  return <html lang="en"><head>
    <link rel="preconnect" href="https://fonts.googleapis.com"/><link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin=""/>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Hind+Siliguri:wght@400;500;600;700&display=swap" rel="stylesheet"/>
  </head><body>
    <AnalyticsTracker/>
    {site.announcement?.enabled&&site.announcement?.text&&<div className="announce">{site.announcement.href?<Link href={site.announcement.href}>{site.announcement.text}</Link>:site.announcement.text}</div>}
    <header className="hdr"><div className="wrap hdr-row">
      <Link className="hdr-logo" href="/" aria-label="EMXIN Technologies home"><img src={logo} alt="EMXIN Technologies"/></Link>
      <NavLinks categories={cats}/>
      <form action="/shop" className="hdr-search" role="search"><input name="q" placeholder="Search products..." aria-label="Search products"/><button aria-label="Search"><Icon name="search" size={17}/></button></form>
      <div className="hdr-actions">
        <Link className="hdr-util" href="/track-order"><Icon name="track" size={19}/><small>Track Order</small></Link>
        <AccountLink/>
        <Link className="hdr-icon" href="/wishlist" aria-label="Wishlist"><Icon name="heart" size={23}/></Link>
        <CartBadge/>
      </div>
    </div></header>
    {children}
    <footer className="ftr"><div className="wrap ftr-grid">
      <div className="ftr-brand"><Link href="/"><img src={logoDark} alt="EMXIN Technologies"/></Link><p>{site.footer?.tagline||'Smart Gadgets. Smarter Living.'}</p>
        <div className="ftr-social">{links.facebook_url&&<a href={links.facebook_url} aria-label="Facebook" target="_blank" rel="noopener"><Icon name="facebook" size={18}/></a>}{links.support_phone&&<a href={'tel:'+links.support_phone} aria-label="Call support"><Icon name="phone" size={18}/></a>}{links.support_email&&<a href={'mailto:'+links.support_email} aria-label="Email support"><Icon name="mail" size={18}/></a>}</div>
      </div>
      <div><h4>Shop</h4>{(cats.length?cats:[{slug:'smart-glasses',name:'Smart Glasses'},{slug:'sunglasses',name:'Sunglasses'},{slug:'frames',name:'Frames'}]).slice(0,6).map((c:any)=><Link key={c.slug} href={`/shop?category=${c.slug}`}>{c.name}</Link>)}</div>
      <div><h4>Support</h4><Link href="/track-order">Track Order</Link><Link href="/return-policy">Return Policy</Link><Link href={links.support_url||'/contact'}>Contact Support</Link><Link href="/payments">Payment Options</Link><Link href="/delivery">Delivery Information</Link></div>
      <div><h4>Business</h4><Link href="/dealer">Become a Dealer</Link><Link href="/dealer#benefits">Dealer Benefits</Link><Link href="/account">Dealer Account</Link></div>
    </div><div className="wrap ftr-bottom"><span>© {year} EMXIN Technologies. All Rights Reserved.</span><span><Link href="/privacy-policy">Privacy Policy</Link><Link href="/terms">Terms & Conditions</Link><Link href="/return-policy">Return Policy</Link></span></div></footer>
  </body></html>;
}
