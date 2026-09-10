import {Component,Input} from '@angular/core';
import {BoxDrawingComponent} from './box-drawing.component';

// A shared backdrop library is an additional source, never a replacement for
// a file attached to this exact saved package (including legacy profiles).
@Component({selector:'app-package-drawings',standalone:true,imports:[BoxDrawingComponent],template:`
 <small>Package drawing</small>
 <app-box-drawing [signature]="signature" [index]="index" [box]="box" />
 @if(sharedSize){<div class="shared"><small>Shared backdrop drawing · {{sizeLabel}}</small><app-box-drawing [sharedSize]="sharedSize" /></div>}
 @else if(backdrop){<small>Shared size library is unavailable for this profile. The package drawing can still be opened or uploaded above.</small>}
 `,styles:[`small{display:block;color:var(--wc-muted);font-size:.8rem;margin-bottom:5px}.shared{margin-top:12px}`]})
export class PackageDrawingsComponent{
 @Input()signature='';@Input()index=0;@Input()box:any;@Input()sharedSize='';@Input()sizeLabel='';@Input()backdrop=false;
}
