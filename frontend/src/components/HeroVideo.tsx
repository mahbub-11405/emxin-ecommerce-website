'use client';
import {useState} from 'react';
import Icon from './Icon';
export default function HeroVideo({src}:{src:string}){
  const[open,setOpen]=useState(false);
  return <>
    <button type="button" className="hero-video" onClick={()=>setOpen(true)}><span><Icon name="play" size={12} fill="currentColor"/></span>Watch Video</button>
    {open&&<div className="modal-bg" onClick={()=>setOpen(false)} role="dialog" aria-modal="true" aria-label="Product video"><div className="modal-video" onClick={e=>e.stopPropagation()}><button className="modal-x" onClick={()=>setOpen(false)} aria-label="Close video"><Icon name="close"/></button><video src={src} controls autoPlay playsInline/></div></div>}
  </>;
}
