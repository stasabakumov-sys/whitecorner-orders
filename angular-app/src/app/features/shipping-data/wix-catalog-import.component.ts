import {Component, output, signal} from '@angular/core';
import {SupabaseService} from '../../core/services/supabase.service';
import {environment} from '../../../environments/environment';

@Component({selector:'app-wix-catalog-import',standalone:true,template:`
  <section>
    <h3>Import Wix products</h3>
    <p>Save V1 product cards and variants. Existing packaging, drawings and local costs are kept. Unlinked name matches stop the page for review.</p>
    <button [disabled]="busy()" (click)="run(false)">{{busy()?'Importing…':'Import / resume'}}</button>
    <button [disabled]="busy()" (click)="restartConfirm=true">Start a fresh import</button>
    @if(restartConfirm){<p>Read the catalogue again from the first page? Saved products will be kept.</p><button [disabled]="busy()" (click)="restartConfirm=false;run(true)">Restart from first page</button><button (click)="restartConfirm=false">Cancel</button>}
    @if(message()){<p role="status">{{message()}}</p>}
    @if(error()){<p role="alert">{{error()}}</p>}
    <small>This imports product snapshots and embedded variants. Image files remain hosted by Wix; location inventory and category details are not separately imported.</small>
  </section>
`,styles:[`section{border-top:1px solid #e7edf5;margin-top:20px;padding-top:12px}h3{font-size:15px}button{font:inherit;padding:8px 12px;margin:0 8px 8px 0;border:1px solid #dce5ef;border-radius:8px;background:white;color:#344054;cursor:pointer}button:disabled{opacity:.5}p{line-height:1.5}small{display:block;color:#667085}[role=alert]{color:#b42318}`]})
export class WixCatalogImportComponent {
  readonly saved=output<void>(); readonly busy=signal(false);readonly message=signal('');readonly error=signal(''); restartConfirm=false;
  constructor(private readonly supabase:SupabaseService){}
  async run(restart:boolean){
    if(this.busy())return;this.busy.set(true);this.error.set('');this.message.set('Reading saved import progress…');
    let last=-1,runId='';
    try{
      for(let page=0;page<10000;page++){
        const {data,error}=await this.supabase.client.functions.invoke(environment.wixSyncFunction,{body:{action:'importCatalog',restart:page===0&&restart}});
        if(error){const detail=await error.context?.json?.().catch(()=>null);throw new Error(detail?.error||'Catalogue import failed. Saved pages are kept; resume to retry.');}
        if(data?.ok!==true||typeof data.run_id!=='string'||!Number.isSafeInteger(data.next_offset)||typeof data.complete!=='boolean')throw new Error('Invalid import progress. Resume to check the saved state.');
        if(runId&&runId!==data.run_id)throw new Error('Another session restarted the import. Resume to use the current run.');
        runId=data.run_id;
        this.message.set(`${data.next_offset} / ${data.expected_total??'?'} Wix products saved${data.complete?' — product import complete.':'.'}`);
        if(data.complete){this.saved.emit();return;}
        if(data.next_offset<=last)throw new Error('Import progress stalled. Saved pages are kept.');
        last=data.next_offset;
      }
      throw new Error('Import batch limit reached. Resume to continue.');
    }catch(error){this.error.set(error instanceof Error?error.message:'Import failed');this.saved.emit();}
    finally{this.busy.set(false);}
  }
}
