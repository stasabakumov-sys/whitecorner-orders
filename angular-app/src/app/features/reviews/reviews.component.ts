import {Component, OnInit, computed, signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {DatePipe} from '@angular/common';
import {ActivatedRoute, Router} from '@angular/router';
import {SupabaseService} from '../../core/services/supabase.service';
import {HubMembersService} from '../../core/services/hub-members.service';

type Review = {
  id: string; subject: 'product'|'store'; fera_product_id: string|null; shipping_product_id: string|null; product_override_id: string|null;
  rating: number|null; title: string|null; body: string|null;
  author_display_name: string|null; public_author_name: string|null;
  reviewed_at: string|null; source_state: string|null; is_published: boolean;
  published_at: string|null;
};
type Media = {id:string;review_id:string;media_type:'photo'|'video'|null;storage_path:string|null;storage_parts:{path:string;bytes:number}[];is_cover:boolean};
type Product = {id:string;product_name:string};

@Component({
  selector: 'app-reviews', standalone: true, imports: [FormsModule, DatePipe],
  styleUrls: ['./reviews.component.css'],
  template: `
  <section class="reviews-page">
    <header><h1>@switch(section()){@case('overview'){Reviews overview}@case('product'){Product reviews}@case('store'){Store reviews}@case('media'){Photos & videos}@case('products'){Products by reviews}@case('messages'){Review messages}@default{Reviews}}</h1><p>{{reviews().length}} imported · {{publishedCount()}} published · {{unmatchedCount()}} unmatched products · {{missingCount()}} missing attachments</p></header>
    @if (!members.manager()) {<p class="notice">Manager access required.</p>}
    @else {
      @if (section()==='overview') {
        <div class="overview-stats"><div><small>REVIEWS</small><strong>{{reviews().length}}</strong></div><div><small>PHOTOS & VIDEOS</small><strong>{{media().length}}</strong></div><div><small>PUBLISHED</small><strong>{{publishedCount()}}</strong></div><div><small>AVERAGE RATING</small><strong>{{averageRating()}}</strong></div></div>
        <div class="overview-panel"><h2>Customer reviews by month</h2><div class="month-chart">@for(row of monthRows();track row.month){<div class="month"><strong>{{row.count}}</strong><div class="month-bar" [style.height.px]="Math.max(8,row.count*14)"></div><small>{{row.month}}</small></div>}@empty{<p>No dated reviews to chart.</p>}</div></div>
        <div class="overview-panel"><h2>Review management</h2><p>Review publication, product links and the first photo are managed in the Reviews and Photos & videos sections. Imported Fera content remains the source of review text.</p></div>
      }
      @if (section()==='media') {
        @if(!coverReady()){<p class="notice">First-photo selection will be available after the database update.</p>}
        <div class="controls"><select aria-label="Media type" [ngModel]="typeFilter()" (ngModelChange)="typeFilter.set($event)"><option value="all">All media</option><option value="photo">Photos</option><option value="video">Videos</option></select><button type="button" (click)="load()" [disabled]="loading()">{{loading()?'Loading…':'Refresh'}}</button></div>
        <div class="media-grid">@for(item of media();track item.id){@if(item.storage_path && (typeFilter()==='all'||item.media_type===typeFilter())){<div class="media-card"><button type="button" class="media-preview" (click)="openMedia(item)" [title]="item.media_type==='photo'?'Open photo':'Open video'">@if(item.media_type==='photo'){<img [src]="previewUrls()[item.id] || ''" alt="Customer review photo" />}@else{<span>▶ Video</span>}</button><div class="media-meta"><span>{{item.media_type==='photo'?'Photo':'Video'}} @if(item.is_cover){· First photo}</span>@if(item.media_type==='photo'){<button type="button" class="icon" [disabled]="!coverReady() || savingCover()!==null || item.is_cover" (click)="setCover(item)" [attr.aria-label]="item.is_cover?'First photo of review':'Set as first photo of review'" [title]="item.is_cover?'First photo':'Set as first photo'">{{item.is_cover?'★':'☆'}}</button>}</div></div>}}</div>
      }
      @if (section()==='products') {
        <div class="table-wrap"><table><thead><tr><th>Product</th><th>Review count</th><th>Average rating</th><th>Action</th></tr></thead><tbody>@for(row of productRows();track row.id){<tr><td>{{row.name}}</td><td>{{row.count}}</td><td>{{row.average}} ★</td><td><button type="button" class="icon" title="Show reviews" [attr.aria-label]="'Show reviews for '+row.name" (click)="showProductReviews(row.id)">↗</button></td></tr>}@empty{<tr><td colspan="4" class="empty">No product reviews are linked to catalog products yet.</td></tr>}</tbody></table></div>
      }
      @if (section()==='messages') {<div class="message-state"><h2>Review requests and messages</h2><p>Fera request messages have not been imported into Hub. This section will show real requests after a separate migration of their source data.</p></div>}
      @if (section()==='product' || section()==='store') {
      <div class="controls">
        <input aria-label="Search reviews" placeholder="Search reviews" [ngModel]="search()" (ngModelChange)="search.set($event)" />
        @if(selectedProductId()){<button type="button" (click)="selectedProductId.set(null)">Clear product filter</button>}
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
              @if(item.media_type==='photo'){<div class="thumb"><button type="button" (click)="openMedia(item)" title="Open photo" aria-label="Open review photo"><img [src]="previewUrls()[item.id] || ''" alt="Review photo" /></button><button type="button" class="cover" [disabled]="!coverReady() || savingCover()!==null || item.is_cover" (click)="setCover(item)" [title]="item.is_cover?'First photo':'Set as first photo'" [attr.aria-label]="item.is_cover?'First photo of review':'Set as first photo of review'">{{item.is_cover?'★':'☆'}}</button></div>}
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
    }
  </section>`,
  styles: [`
  :host{display:block;color:#202b3b}.reviews-page{padding:12px 4px 30px}header h1{margin:0}header p{margin:6px 0 18px;color:#667085;font-size:13px}.controls{display:flex;flex-wrap:wrap;gap:9px;margin-bottom:14px}.controls input,.controls select,.controls button{height:35px;border:1px solid #d5dce5;background:#fff;border-radius:8px;padding:0 10px;color:#344054;font-size:12px}.controls input{min-width:220px}.controls button{cursor:pointer}.table-wrap{background:#fff;border:1px solid #dfe3e8;border-radius:12px;overflow:auto}table{width:100%;border-collapse:collapse;text-align:left;min-width:790px}th{background:#f8fafc;font-size:11px;color:#667085;font-weight:600;padding:11px 12px}td{border-top:1px solid #edf0f4;padding:10px 12px;vertical-align:top;font-size:12px}td:first-child{min-width:300px;max-width:470px}td p{margin:5px 0;line-height:1.45;white-space:pre-wrap}td small{color:#667085}.product-name{display:block;margin-top:6px;max-width:180px;line-height:1.35}.stars{color:#d69b31;letter-spacing:1px;margin-bottom:4px}.status{display:inline-block;color:#667085;background:#f2f4f7;border-radius:5px;padding:4px 6px}.status.live{color:#067647;background:#ecfdf3}.missing{display:block;color:#b42318;font-size:11px;margin-top:4px}.thumbs{display:flex;gap:4px;flex-wrap:wrap;margin-top:5px}.thumbs button{width:42px;height:42px;border:1px solid #dfe3e8;border-radius:5px;background:#f9fafb;cursor:pointer;font-size:9px}.thumbs img{width:100%;height:100%;object-fit:cover}.actions{display:flex;gap:4px}.icon{width:29px;height:29px;display:grid;place-items:center;border:1px solid #d0d5dd;border-radius:6px;background:#fff;color:#344054;cursor:pointer}.icon:disabled{opacity:.6;cursor:default}td label{display:block;color:#667085;margin-top:8px}td label input,td label select{display:block;width:160px;border:1px solid #d0d5dd;border-radius:6px;padding:6px;margin-top:4px;background:#fff}.publish-bar{display:flex;gap:16px;align-items:center;margin-top:12px;color:#475467;font-size:12px}.publish-bar label{display:flex;gap:5px;align-items:center}.error,.success,.notice{padding:10px 12px;border-radius:8px;font-size:12px}.error{color:#b42318;background:#fef3f2}.error button{border:0;background:transparent;color:inherit;text-decoration:underline;cursor:pointer}.success{color:#067647;background:#ecfdf3}.notice{background:#fff}.empty{text-align:center;color:#667085;padding:32px}
  `]
})
export class ReviewsComponent implements OnInit {
  readonly Math = Math;
  readonly section = signal('overview');
  readonly reviews = signal<Review[]>([]);
  readonly media = signal<Media[]>([]);
  readonly products = signal<Product[]>([]);
  readonly previewUrls = signal<Record<string,string>>({});
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly savingCover = signal<string|null>(null);
  readonly coverReady = signal(true);
  readonly error = signal('');
  readonly success = signal('');
  readonly editing = signal<string|null>(null);
  readonly search = signal(''); readonly typeFilter = signal('all'); readonly publicationFilter = signal('all'); readonly linkFilter = signal('all'); draftName = ''; draftPublished = false; draftProductOverride = '';
  readonly selectedProductId = signal<string|null>(null);
  readonly publishedCount = computed(() => this.reviews().filter(row => row.is_published).length);
  readonly averageRating = computed(() => {const rated=this.reviews().filter(row=>row.rating!==null);return rated.length?(rated.reduce((sum,row)=>sum+(row.rating||0),0)/rated.length).toFixed(1):'—';});
  readonly productRows = computed(() => this.products().map(product=>{const reviews=this.reviews().filter(row=>row.subject==='product'&&(row.product_override_id||row.shipping_product_id)===product.id);return {id:product.id,name:product.product_name,count:reviews.length,average:reviews.length?(reviews.reduce((sum,row)=>sum+(row.rating||0),0)/reviews.length).toFixed(1):'—'};}).filter(row=>row.count).sort((a,b)=>b.count-a.count));
  readonly monthRows = computed(() => {const months=new Map<string,number>();for(const row of this.reviews()){if(!row.reviewed_at)continue;const key=row.reviewed_at.slice(0,7);months.set(key,(months.get(key)||0)+1);}return [...months].sort((a,b)=>a[0].localeCompare(b[0])).slice(-12).map(([month,count])=>({month,count}));});
  readonly missingCount = computed(() => this.media().filter(row => !row.storage_path).length);
  readonly unmatchedCount = computed(() => this.reviews().filter(row => row.subject==='product'&&!row.shipping_product_id&&!row.product_override_id).length);
  readonly filtered = computed(() => this.reviews().filter(row => {
    const query = this.search().trim().toLowerCase();
    return (this.section()==='store'?row.subject==='store':row.subject==='product')
      && (!this.selectedProductId() || (row.product_override_id||row.shipping_product_id)===this.selectedProductId())
      && (!query || [row.title,row.body,row.author_display_name].some(value => value?.toLowerCase().includes(query)))
      && (this.publicationFilter() === 'all' || (row.is_published ? 'published' : 'draft') === this.publicationFilter())
      && (this.linkFilter() === 'all' || (row.subject==='product'&&!row.shipping_product_id&&!row.product_override_id));
  }));
  constructor(private db:SupabaseService, readonly members:HubMembersService, private route:ActivatedRoute, private router:Router) {}
  ngOnInit() {this.route.paramMap.subscribe(params=>this.section.set(params.get('section')||'overview'));void this.load();}
  mediaFor(id:string){return this.media().filter(item => item.review_id === id && !!item.storage_path).sort((a,b)=>Number(b.is_cover)-Number(a.is_cover));}
  missingFor(id:string){return this.media().filter(item => item.review_id === id && !item.storage_path).length;}
  productName(id:string|null){return this.products().find(product=>product.id===id)?.product_name||null;}
  stars(value:number|null){return '★'.repeat(Math.max(0,Math.min(5,value||0)))+'☆'.repeat(5-Math.max(0,Math.min(5,value||0)));}
  async load(){
    if(!this.members.manager())return;
    this.loading.set(true);this.error.set('');
    try{
      const [reviewResult,mediaResult,productResult]=await Promise.all([
        this.db.client.from('wc_fera_reviews').select('id,subject,fera_product_id,shipping_product_id,product_override_id,rating,title,body,author_display_name,public_author_name,reviewed_at,source_state,is_published,published_at').order('reviewed_at',{ascending:false}).limit(500),
        this.db.client.from('wc_fera_review_media').select('id,review_id,media_type,storage_path,storage_parts,is_cover').limit(1000),
        this.db.client.from('wc_shipping_products').select('id,product_name').order('product_name').limit(1000),
      ]);
      if(reviewResult.error)throw reviewResult.error;if(productResult.error)throw productResult.error;
      let mediaRows:Media[];
      if(mediaResult.error && /is_cover/i.test(mediaResult.error.message)){
        const fallback=await this.db.client.from('wc_fera_review_media').select('id,review_id,media_type,storage_path,storage_parts').limit(1000);
        if(fallback.error)throw fallback.error;
        mediaRows=(fallback.data||[]).map(row=>({...row,is_cover:false})) as Media[];
        this.coverReady.set(false);
      }else{
        if(mediaResult.error)throw mediaResult.error;
        mediaRows=(mediaResult.data||[]) as Media[];
        this.coverReady.set(true);
      }
      this.reviews.set((reviewResult.data||[]) as Review[]);this.media.set(mediaRows);this.products.set((productResult.data||[]) as Product[]);
      const photos=mediaRows.filter(row=>row.media_type==='photo'&&row.storage_path&&!row.storage_parts?.length);
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
  async setCover(item:Media){
    if(this.savingCover()||!this.coverReady()||item.media_type!=='photo'||!item.storage_path)return;
    this.savingCover.set(item.id);this.error.set('');this.success.set('');
    try{
      const {error}=await this.db.client.rpc('wc_set_fera_review_cover',{p_review_id:item.review_id,p_media_id:item.id});
      if(error)throw error;
      this.media.update(rows=>rows.map(row=>row.review_id===item.review_id?{...row,is_cover:row.id===item.id}:row));
      this.success.set('First photo saved for this review.');
    }catch(e){this.error.set('First photo could not be saved: '+((e as Error)?.message||'connection error')+'. Select it again to retry.');}
    finally{this.savingCover.set(null);}
  }
  showProductReviews(id:string){this.selectedProductId.set(id);this.search.set('');void this.router.navigate(['/reviews/product']);}
}
