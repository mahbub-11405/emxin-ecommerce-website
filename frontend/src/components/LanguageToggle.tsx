'use client';
import {useEffect,useState} from 'react';
export default function LanguageToggle(){const[l,setL]=useState('en');useEffect(()=>{setL(localStorage.getItem('emxin_lang')||'en')},[]);function change(){const n=l==='en'?'bn':'en';setL(n);localStorage.setItem('emxin_lang',n);document.documentElement.lang=n}return <button className="lang" onClick={change}>{l==='en'?'বাংলা':'EN'}</button>}
