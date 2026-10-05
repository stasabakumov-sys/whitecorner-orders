import {Component, effect, input, signal} from '@angular/core';

@Component({
 selector:'app-modeling-section',standalone:true,
 template:`<h2><button type="button" class="option-heading" [attr.aria-label]="title()" [attr.aria-expanded]="expanded()" [attr.aria-controls]="sectionId()+'-options'" [attr.aria-describedby]="sectionId()+'-summary'" (click)="expanded.set(!expanded())">
   <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path [attr.d]="iconPath()"/></svg>
   <span class="option-caption"><strong>{{title()}}</strong><small [id]="sectionId()+'-summary'">{{summary()}}</small></span>
   <svg class="option-chevron" aria-hidden="true" viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" [class.expanded]="expanded()"><path d="m3 4 3 3 3-3"/></svg>
 </button></h2><div class="option-body" [id]="sectionId()+'-options'" [hidden]="!expanded()"><ng-content/></div>`,
 styles:`:host{display:block}h2{margin:0} :host .option-heading{display:flex;align-items:center;gap:10px;width:100%;padding:12px 10px;border:0;border-radius:0;background:#454140;color:#fff;text-align:left;cursor:pointer;font-family:inherit;font-size:10px;font-weight:500;line-height:1.4} .option-heading>svg{flex:none}.option-caption{display:flex;min-width:0;flex-direction:column;gap:4px}.option-caption strong{font-size:9px;font-weight:600;letter-spacing:.09em;text-transform:uppercase}.option-caption small{font-size:10px;font-weight:400;letter-spacing:0;color:#e3e0de;overflow-wrap:anywhere}.option-chevron{margin-left:auto;color:#d4d0ce;transition:transform .15s}.option-chevron.expanded{transform:rotate(180deg)}:host .option-heading:hover{background:#514c4a;color:#fff}:host .option-heading:focus-visible{outline:2px solid #1884e8;outline-offset:-3px}.option-body{padding:10px}.option-body[hidden]{display:none}`,
})
export class ModelingSectionComponent {
 readonly title=input.required<string>();
 readonly summary=input.required<string>();
 readonly sectionId=input.required<string>();
 readonly iconPath=input('M3 7 12 3l9 4-9 4-9-4Zm0 5 9 4 9-4M3 17l9 4 9-4');
 readonly attention=input(false);
 readonly expanded=signal(false);
 constructor(){effect(()=>{if(this.attention())this.expanded.set(true);});}
}
