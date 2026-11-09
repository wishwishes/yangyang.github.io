import Storefront from './storefront';
import {publicCatalogData} from '../lib/commerce-server';
export const dynamic='force-dynamic';
export default async function Home(){const data=await publicCatalogData();return <Storefront initialProducts={data.products} initialSettings={data.settings} initialCheckout={data.checkoutEnabled}/>;}
