import {env} from 'cloudflare:workers';
import {eq,desc} from 'drizzle-orm';
import {getDb} from '../db';
import {catalogEdits,storeSettings,inquiries,audit} from '../db/schema';
import {products as seed} from './catalog';
import {defaults,type Product,type Settings} from './store-types';
import {getChatGPTUser} from '../app/chatgpt-auth';
export async function isAdmin(){const u=await getChatGPTUser();const owner=(env as unknown as Record<string,string>).STORE_ADMIN_EMAIL;return !!u&&!!owner&&u.email.toLowerCase()===owner.toLowerCase();}
export async function catalog(includeHidden=false):Promise<Product[]>{const edits=await getDb().select().from(catalogEdits);const merged=new Map<string,Product>((seed as unknown as Product[]).map(p=>[p.id,p]));for(const row of edits)merged.set(row.id,JSON.parse(row.data));return [...merged.values()].filter(p=>includeHidden||p.published);}
export async function settings():Promise<Settings>{const row=await getDb().select().from(storeSettings).where(eq(storeSettings.id,'main')).get();return {...defaults,...(row?JSON.parse(row.data):{})};}
export function publicProduct(p:Product){return {...p,notes:undefined,available:false,stock:0};}
export function sameOrigin(req:Request){const origin=req.headers.get('origin');if(!origin||origin!==new URL(req.url).origin)throw new Error('Invalid request origin.');}
export async function readBody(req:Request){if(!req.headers.get('content-type')?.includes('application/json'))throw new Error('JSON is required.');const text=await req.text();if(text.length>40000)throw new Error('Request is too large.');return JSON.parse(text);}
export function error(message:string,status=400){return Response.json({error:message},{status,headers:{'Cache-Control':'no-store'}});}
export async function log(action:string,target:string){await getDb().insert(audit).values({id:crypto.randomUUID(),action,target,createdAt:new Date().toISOString()});}
export async function dashboard(){return {products:await catalog(true),settings:await settings(),inquiries:await getDb().select().from(inquiries).orderBy(desc(inquiries.createdAt)).limit(250),payment:{enabled:false,reason:'PayPal merchant credentials and a verified fulfillment arrangement are not connected. Requests are not paid orders.'}};}
