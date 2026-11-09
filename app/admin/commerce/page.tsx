import {requireChatGPTUser} from '../../chatgpt-auth';
import {isAdmin} from '../../../lib/store-server';
import CommerceAdmin from './workspace';
export const dynamic='force-dynamic';
export const metadata={title:'支付与订单管理 | Liang Nü Zhuang',robots:{index:false,follow:false}};
export default async function Page(){await requireChatGPTUser('/admin/commerce');if(!await isAdmin())return <main className="owner-gate"><h1>仅店主可以访问</h1><a href="/">返回商店</a></main>;return <CommerceAdmin/>;}
