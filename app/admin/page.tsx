import {requireChatGPTUser,chatGPTSignOutPath} from '../chatgpt-auth';
import {isAdmin} from '../../lib/store-server';
import Admin from './store-admin';
export const dynamic='force-dynamic';
export default async function Page(){await requireChatGPTUser('/admin');if(!await isAdmin())return <main className="owner-gate"><p className="eyebrow">LIANG NÜ ZHUANG</p><h1>仅店主可以管理此商店</h1><p>请使用创建本网站的 ChatGPT 账号登录。</p><a className="button outline" href={chatGPTSignOutPath('/admin')} target="_top">切换账号</a><a className="text-link" href="/">返回商店</a></main>;return <Admin/>;}
