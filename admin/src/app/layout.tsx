import './globals.css';
export const metadata={title:'EMXIN Admin',robots:{index:false,follow:false},icons:{icon:[{url:'/favicon-48.png',sizes:'48x48',type:'image/png'},{url:'/icon-192.png',sizes:'192x192',type:'image/png'}],apple:'/apple-touch-icon.png'}};
export default function L({children}:{children:React.ReactNode}){return <html lang="en"><head><link rel="preconnect" href="https://fonts.googleapis.com"/><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet"/></head><body>{children}</body></html>}
