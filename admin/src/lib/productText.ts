// Turns the free-text lines typed in Admin into structured specs and feature cards.
// Keep in sync with frontend/src/lib/productText.ts.

const KNOWN_LABELS=['Main Chipset','Camera Chipset','Battery Life','Charging Time','Bluetooth Version','Water Resistance','Frame Material','Lens Material',
  'Model','Chipset','Processor','Camera','Video','Photo','RAM','Memory','Storage','Battery','Connectivity','Charging','Lens','Lenses','Controls','Control',
  'Compatibility','Weight','Material','Frame','Display','Bluetooth','Wi-Fi','WiFi','Audio','Speaker','Speakers','Microphone','Mic','Sensor','Sensors',
  'Waterproof','Colour','Color','Size','Dimensions','Warranty','App','Languages','Voice','Standby','Brand'].sort((a,b)=>b.length-a.length);
const HEADER=/^(feature|features|item|items|item details?|details?|spec|specs|specification|specifications|value|values)(\s+(feature|item|item details?|details?|value|values|specification))*$/i;

export type Spec={label:string;value:string};
/** "Camera: 8MP", "Camera\t8MP", "Camera | 8MP", "Camera  8MP" or "Camera 8MP" (known label) → {label,value}. Header rows return null. */
export function parseSpec(line:string):Spec|null{
  const t=(line||'').trim();if(!t||HEADER.test(t))return null;
  for(const re of [/\t+/,/\s*\|\s*/,/\s{2,}/,/\s*:\s+|:(?=\S)/,/\s+[–—-]\s+/,/\s*=\s*/]){
    const m=re.exec(t);if(!m||m.index===0)continue;
    const label=t.slice(0,m.index).trim(),value=t.slice(m.index+m[0].length).trim();
    if(!value||label.length>32)continue;
    if(re.source.includes(':')&&/\d$/.test(label))continue; // "16:9" is a value, not "label: value"
    return {label,value};
  }
  const low=t.toLowerCase();
  const k=KNOWN_LABELS.find(l=>low.startsWith(l.toLowerCase()+' '));
  if(k)return {label:t.slice(0,k.length),value:t.slice(k.length).trim()};
  return {label:'',value:t};
}
export const parseSpecs=(lines:string[]=[])=>lines.map(parseSpec).filter(Boolean) as Spec[];

const STOP=new Set(['and','for','with','that','in','of','to','the','a','an','on','at','by','from','your','you']);
export type Feature={title:string;detail:string;full:string};
/** "8MP Camera: Sharp photos…" → title + detail. Without a separator, a short title is made from the first words. */
export function parseFeature(text:string):Feature{
  const full=(text||'').trim();
  const m=/^(.{2,40}?)\s*(?::|\s[–—|-])\s+(.+)$/.exec(full);
  if(m)return {title:m[1].trim(),detail:m[2].trim(),full};
  const words=full.split(/\s+/).slice(0,4);
  while(words.length>1&&STOP.has(words[words.length-1].toLowerCase()))words.pop();
  return {title:words.join(' '),detail:full.split(/\s+/).length>words.length?full:'',full};
}

/** Case/spacing-insensitive "same text" check, e.g. "aimb-g2-pro" vs "AIMB G2 Pro". */
export const sameText=(a:any,b:any)=>String(a||'').toLowerCase().replace(/[^a-z0-9]/g,'')===String(b||'').toLowerCase().replace(/[^a-z0-9]/g,'');
