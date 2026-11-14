// Stroke icon set (24×24, currentColor). Keep in sync with admin/src/components/Icon.tsx.
const P:Record<string,string>={
  camera:'M14.5 4h-5L7.5 6.5H4a1.5 1.5 0 0 0-1.5 1.5v10A1.5 1.5 0 0 0 4 19.5h16a1.5 1.5 0 0 0 1.5-1.5V8A1.5 1.5 0 0 0 20 6.5h-3.5L14.5 4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  ai:'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z',
  wifi:'M2 8.8a15 15 0 0 1 20 0M5 12.4a10.5 10.5 0 0 1 14 0M8.5 15.9a5.5 5.5 0 0 1 7 0M12 19.5h.01',
  mic:'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM19 11a7 7 0 0 1-14 0M12 18v3M8.5 21h7',
  battery:'M7 4h3V2.5h4V4h3a1 1 0 0 1 1 1v15.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM9.5 16h5M9.5 12.5h5',
  bluetooth:'M7 7l10 10-5 4V3l5 4L7 17',
  sun:'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  phone:'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z',
  translate:'M4 5h8M8 3v2M10.5 5c-.8 3.5-3.2 6.3-6.5 8M6 9c1.2 1.8 3 3.2 5 4M13 21l4-9 4 9M14.5 18h5',
  feather:'M20.2 3.8a6 6 0 0 0-8.5 0L5 10.5V19h8.5l6.7-6.7a6 6 0 0 0 0-8.5zM16 8L2 22M17.5 15H9',
  eye:'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  shield:'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4',
  shieldPlain:'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  returnArrow:'M3 7v5h5M3.5 12a9 9 0 1 0 2.1-6.4L3 8',
  truck:'M1 4h14v11H1zM15 8h4l3 3v4h-7M5.5 19.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18.5 19.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  lockCard:'M3 6h18a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM2 10h20M6 14.5h4',
  secure:'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9.5 11V9.5a2.5 2.5 0 0 1 5 0V11M9 11h6v4H9z',
  badgeCheck:'M12 2l2.4 1.8 3-.2.9 2.9 2.4 1.8-1 2.8 1 2.8-2.4 1.8-.9 2.9-3-.2L12 22l-2.4-1.8-3 .2-.9-2.9-2.4-1.8 1-2.8-1-2.8 2.4-1.8.9-2.9 3 .2L12 2zM8.5 12l2.4 2.4 4.6-4.8',
  cart:'M9 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM20 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6',
  heart:'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21.2l7.8-7.7 1-1.1a5.5 5.5 0 0 0 0-7.8z',
  user:'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  userSmall:'M12 3l3 6H9l3-6zM6 21l2-8h8l2 8',
  track:'M12 2a3 3 0 0 1 3 3 3 3 0 0 1-3 3 3 3 0 0 1-3-3 3 3 0 0 1 3-3zM5 9a3 3 0 0 1 3 3 3 3 0 0 1-3 3 3 3 0 0 1-3-3 3 3 0 0 1 3-3zM19 9a3 3 0 0 1 3 3 3 3 0 0 1-3 3 3 3 0 0 1-3-3 3 3 0 0 1 3-3zM12 16a3 3 0 0 1 3 3 3 3 0 0 1-3 3 3 3 0 0 1-3-3 3 3 0 0 1 3-3z',
  search:'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  chevronRight:'M9 18l6-6-6-6', chevronLeft:'M15 18l-6-6 6-6', chevronDown:'M6 9l6 6 6-6',
  arrowRight:'M5 12h14M12 5l7 7-7 7',
  play:'M7 4.5v15l12-7.5-12-7.5z',
  expand:'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7',
  check:'M20 6L9 17l-5-5',
  bolt:'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  copy:'M9 9h11v11H9zM5 15H4V4h11v1',
  percent:'M19 5L5 19M6.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM17.5 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  cube:'M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7zM3.3 7L12 12l8.7-5M12 22V12',
  flame:'M12 22c4 0 7-2.7 7-7 0-4-3-6.5-4-10-1.5 2-2 3.5-2 5-1.5-1-2.5-2.5-2.5-4.5C7.5 8 5 11 5 15c0 4.3 3 7 7 7z',
  close:'M18 6L6 18M6 6l12 12',
  plus:'M12 5v14M5 12h14', minus:'M5 12h14',
  star:'M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1L12 2z',
  headset:'M3 18v-6a9 9 0 0 1 18 0v6M21 19a2 2 0 0 1-2 2h-1v-6h3v4zM3 19a2 2 0 0 0 2 2h1v-6H3v4z',
  handshake:'M11 17l2 2a1.4 1.4 0 0 0 2-2M14 14l2.5 2.5a1.4 1.4 0 0 0 2-2l-3.8-3.8a2 2 0 0 0-2.8 0l-.9.9a1.4 1.4 0 0 1-2-2l2.8-2.8a3.5 3.5 0 0 1 4.3-.5l.5.3a2 2 0 0 0 1.4.3L21 6M21 3v11h-2M3 3v11h2l4 4a1.4 1.4 0 0 0 2-2M3 4h7',
  glasses:'M2 12.5a4 4 0 1 0 8 0 4 4 0 1 0-8 0zM14 12.5a4 4 0 1 0 8 0 4 4 0 1 0-8 0zM10 12.5c.6-.8 1.3-1 2-1s1.4.2 2 1M2 12.5L3 7M22 12.5L21 7',
  earbuds:'M7 3a4 4 0 0 0-4 4v1a4 4 0 0 0 4 4h0v8a1.5 1.5 0 0 0 3 0V7a4 4 0 0 0-3-4zM17 3a4 4 0 0 1 4 4v1a4 4 0 0 1-4 4h0v8a1.5 1.5 0 0 1-3 0V7a4 4 0 0 1 3-4z',
  watch:'M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM12 9v3l1.5 1.5M16.5 7.5L16 3H8l-.5 4.5M7.5 16.5L8 21h8l.5-4.5',
  homeSmart:'M3 10.5L12 3l9 7.5V21H3V10.5zM9 21v-6h6v6',
  plug:'M12 22v-5M9 8V2M15 8V2M18 8v4a6 6 0 0 1-12 0V8h12z',
  menu:'M3 6h18M3 12h18M3 18h18',
  mail:'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 6l-10 7L2 6',
  facebook:'M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3V2z',
  pin:'M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0zM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  info:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
  trash:'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6',
  filter:'M22 3H2l8 9.5V19l4 2v-8.5L22 3z',
  volume:'M11 5L6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14',
  more:'M12 6h.01M12 12h.01M12 18h.01',
  box:'M21 8v13H3V8M1 3h22v5H1zM10 12h4',
  checkCircle:'M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4L12 14l-3-3',
  logout:'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  xCircle:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM15 9l-6 6M9 9l6 6',
  send:'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z',
  refresh:'M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15',
};
export type IconName=keyof typeof P|string;
export default function Icon({name,size=20,stroke=1.8,fill='none',className='',title}:{name:IconName;size?:number;stroke?:number;fill?:string;className?:string;title?:string}){
  const d=P[name]||P.info;
  return <svg className={'ico '+className} width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden={title?undefined:true} role={title?'img':undefined}>{title&&<title>{title}</title>}<path d={d}/></svg>;
}
/** Pick a feature icon from free text the admin types ("8MP Camera" → camera). */
export function featureIcon(text:string):string{
  const t=(text||'').toLowerCase();
  if(/translat|language/.test(t))return 'translate';
  if(/camera|photo|video|mp\b/.test(t))return 'camera';
  if(/\bai\b|assistant|recogni|smart/.test(t))return 'ai';
  if(/wi-?fi|wireless|connect/.test(t))return 'wifi';
  if(/voice|mic|record|call/.test(t))return 'mic';
  if(/batter|hour|charg/.test(t))return 'battery';
  if(/bluetooth|audio|music|speaker/.test(t))return 'bluetooth';
  if(/uv|polari|sun|lens/.test(t))return 'sun';
  if(/light|weight|comfort|tr90|hinge/.test(t))return 'feather';
  if(/prescription|optical|vision/.test(t))return 'eye';
  return 'badgeCheck';
}
