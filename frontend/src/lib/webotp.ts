// Android Chrome reads the OTP from the SMS automatically (WebOTP). The SMS must end with "@<this site's domain> #<code>".
// iPhone Safari shows the code above the keyboard thanks to autocomplete="one-time-code" on the input.
export function listenWebOTP(onCode:(code:string)=>void):()=>void{
  if(typeof window==='undefined'||!('OTPCredential' in window))return ()=>{};
  const ac=new AbortController();const t=setTimeout(()=>ac.abort(),5*60*1000);
  (navigator.credentials as any).get({otp:{transport:['sms']},signal:ac.signal}).then((o:any)=>{if(o?.code)onCode(String(o.code))}).catch(()=>{});
  return ()=>{clearTimeout(t);ac.abort()};
}
