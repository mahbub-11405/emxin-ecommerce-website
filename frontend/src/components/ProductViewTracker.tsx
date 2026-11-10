'use client';
import {useEffect} from 'react';import {track} from '@/lib/tracking';
export default function ProductViewTracker({id,name}:{id:string,name:string}){useEffect(()=>{track('product_view',{product_id:id,product_name:name})},[id,name]);return null}
