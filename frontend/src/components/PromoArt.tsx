import Icon from './Icon';

/** Animated "smart glasses" artwork for the dark promo banner (used when Admin has not uploaded a banner image). */
export default function PromoArt(){
  return <div className="promo-art" aria-hidden="true">
    <div className="pa-orbit o1"/><div className="pa-orbit o2"/>
    <svg className="pa-glasses" viewBox="0 0 360 180">
      <defs>
        <linearGradient id="pa-frame" x1="0" x2="1"><stop offset="0" stopColor="#7aa2ff"/><stop offset=".5" stopColor="#ffffff"/><stop offset="1" stopColor="#38e1ff"/></linearGradient>
        <linearGradient id="pa-lens" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#5b8cff" stopOpacity=".35"/><stop offset="1" stopColor="#0b1838" stopOpacity=".15"/></linearGradient>
        <clipPath id="pa-clip"><rect x="46" y="52" width="114" height="86" rx="28"/><rect x="200" y="52" width="114" height="86" rx="28"/></clipPath>
        <filter id="pa-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <g filter="url(#pa-glow)" fill="none" stroke="url(#pa-frame)" strokeLinecap="round">
        <path d="M48 64 L22 48 L12 124" strokeWidth="7"/><path d="M312 64 L338 48 L348 124" strokeWidth="7"/>
        <rect x="46" y="52" width="114" height="86" rx="28" fill="url(#pa-lens)" strokeWidth="8"/>
        <rect x="200" y="52" width="114" height="86" rx="28" fill="url(#pa-lens)" strokeWidth="8"/>
        <path d="M160 76 Q180 62 200 76" strokeWidth="7"/>
      </g>
      <g clipPath="url(#pa-clip)"><rect className="pa-scan" x="0" y="40" width="360" height="14" fill="#38e1ff" opacity=".35"/>
        <path d="M70 120 l20 -18 l14 10 l22 -26" stroke="#38e1ff" strokeWidth="2.5" fill="none" opacity=".8"/>
        <circle cx="257" cy="95" r="16" stroke="#7aa2ff" strokeWidth="2" fill="none" opacity=".9"/><path d="M257 79v-8M257 119v-8M241 95h-8M281 95h-8" stroke="#7aa2ff" strokeWidth="2"/>
      </g>
      <circle className="pa-cam" cx="50" cy="58" r="11" fill="#0b1838" stroke="#38e1ff" strokeWidth="3"/><circle cx="50" cy="58" r="4" fill="#38e1ff"/>
    </svg>
    <span className="pa-chip c1"><Icon name="ai" size={15} stroke={2}/>AI Assistant</span>
    <span className="pa-chip c2"><Icon name="camera" size={15} stroke={2}/>8MP Camera</span>
    <span className="pa-chip c3"><Icon name="translate" size={15} stroke={2}/>Live Translate</span>
  </div>;
}
