'use client';
import Script from 'next/script';
import {useEffect,useRef,useState} from 'react';
import {usePathname} from 'next/navigation';
import {rememberAdClick} from '@/lib/pixel';
import {isStaff} from '@/lib/staff';
/** Loads the Facebook Pixel when Admin → Homepage Builder → Facebook ads has a Pixel ID. Counts a PageView on every page change. */
export default function MetaPixel({id}:{id:string}){
  const path=usePathname();const first=useRef(true);const[staff,setStaff]=useState<boolean|null>(null);
  useEffect(()=>{setStaff(isStaff())},[]);  // EMXIN staff browsers do not load the Pixel (keeps ad audiences clean)
  useEffect(()=>{rememberAdClick();if(first.current){first.current=false;return}try{window.fbq?.('track','PageView')}catch{}},[path]);
  if(!/^\d{5,20}$/.test(id||'')||staff!==false)return null;
  return <Script id="meta-pixel" strategy="afterInteractive">{`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${id}');fbq('track','PageView');`}</Script>;
}
