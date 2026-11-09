import {z} from 'zod';
export const usStates=['AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];
export const commerceSettingsSchema=z.object({
  salesRequested:z.boolean(), policiesConfirmed:z.boolean(), sellerName:z.string().trim().max(150),
  shippingPolicy:z.string().trim().max(3000), returnsPolicy:z.string().trim().max(3000),
  deliveryRules:z.array(z.object({state:z.string().refine(v=>usStates.includes(v)),shippingCents:z.number().int().min(0).max(100000),taxBasisPoints:z.number().int().min(0).max(2500)})).max(51)
}).refine(v=>new Set(v.deliveryRules.map(r=>r.state)).size===v.deliveryRules.length,'Each state may appear only once.');
export type CommerceSettings=z.infer<typeof commerceSettingsSchema>;
export const commerceDefaults:CommerceSettings={salesRequested:false,policiesConfirmed:false,sellerName:'',shippingPolicy:'',returnsPolicy:'',deliveryRules:[]};
export const addressSchema=z.object({name:z.string().trim().min(2).max(100),line1:z.string().trim().min(3).max(150),line2:z.string().trim().max(150).default(''),city:z.string().trim().min(2).max(100),state:z.string().refine(v=>usStates.includes(v)),zip:z.string().regex(/^\d{5}(-\d{4})?$/),country:z.literal('US')});
export type DeliveryAddress=z.infer<typeof addressSchema>;
export const checkoutInputSchema=z.object({key:z.string().uuid(),email:z.string().trim().email().max(200),address:addressSchema,items:z.array(z.object({id:z.string().max(80),size:z.string().min(1).max(30),quantity:z.number().int().min(1).max(5)})).min(1).max(12),expectedTotal:z.number().int().min(100).max(1000000),consent:z.literal(true)});
export type CheckoutInput=z.infer<typeof checkoutInputSchema>;
export type OrderItem={id:string;sku:string;name:string;size:string;quantity:number;price:number};
export type InventoryRow={sku:string;product_id:string;size:string;quantity:number;updated_at:string};
export type OrderRow={id:string;checkout_key:string;session_hash:string;request_digest:string;request_hash:string;request_window:number;mode:'live'|'sandbox';email:string;address:string;items:string;subtotal:number;shipping:number;tax:number;total:number;payment_status:string;reservation_status:string;paypal_order_id:string|null;capture_id:string|null;refund_id:string|null;approval_url:string|null;fulfillment_status:string;tracking_carrier:string;tracking_number:string;created_at:string;updated_at:string;expires_at:number;issue:string};
export type CommerceReadiness={enabled:boolean;mode:'live'|'sandbox'|null;credentialsReady:boolean;missingKeys:string[];configurationReady:boolean;policiesConfirmed:boolean;configuredStates:number;readyVariants:number};
export const orderLabels:Record<string,string>={creating:'正在创建支付',awaiting_approval:'等待买家确认',capturing:'正在核实收款',payment_pending:'付款处理中',paid:'已确认收款',failed:'付款失败',cancelled:'已取消',expired:'已过期',refunding:'退款处理中',refunded:'已全额退款',partially_refunded:'已部分退款',reversed:'付款已撤回',review_required:'需要人工核实'};
