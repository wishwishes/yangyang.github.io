import {customerOrder,publicOrder,commerceResponse,commerceFailure} from '../../../../../lib/commerce-server';
export const dynamic='force-dynamic';
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){try{return commerceResponse(publicOrder(await customerOrder((await params).id)));}catch(e){return commerceFailure(e);}}
