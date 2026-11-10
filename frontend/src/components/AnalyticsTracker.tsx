'use client';
import {useEffect} from 'react';
import {usePathname} from 'next/navigation';
import {track} from '@/lib/tracking';
export default function AnalyticsTracker(){const path=usePathname();useEffect(()=>{track('page_view')},[path]);return null}
