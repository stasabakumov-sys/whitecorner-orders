import {Component, OnInit, computed, signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {DatePipe} from '@angular/common';
import {SupabaseService} from '../../core/services/supabase.service';
import {HubMembersService} from '../../core/services/hub-members.service';

type Review = {
  id: string; subject: 'product'|'store'; fera_product_id: string|null; shipping_product_id: string|null; product_override_id: string|null;
  rating: number|null; title: string|null; body: string|null;
  author_display_name: string|null; public_author_name: string|null;
  reviewed_at: string|null; source_state: string|null; is_published: boolean;
  published_at: string|null;
};
type Media = {id:string;review_id:string;media_type:'photo'|'video'|null;storage_path:string|null;storage_parts:{path:string;bytes:number}[]};
type Product = {id:string;product_name:string};

@Component({
  selector: 'app-reviews', standalone: true, imports: [FormsModule, DatePipe],
  template: `
  <section class="reviews-page">
    <header><h1>Reviews</h1><p>{{reviews().length}} imported · {{publishedCount()}} published · {{unmatchedCount()}} unmatched products · {{missingCount()}} missing attachments</p></header>
    @if (!members.manager()) {<p class="notice">Manager access required.</p>}
    @else {
      <div class="controls">
        <input aria-label="Search reviews" placeholder="Search reviews" [ngModel]="search()" (ngModelChange)="search.set($event)" />
        <select aria-label="Review type" [ngModel]="typeFilter()" (ngModelChange)="typeFilter.set($event)"><option value="all">All types</option><option value="product">Product</option><option value="store">Store</option></select>
        <select aria-label="Publication" [ngModel]="publicationFilter()" (ngModelChange)="publicationFilter.set($event)"><option value="all">All publication states</option><option value="published">Published</option><option value="draft">Not published</option></select>
        <select aria-label="Product links" [ngModel]="linkFilter()" (ngModelChange)="linkFilter.set($event)"><option value="all">All product links</option><option value="unmatched">Unmatched products</option></select>
        <button type="button" class="refresh" (click)="load()" [disabled]="loading()">{{loading()?'Loading…':'Refresh'}}</button>
      </div>
      @if (error()) {<p class="error" role="alert">{{error()}} <button type="button" (click)="load()">Retry</button></p>}
      @if (success()) {<p class="success" role="status">{{success()}}</p>}
      <div class="table-wrap"><table><thead><tr><th>Review</th><th>Type</th><th>Media</th><th>Date</th><th>Publication</th><th>Action</th></tr></thead><tbody>
      @for (review of filtered(); track review.id) {
        <tr>
          <td><div class="stars" [attr.aria-label]="(review.rating || 0) + ' of 5 stars'">{{stars(review.rating)}}</div><strong>{{review.title || 'Untitled review'}}</strong><p>{{review.body || 'No text'}}</p><small>Fera: {{review.author_display_name || 'Unknown'}} · {{review.source_state || 'Unknown state'}}</small></td>
          <td>{{review.subject}}@if(review.subject==='product'){
            <small class="product-name">{{productName(review.product_override_id || review.shipping_product_id) || 'Unmatched product'}}</small>
            @if(!review.shipping_product_id && !review.product_override_id && review.fera_product_id){<small class="product-name">Fera ID: {{review.fera_product_id}}</small>}
            @if(editing()===review.id){<label>Product link
              <select aria-label="Product link" [(ngModel)]="draftProductOverride">
                <option value="">Use imported match</option>
                @for(product of products();track product.id){<option [value]="product.id">{{product.product_name}}</option>}
              </select></label>}
          }</td>
          <td><span>{{mediaFor(review.id).length}} attached</span>@if(missingFor(review.id)){<b class="missing">{{missingFor(review.id)}} unavailable</b>}
            <div class="thumbs">@for(item of mediaFor(review.id);track item.id){
              @if(item.media_type==='photo'){<button type="button" (click)="openMedia(item)" title="Open photo" [attr.aria-label]="'Open review photo'"><img [src]="previewUrls()[item.id] || ''" alt="Review photo" /></button>}
              @else {<button type="button" (click)="openMedia(item)" title="Open video" aria-label="Open review video">▶ Video</button>}
            }</div>
          </td>
          <td>{{review.reviewed_at | date:'mediumDate'}}</td>
          <td><span class="status" [class.live]="review.is_published">{{review.is_published?'Published':'Private'}}</span>
            @if(editing()===review.id){<label>Public name<input aria-label="Public author name" [(ngModel)]="draftName" maxlength="100" placeholder="Customer" /></label>}
          </td>
          <td><div class="actions">
            @if(editing()===review.id){<button class="icon" type="button" title="Save" aria-label="Save review publication" [disabled]="saving()" (click)="save(review)">✓</button><button class="icon" type="button" title="Cancel" aria-label="Cancel editing" (click)="editing.set(null)">×</button>}
            @else {<button class="icon" type="button" title="Edit" aria-label="Edit review publication" (click)="edit(review)">✎</button>}
          </div></td>
        </tr>
      } @empty {<tr><td colspan="6" class="empty">No reviews match these filters.</td></tr>}
      </tbody></table></div>
      @if(editing()){<div class="publish-bar"><span>Choose whether this review appears on the customer site.</span><label><input type="checkbox" [(ngModel)]="draftPublished" /> Publish review</label></div>}
    }
  </section>`,
  styles: [`
  :host{display:block;color:#202b3b}.reviews-page{padding:12px 4px 30px}header h1{margin:0}header p{margin:6px 0 18px;color:#667085;font-size:13px}.controls{display:flex;flex-wrap:wrap;gap:9px;margin-bottom:14px}.controls input,.controls select,.controls button{height:35px;border:1px solid #d5dce5;background:#fff;border-radius:8px;padding:0 10px;color:#344054;font-size:12px}.controls input{min-width:220px}.controls button{cursor:pointer}.table-wrap{background:#fff;border:1px solid #dfe3e8;border-radius:12px;overflow:auto}table{width:100%;border-collapse:collapse;text-align:left;min-width:790px}th{background:#f8fafc;font-size:11px;color:#667085;font-weight:600;padding:11px 12px}td{border-top:1px solid #edf0f4;padding:10px 12px;vertical-align:top;font-size:12px}td:first-child{min-width:300px;max-width:470px}td p{margin:5px 0;line-height:1.45;white-space:pre-wrap}td small{color:#667085}.product-name{display:block;margin-top:6px;max-width:180px;line-height:1.35}.stars{color:#d69b31;letter-spacing:1px;margin-bottom:4px}.status{display:inline-block;color:#667085;background:#f2f4f7;border-radius:5px;padding:4px 6px}.status.live{color:#067647;background:#ecfdf3}.missing{display:block;color:#b42318;font-size:11px;margin-top:4px}.thumbs{display:flex;gap:4px;flex-wrap:wrap;margin-top:5px}.thumbs button{width:42px;height:42px;border:1px solid #dfe3e8;border-radius:5px;background:#f9fafb;cursor:pointer;font-size:9px}.thumbs img{width:100%;height:100%;object-fit:cover}.actions{display:flex;gap:4px}.icon{width:29px;height:29px;display:grid;place-items:center;border:1px solid #d0d5dd;border-radius:6px;background:#fff;color:#344054;cursor:pointer}.icon:disabled{opacity:.6;cursor:default}td label{display:block;color:#667085;margin-top:8px}td label input,td label select{display:block;width:160px;border:1px solid #d0d5dd;border-radius:6px;padding:6px;margin-top:4px;background:#fff}.publish-bar{display:flex;gap:16px;align-items:center;margin-top:12px;color:#475467;font-size:12px}.publish-bar label{display:flex;gap:5px;align-items:center}.error,.success,.notice{padding:10px 12px;border-radius:8px;font-size:12px}.error{color:#b42318;background:#fef3f2}.error button{border:0;background:transparent;color:inherit;text-decoration:underline;cursor:pointer}.success{color:#067647;background:#ecfdf3}.notice{background:#fff}.empty{text-align:center;color:#667085;padding:32px}
  `]
})
export class ReviewsComponent implements OnInit {
  readonly reviews = signal<Review[]>([]);
  readonly media = signal<Media[]>([]);
  readonly products = signal<Product[]>([]);
  readonly previewUrls = signal<Record<string,string>>({});
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly editing = signal<string|null>(null);
  readonly search = signal(''); readonly typeFilter = signal('all'); readonly publicationFilter = signal('all'); readonly linkFilter = signal('all'); draftName = ''; draftPublished = false; draftProductOverride = '';
  readonly publishedCount = computed(() => this.reviews().filter(row => row.is_published).length);
  readonly missingCount = computed(() => this.media().filter(row => !row.storage_path).length);
  readonly unmatchedCount = computed(() => this.reviews().filter(row => row.subject==='product'&&!row.shipping_product_id&&!row.product_override_id).length);
  readonly filtered = computed(() => this.reviews().filter(row => {
    const query = this.search().trim().toLowerCase();
    return (!query || [row.title,row.body,row.author_display_name].some(value => value?.toLowerCase().includes(query)))
      && (this.typeFilter() === 'all' || row.subject === this.typeFilter())
      && (this.publicationFilter() === 'all' || (row.is_published ? 'published' : 'draft') === this.publicationFilter())
      && (this.linkFilter() === 'all' || (row.subject==='product'&&!row.shipping_product_id&&!row.product_override_id));
  }));
  constructor(private db:SupabaseService, readonly members:HubMembersService) {}
  ngOnInit() {void this.load();}
  mediaFor(id:string){return this.media().filter(item => item.review_id === id && !!item.storage_path);}
  missingFor(id:string){return this.media().filter(item => item.review_id === id && !item.storage_path).length;}
  productName(id:string|null){return this.products().find(product=>product.id===id)?.product_name||null;}
  stars(value:number|null){return '★'.repeat(Math.max(0,Math.min(5,value||0)))+'☆'.repeat(5-Math.max(0,Math.min(5,value||0)));}
  async load(){
    if(!this.members.manager())return;
    this.loading.set(true);this.error.set('');
    try{
      const [reviewResult,mediaResult,productResult]=await Promise.all([
        this.db.client.from('wc_fera_reviews').select('id,subject,fera_product_id,shipping_product_id,product_override_id,rating,title,body,author_display_name,public_author_name,reviewed_at,source_state,is_published,published_at').order('reviewed_at',{ascending:false}).limit(500),
        this.db.client.from('wc_fera_review_media').select('id,review_id,media_type,storage_path,storage_parts').limit(1000),
        this.db.client.from('wc_shipping_products').select('id,product_name').order('product_name').limit(1000),
      ]);
      if(reviewResult.error)throw reviewResult.error;if(mediaResult.error)throw mediaResult.error;if(productResult.error)throw productResult.error;
      this.reviews.set((reviewResult.data||[]) as Review[]);this.media.set((mediaResult.data||[]) as Media[]);this.products.set((productResult.data||[]) as Product[]);
      const photos=(mediaResult.data||[]).filter(row=>row.media_type==='photo'&&row.storage_path&&!row.storage_parts?.length);
      const urls:Record<string,string>={};
      await Promise.all(photos.map(async item=>{const {data}=await this.db.client.storage.from('fera-review-media').createSignedUrl(item.storage_path!,3600);if(data?.signedUrl)urls[item.id]=data.signedUrl;}));
      this.previewUrls.set(urls);
    }catch(e){this.error.set('Reviews could not be loaded: '+((e as Error)?.message||'connection error')+'. Check access and retry.');}
    finally{this.loading.set(false);}
  }
  edit(row:Review){this.editing.set(row.id);this.draftName=row.public_author_name||'';this.draftPublished=row.is_published;this.draftProductOverride=row.product_override_id||'';this.error.set('');this.success.set('');}
  async save(row:Review){
    if(this.saving())return;
    this.saving.set(true);this.error.set('');this.success.set('');
    try{
      const value={is_published:this.draftPublished,public_author_name:this.draftName.trim()||null,published_at:this.draftPublished?(row.published_at||new Date().toISOString()):null,
        ...(row.subject==='product'?{product_override_id:this.draftProductOverride||null}:{})};
      const {data,error}=await this.db.client.from('wc_fera_reviews').update(value).eq('id',row.id).select('id').single();
      if(error||!data)throw error||new Error('Hub did not confirm the change');
      this.editing.set(null);this.success.set(this.draftPublished?'Review published.':'Review kept private.');await this.load();
    }catch(e){this.error.set('Publication could not be saved: '+((e as Error)?.message||'connection error')+'. Your changes are still here; retry.');}
    finally{this.saving.set(false);}
  }
  async openMedia(item:Media){
    if(!item.storage_path)return;
    try{
      if(item.storage_parts?.length&&!this.reviews().find(row=>row.id===item.review_id)?.is_published)
        throw new Error('This video is stored in parts. Publish the review to preview it on the test site');
      const url=item.storage_parts?.length
        ? `https://zgvnrpspwluapaxnycrg.supabase.co/functions/v1/hub-reviews-public/media/${item.id}`
        : (await this.db.client.storage.from('fera-review-media').createSignedUrl(item.storage_path,3600)).data?.signedUrl;
      if(!url)throw new Error('Link could not be created');
      window.open(url,'_blank','noopener,noreferrer');
    }catch(e){this.error.set('Media could not be opened: '+((e as Error)?.message||'connection error')+'. Retry.');}
  }
}
