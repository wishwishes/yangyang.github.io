import {env} from 'cloudflare:workers';
import {cookies} from 'next/headers';
import {Commerce,CommerceError,configurationReady,expireStock,hash,productReady,skuFor} from './commerce-core';
import {PayPalClient,type PayPalCredentials,type PayPalMode} from './paypal';
import {commerceDefaults,commerceSettingsSchema,type CommerceReadiness,type CommerceSettings,type InventoryRow,type OrderRow} from './commerce-types';
import {catalog,isAdmin,settings as storeSettings,publicProduct} from './store-server';

const vars=()=>env as unknown as Record<string,string>;
export function commerceDb(){if(!env.DB)throw new CommerceError("Store database is unavailable.",503);return env.DB;}
export function paymentMode():PayPalMode|null {const mode=vars().PAYPAL_MODE;return mode==='live'||mode==='sandbox'?mode:null;}
export function credentialKeys(mode:PayPalMode){return ['CLIENT_ID','SECRET','MERCHANT_ID','WEBHOOK_ID'].map(k=>'PAYPAL_'+mode.toUpperCase()+'_'+k);}
export function credentials(mode:PayPalMode):PayPalCredentials {
 const [clientId,secret,merchantId,webhookId]=credentialKeys(mode).map(k=>vars()[k]);
 if(!clientId||!secret||!merchantId||!webhookId)throw new CommerceError('Payment configuration is incomplete.',503);
 return {mode,clientId,secret,merchantId,webhookId};
}
export function commerce(mode:PayPalMode,origin='https://582916.com'){
 const url=new URL(origin),allowed=['https://582916.com','https://www.582916.com','https://liang-nvzhuang.furryfeast.chatgpt.site'];
 if(!allowed.includes(url.origin)&&!(mode==='sandbox'&&['127.0.0.1','localhost'].includes(url.hostname)))throw new CommerceError('Unsupported checkout origin.');
 return new Commerce(commerceDb(),new PayPalClient(credentials(mode)),url.origin);
}
export async function commerceSettings():Promise<CommerceSettings>{const r=await commerceDb().prepare("SELECT data FROM store_settings WHERE id='commerce'").first<{data:string}>();if(!r)return commerceDefaults;return commerceSettingsSchema.parse({...commerceDefaults,...JSON.parse(r.data)});}
export async function allInventory(){await expireStock(commerceDb());return (await commerceDb().prepare('SELECT * FROM inventory ORDER BY product_id,size').all<InventoryRow>()).results;}
export async function readiness():Promise<CommerceReadiness>{
 const mode=paymentMode(),missingKeys=mode?credentialKeys(mode).filter(k=>!vars()[k]):['PAYPAL_MODE'];
 const config=await commerceSettings(),products=await catalog(),inventory=await allInventory();
 const readyVariants=inventory.filter(i=>i.quantity>0&&products.some(p=>p.id===i.product_id&&p.sizes.includes(i.size)&&productReady(p))).length;
 const configured=configurationReady(config),credentialsReady=!!mode&&missingKeys.length===0;
 return {enabled:credentialsReady&&configured,mode,credentialsReady,missingKeys,configurationReady:configured,policiesConfirmed:config.policiesConfirmed,configuredStates:config.deliveryRules.length,readyVariants};
}
export async function publicCatalogData(){const [r,config,products,inventory,s]=await Promise.all([readiness(),commerceSettings(),catalog(),allInventory(),storeSettings()]);const checkoutEnabled=r.enabled&&r.mode==='live';return {products:products.map(p=>{const stock=inventory.filter(i=>i.product_id===p.id&&p.sizes.includes(i.size)).reduce((n,i)=>n+i.quantity,0);return {...publicProduct(p),available:checkoutEnabled&&productReady(p)&&stock>0,stock:checkoutEnabled?Math.min(stock,5):0};}),settings:checkoutEnabled?{...s,shippingDescription:config.shippingPolicy,returnsDescription:config.returnsPolicy}:s,checkoutEnabled};}
export async function checkoutAccess(){const r=await readiness();const owner=await isAdmin();return {...r,enabled:r.enabled&&(r.mode==='live'||owner),owner};}
export async function session(create=false){
 const jar=await cookies();let token=jar.get('lnz_checkout')?.value;
 if(!token||!/^[a-f0-9]{64}$/.test(token)){if(!create)return null;token=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');jar.set('lnz_checkout',token,{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:7*24*3600});}
 return hash(token);
}
export async function customerOrder(id:string){
 const sessionHash=await session();if(!sessionHash||!/^LNZ-[A-F0-9]{24}$/.test(id))throw new CommerceError('Order not found in this browser.',404);
 const order=await commerceDb().prepare('SELECT * FROM sales_orders WHERE id=? AND session_hash=?').bind(id,sessionHash).first<OrderRow>();
 if(!order)throw new CommerceError('Order not found in this browser.',404);return order;
}
export function publicOrder(order:OrderRow){return {id:order.id,mode:order.mode,items:JSON.parse(order.items),email:order.email,address:JSON.parse(order.address),subtotal:order.subtotal,shipping:order.shipping,tax:order.tax,total:order.total,paymentStatus:order.payment_status,fulfillmentStatus:order.fulfillment_status,trackingCarrier:order.tracking_carrier,trackingNumber:order.tracking_number,createdAt:order.created_at,expiresAt:order.expires_at,approvalUrl:order.payment_status==='awaiting_approval'?order.approval_url:null};}
export function commerceResponse(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});}
export function commerceFailure(e:unknown){if(e instanceof CommerceError)return commerceResponse({error:e.message},e.status);return commerceResponse({error:'The request could not be completed. Check your information and try again.'},400);}
export async function writeInventory(productId:string,size:string,quantity:number){const products=await catalog(true),product=products.find(p=>p.id===productId);if(!product||!product.sizes.includes(size))throw new CommerceError('Unknown product size.');const sku=skuFor(productId,size);await commerceDb().prepare('INSERT INTO inventory (sku,product_id,size,quantity,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(sku) DO UPDATE SET quantity=excluded.quantity,updated_at=excluded.updated_at').bind(sku,productId,size,quantity,new Date().toISOString()).run();}
