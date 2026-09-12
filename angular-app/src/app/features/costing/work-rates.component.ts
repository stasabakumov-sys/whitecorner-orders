import {CommonModule} from '@angular/common';
import {Component,OnInit} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {SupabaseService} from '../../core/services/supabase.service';
import {WorkRate} from './planned-work-cost';

@Component({selector:'app-work-rates',standalone:true,imports:[CommonModule,FormsModule],styleUrl:'./costing.css',template:`
 <header><div><h1>Work Rates</h1><p>AUD per hour, including GST. Sanding is one shared rate for product sanding and paint sanding operations.</p></div><button (click)="load()" [disabled]="loading||busy">Refresh</button></header>
 @if(error){<p role="alert">{{error}}</p>}@if(done){<p role="status">Work rate saved.</p>}
 <div class="table-wrap"><table><thead><tr><th>Work type</th><th>Hourly rate · incl. GST</th><th>Updated</th><th></th></tr></thead><tbody>
 @for(row of rows;track row.work_type){<tr><td><b>{{row.label}}</b>@if(row.work_type==='sanding'){<small>Product sanding + First/Second sanding</small>}</td><td><input type="number" min="0" step="0.01" [(ngModel)]="draft[row.work_type]" [attr.aria-label]="row.label+' hourly rate'"></td><td>{{row.updated_at|date:'dd MMM yyyy, HH:mm'}}</td><td><button class="primary" (click)="save(row)" [disabled]="busy||!valid(row)">Save</button></td></tr>}
 </tbody></table></div>
 `})
export class WorkRatesComponent implements OnInit{
 rows:WorkRate[]=[];draft:Record<string,number|null>={};loading=false;busy=false;error='';done=false;
 constructor(private db:SupabaseService){}ngOnInit(){void this.load();}
 async load(){this.loading=true;this.error='';this.done=false;const {data,error}=await this.db.client.from('wc_work_rates').select('*').order('sort_order');this.loading=false;if(error){this.error='Could not load work rates. Refresh and retry.';return;}this.rows=(data||[]) as WorkRate[];this.draft=Object.fromEntries(this.rows.map(row=>[row.work_type,row.rate_gst_hour]));}
 valid(row:WorkRate){const value=this.draft[row.work_type];return value!==null&&value!==undefined&&Number.isFinite(Number(value))&&Number(value)>=0;}
 async save(row:WorkRate){if(this.busy||!this.valid(row))return;this.busy=true;this.error='';this.done=false;const {error}=await this.db.client.rpc('wc_save_work_rate',{p_type:row.work_type,p_rate:Number(this.draft[row.work_type]),p_expected:row.updated_at});this.busy=false;if(error){this.error=error.message||'Could not save work rate. Refresh and retry.';return;}await this.load();this.done=true;}
}
