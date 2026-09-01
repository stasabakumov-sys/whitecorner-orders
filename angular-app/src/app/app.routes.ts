import { Routes } from '@angular/router';
import { HomeComponent } from './features/home/home.component';
import { OrdersComponent } from './features/orders/orders.component';
import { ProductionBoardComponent } from './features/production-board/production-board.component';
import { FulfilmentComponent } from './features/fulfilment/fulfilment.component';
import { AddressReviewComponent } from './features/address-review/address-review.component';
import { ShippingDataComponent } from './features/shipping-data/shipping-data.component';
import { EmailComponent } from './features/email/email.component';
import { FinanceComponent } from './features/finance/finance.component';

export const routes:Routes=[
  {path:'',pathMatch:'full',redirectTo:'home'},
  {path:'home',component:HomeComponent},
  {path:'orders',component:OrdersComponent},
  {path:'production',component:ProductionBoardComponent},
  {path:'fulfilment',pathMatch:'full',redirectTo:'fulfilment/delivery'},
  {path:'fulfilment/:tab',component:FulfilmentComponent},
  {path:'email',component:EmailComponent},
  {path:'finance',component:FinanceComponent},
  {path:'address-review',component:AddressReviewComponent},
  {path:'shipping-data',component:ShippingDataComponent},
  {path:'**',redirectTo:'home'}
];
