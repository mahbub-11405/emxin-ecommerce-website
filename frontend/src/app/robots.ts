import type {MetadataRoute} from 'next';
import {SITE_URL} from '@/lib/seo';
export const dynamic='force-dynamic';
/** Google may read every shop page, but not carts, accounts or checkout. */
export default function robots():MetadataRoute.Robots{
  return {rules:[{userAgent:'*',allow:'/',disallow:['/cart','/checkout','/account','/login','/register','/wishlist','/payment-result','/*?*sort=','/*?*min_price=','/*?*max_price=']}],
    sitemap:SITE_URL+'/sitemap.xml',host:SITE_URL};
}
