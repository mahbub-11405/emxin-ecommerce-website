'use client';
import Script from 'next/script';
import {useEffect,useRef} from 'react';
import {usePathname} from 'next/navigation';
import {rememberAdClick} from '@/lib/pixel';
/** Loads the Facebook Pixel when Admin → Homepage Builder → Facebook ads has a Pixel ID. Counts a PageView on every page change. */
export default function MetaPixel({id}:{id:string}){
  const path=usePathname();const first=useRef(true);
  useEffect(()=>{rememberAdClick();if(first.current){first.current=false;return}try{window.fbq?.('track','PageView')}catch{}},[path]);
  if(!/^\d{5,20}$/.test(id||''))return null;
  return <Script id="meta-pixel" strategy="afterInteractive">{`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${id}');fbq('track','PageView');`}</Script>;
}
