'use client';
import {useEffect} from 'react';
export default function Register(){useEffect(()=>{const q=new URLSearchParams(location.search);q.set('tab','register');location.replace('/login?'+q.toString())},[]);return <main className="wrap section"><p className="muted">Opening registration…</p></main>}
