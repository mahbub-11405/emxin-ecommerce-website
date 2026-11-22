'use client';
import {useEffect} from 'react';import {track} from '@/lib/tracking';import {fbTrack} from '@/lib/pixel';
export default function ProductViewTracker({id,name,value}:{id:string,name:string,value?:number}){useEffect(()=>{track('product_view',{product_id:id,product_name:name});
  fbTrack('ViewContent',{content_ids:[id],content_type:'product',content_name:name,value:Number(value)||0})},[id,name,value]);return null}
