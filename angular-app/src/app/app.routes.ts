import { Routes } from '@angular/router';
import { HomeComponent } from './features/home/home.component';
import { OrdersComponent } from './features/orders/orders.component';
import { ProductionBoardComponent } from './features/production-board/production-board.component';
import { FulfilmentComponent } from './features/fulfilment/fulfilment.component';
import { AddressReviewComponent } from './features/address-review/address-review.component';
import { ShippingDataComponent } from './features/shipping-data/shipping-data.component';
import { EmailComponent } from './features/email/email.component';
import { FinanceComponent } from './features/finance/finance.component';
import { DeliveryReviewComponent } from './features/delivery-review/delivery-review.component';
import { PartnerPansComponent } from './features/partner-pans/partner-pans.component';

export const routes:Routes=[
  {path:'',pathMatch:'full',redirectTo:'home'},
  {path:'home',component:HomeComponent},
  {path:'orders',component:OrdersComponent},
  {path:'customers',loadComponent:()=>import('./features/customers/customers.component').then(m=>m.CustomersComponent)},
  {path:'delivery-cost-review',component:DeliveryReviewComponent},
  {path:'partner-pans',component:PartnerPansComponent},
  {path:'materials',loadComponent:()=>import('./features/costing/materials.component').then(m=>m.MaterialsComponent)},
  {path:'work-rates',loadComponent:()=>import('./features/costing/work-rates.component').then(m=>m.WorkRatesComponent)},
  {path:'product-costing',loadComponent:()=>import('./features/costing/product-costing.component').then(m=>m.ProductCostingComponent)},
  {path:'production',component:ProductionBoardComponent},
  {path:'shop-floor',loadComponent:()=>import('./features/shop-floor/shop-floor.component').then(m=>m.ShopFloorComponent)},
  {path:'fulfilment',pathMatch:'full',redirectTo:'fulfilment/delivery'},
  {path:'fulfilment/:tab',component:FulfilmentComponent},
  {path:'email',component:EmailComponent},
  {path:'finance',component:FinanceComponent},
  {path:'address-review',component:AddressReviewComponent},
  {path:'shipping-data',component:ShippingDataComponent},
  {path:'**',redirectTo:'home'}
];
