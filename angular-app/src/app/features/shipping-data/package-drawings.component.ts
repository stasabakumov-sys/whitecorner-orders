import {Component,Input} from '@angular/core';
import {BoxDrawingComponent} from './box-drawing.component';

// Backdrops share exactly one drawing per product size and folding option.
@Component({selector:'app-package-drawings',standalone:true,imports:[BoxDrawingComponent],template:`
 @if(backdrop){
  @if(sharedSize){<small>{{sizeLabel}}</small><app-box-drawing [sharedSize]="sharedSize" />}
  @else{<small role="alert">Set an unambiguous product size and Foldable Yes/No in the packaging profile before selecting its drawing.</small>}
 }@else{<app-box-drawing [signature]="signature" [index]="index" [box]="box" />}
 `,styles:[`small{display:block;color:var(--wc-muted);font-size:.8rem;margin-bottom:5px}.shared{margin-top:12px}`]})
export class PackageDrawingsComponent{
 @Input()signature='';@Input()index=0;@Input()box:any;@Input()sharedSize='';@Input()sizeLabel='';@Input()backdrop=false;
}
