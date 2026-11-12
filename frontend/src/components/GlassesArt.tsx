/** Neutral product illustration used only when Admin has not uploaded a photo yet. */
export default function GlassesArt({variant='smart'}:{variant?:'smart'|'camera'|'sun'|'frame'}){
  const lens=variant==='sun'?'url(#tint)':'rgba(220,232,250,.55)';
  const frame=variant==='sun'?'#c9ced6':'#111827';
  return <svg className="glasses-art" viewBox="0 0 320 170" role="img" aria-label="Product photo coming soon">
    <defs><linearGradient id="tint" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#1f2937"/><stop offset="1" stopColor="#6b7280"/></linearGradient>
    <radialGradient id="shadow"><stop offset="0" stopColor="#0f172a" stopOpacity=".22"/><stop offset="1" stopColor="#0f172a" stopOpacity="0"/></radialGradient></defs>
    <ellipse cx="160" cy="150" rx="130" ry="12" fill="url(#shadow)"/>
    <path d="M40 62 L18 48 L10 120" fill="none" stroke="#111827" strokeWidth="9" strokeLinecap="round"/>
    <path d="M280 62 L302 48 L310 120" fill="none" stroke="#111827" strokeWidth="9" strokeLinecap="round"/>
    <rect x="38" y="52" width="104" height="80" rx={variant==='frame'?18:26} fill={lens} stroke={frame} strokeWidth={variant==='frame'?7:10}/>
    <rect x="178" y="52" width="104" height="80" rx={variant==='frame'?18:26} fill={lens} stroke={frame} strokeWidth={variant==='frame'?7:10}/>
    <path d="M142 74 Q160 62 178 74" fill="none" stroke={frame} strokeWidth="8"/>
    {variant==='sun'&&<><path d="M38 60 H282" stroke="#c9ced6" strokeWidth="5"/></>}
    {variant==='camera'&&<><circle cx="40" cy="58" r="15" fill="#111827"/><circle cx="40" cy="58" r="8" fill="#1d4ed8"/><circle cx="37" cy="55" r="2.5" fill="#93c5fd"/></>}
    <path d="M60 64 l28 0" stroke="#fff" strokeOpacity=".7" strokeWidth="4" strokeLinecap="round"/>
  </svg>;
}
