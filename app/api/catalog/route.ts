import {publicCatalogData} from '../../../lib/commerce-server';
export const dynamic='force-dynamic';
export async function GET(){try{return Response.json(await publicCatalogData(),{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'The collection is temporarily unavailable. Please try again.'},{status:503});}}
