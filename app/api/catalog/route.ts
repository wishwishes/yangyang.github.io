import {catalog,settings,publicProduct} from '../../../lib/store-server';
export const dynamic='force-dynamic';
export async function GET(){try{return Response.json({products:(await catalog()).map(publicProduct),settings:await settings(),checkoutEnabled:false},{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'The collection is temporarily unavailable. Please try again.'},{status:503});}}
