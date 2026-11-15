// Facebook page + Messenger chat — shown only in the footer and on the Contact page (not floating, so it never distracts from ordering).
// Links come from Admin → CMS / Homepage → Links; these defaults are used until they are filled in there.
export const DEFAULT_FB='https://www.facebook.com/emxintechnologies';
export const DEFAULT_MSG='https://m.me/emxintechnologies';

export function FacebookLogo({size=22}:{size?:number}){
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#1877F2"/><path fill="#fff" d="M15.1 12.5h-2.2V20h-3.1v-7.5H8.3V9.8h1.5V8.1c0-2.1.9-3.4 3.4-3.4h2v2.7h-1.3c-.9 0-1 .4-1 1v1.4h2.3l-.1 2.7z"/></svg>;
}
export function MessengerLogo({size=22}:{size?:number}){
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><defs><radialGradient id="msg-g" cx="19%" cy="99%" r="108%"><stop offset="0" stopColor="#0099FF"/><stop offset=".6" stopColor="#A033FF"/><stop offset=".9" stopColor="#FF5280"/><stop offset="1" stopColor="#FF7061"/></radialGradient></defs>
    <path fill="url(#msg-g)" d="M12 1.5C6.1 1.5 1.5 5.8 1.5 11.6c0 3 1.2 5.6 3.3 7.4.2.2.3.4.3.6l.1 1.9c0 .6.6 1 1.2.8l2.1-.9c.2-.1.4-.1.6 0 1 .3 2 .4 3 .4 5.9 0 10.5-4.3 10.5-10.1S17.9 1.5 12 1.5z"/>
    <path fill="#fff" d="M5.7 14.7l3.1-4.9c.5-.8 1.5-1 2.3-.4l2.5 1.8c.2.2.5.2.8 0l3.3-2.5c.4-.3 1 .2.7.6l-3.1 4.9c-.5.8-1.5 1-2.3.4l-2.5-1.8c-.2-.2-.5-.2-.8 0l-3.3 2.5c-.4.3-1-.2-.7-.6z"/></svg>;
}
export default function Social({links,variant='footer'}:{links:any;variant?:'footer'|'contact'}){
  const fb=links?.facebook_url||DEFAULT_FB;const msg=links?.messenger_url||DEFAULT_MSG;
  return <div className={variant==='footer'?'soc':'soc soc-big'}>
    <a href={msg} target="_blank" rel="noopener" aria-label="Message EMXIN on Messenger"><MessengerLogo size={variant==='footer'?22:30}/><span>Message us</span></a>
    <a href={fb} target="_blank" rel="noopener" aria-label="EMXIN on Facebook"><FacebookLogo size={variant==='footer'?22:30}/><span>Facebook</span></a>
  </div>;
}
