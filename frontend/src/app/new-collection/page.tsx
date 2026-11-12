import Shop from '../shop/page';
export const metadata={title:'New Collection'};
export default async function NewCollection({searchParams}:{searchParams:Promise<any>}){const sp=await searchParams;return Shop({searchParams:Promise.resolve({...sp,collection:'new'})})}
