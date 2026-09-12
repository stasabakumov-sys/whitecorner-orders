import{t as He}from"./chunk-MLUA3VFF.js";import{$ as De,N as U,V as Pe,W,Y as Oe,_ as Ie,ba as Le,ca as Ae,fa as D,k as Z,l as Se,la as Be,oa as Ne,ra as Ge,sa as Ue,u as G,va as L,wa as Ke,xa as Je}from"./chunk-BRDVBVJZ.js";import{a as Xe}from"./chunk-LTYFISVG.js";import{A as Fe,B as $e,C as We,D as Re,E as je,F as qe,G as Qe,I as Ze,g as ke,i as Me,k as Te,n as Ee,o as $,x as Ve,y as ze}from"./chunk-V4X43EDO.js";import{$ as B,$a as h,Ab as b,Fa as te,Gb as he,Hb as Q,Ib as d,J as H,Jb as w,K,Ka as M,Kb as F,La as ne,Lb as ge,M as J,Mb as Ce,O as A,Oa as ie,Ob as T,Pa as oe,Pb as E,Qa as g,Qb as S,T as u,U as _,V as X,Vb as be,Xa as v,_a as f,ab as ae,cb as N,cc as we,db as V,eb as c,ec as ye,fb as l,ga as Y,gb as s,ha as q,hb as z,hc as ve,ib as re,jb as le,lb as se,mb as de,nb as P,nc as O,ob as x,pb as pe,rc as I,sa as ee,sb as k,tb as ce,ub as p,vb as me,wa as r,wb as ue,xb as _e,yb as fe,yc as y,zb as C,zc as xe}from"./chunk-BNREAGWS.js";import{a as j}from"./chunk-IFGU66OU.js";function at(t){let i=new URLSearchParams,e=t?.wix_product_id||He(t||{});return t?.shipping_product_id?i.set("productId",t.shipping_product_id):e&&i.set("wixProductId",e),t?.product_name&&i.set("product",t.product_name),"#/shipping-data?"+i.toString()}var R=class t{item;href(){return at(this.item)}stopDrag(i){i.preventDefault(),i.stopPropagation()}static \u0275fac=function(e){return new(e||t)};static \u0275cmp=M({type:t,selectors:[["app-product-link"]],inputs:{item:"item"},decls:2,vars:2,consts:[["draggable","false","title","Open product in Products",3,"click","dblclick","keydown","dragstart","href"]],template:function(e,n){e&1&&(re(0,"a",0),ce("click",function(a){return a.stopPropagation()})("dblclick",function(a){return a.stopPropagation()})("keydown",function(a){return a.stopPropagation()})("dragstart",function(a){return n.stopDrag(a)}),d(1),le()),e&2&&(pe("href",n.href(),ee),r(),w((n.item==null?null:n.item.product_name)||"Unnamed product"))},styles:["[_nghost-%COMP%]{display:inline}a[_ngcontent-%COMP%]{color:inherit;font:inherit;text-decoration:none;cursor:pointer}a[_ngcontent-%COMP%]:hover{text-decoration:underline;color:var(--p-primary-color)}a[_ngcontent-%COMP%]:focus-visible{outline:2px solid var(--p-primary-color);outline-offset:3px;border-radius:2px}"]})};var et=`
    .p-drawer {
        display: flex;
        flex-direction: column;
        transform: translate3d(0px, 0px, 0px);
        position: relative;
        transition: transform 0.3s;
        background: dt('drawer.background');
        color: dt('drawer.color');
        border-style: solid;
        border-color: dt('drawer.border.color');
        box-shadow: dt('drawer.shadow');
    }

    .p-drawer-content {
        overflow-y: auto;
        flex-grow: 1;
        padding: dt('drawer.content.padding');
    }

    .p-drawer-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-shrink: 0;
        padding: dt('drawer.header.padding');
    }

    .p-drawer-footer {
        padding: dt('drawer.footer.padding');
    }

    .p-drawer-title {
        font-weight: dt('drawer.title.font.weight');
        font-size: dt('drawer.title.font.size');
    }

    .p-drawer-full .p-drawer {
        transition: none;
        transform: none;
        width: 100vw !important;
        height: 100vh !important;
        max-height: 100%;
        top: 0px !important;
        left: 0px !important;
        border-width: 1px;
    }

    .p-drawer-left .p-drawer-enter-active {
        animation: p-animate-drawer-enter-left 0.5s cubic-bezier(0.32, 0.72, 0, 1);
    }
    .p-drawer-left .p-drawer-leave-active {
        animation: p-animate-drawer-leave-left 0.5s cubic-bezier(0.32, 0.72, 0, 1);
    }

    .p-drawer-right .p-drawer-enter-active {
        animation: p-animate-drawer-enter-right 0.5s cubic-bezier(0.32, 0.72, 0, 1);
    }
    .p-drawer-right .p-drawer-leave-active {
        animation: p-animate-drawer-leave-right 0.5s cubic-bezier(0.32, 0.72, 0, 1);
    }

    .p-drawer-top .p-drawer-enter-active {
        animation: p-animate-drawer-enter-top 0.5s cubic-bezier(0.32, 0.72, 0, 1);
    }
    .p-drawer-top .p-drawer-leave-active {
        animation: p-animate-drawer-leave-top 0.5s cubic-bezier(0.32, 0.72, 0, 1);
    }

    .p-drawer-bottom .p-drawer-enter-active {
        animation: p-animate-drawer-enter-bottom 0.5s cubic-bezier(0.32, 0.72, 0, 1);
    }
    .p-drawer-bottom .p-drawer-leave-active {
        animation: p-animate-drawer-leave-bottom 0.5s cubic-bezier(0.32, 0.72, 0, 1);
    }

    .p-drawer-full .p-drawer-enter-active {
        animation: p-animate-drawer-enter-full 0.5s cubic-bezier(0.32, 0.72, 0, 1);
    }
    .p-drawer-full .p-drawer-leave-active {
        animation: p-animate-drawer-leave-full 0.5s cubic-bezier(0.32, 0.72, 0, 1);
    }
    
    .p-drawer-left .p-drawer {
        width: 20rem;
        height: 100%;
        border-inline-end-width: 1px;
    }

    .p-drawer-right .p-drawer {
        width: 20rem;
        height: 100%;
        border-inline-start-width: 1px;
    }

    .p-drawer-top .p-drawer {
        height: 10rem;
        width: 100%;
        border-block-end-width: 1px;
    }

    .p-drawer-bottom .p-drawer {
        height: 10rem;
        width: 100%;
        border-block-start-width: 1px;
    }

    .p-drawer-left .p-drawer-content,
    .p-drawer-right .p-drawer-content,
    .p-drawer-top .p-drawer-content,
    .p-drawer-bottom .p-drawer-content {
        width: 100%;
        height: 100%;
    }

    .p-drawer-open {
        display: flex;
    }

    .p-drawer-mask:dir(rtl) {
        flex-direction: row-reverse;
    }

    @keyframes p-animate-drawer-enter-left {
        from {
            transform: translate3d(-100%, 0px, 0px);
        }
    }

    @keyframes p-animate-drawer-leave-left {
        to {
            transform: translate3d(-100%, 0px, 0px);
        }
    }

    @keyframes p-animate-drawer-enter-right {
        from {
            transform: translate3d(100%, 0px, 0px);
        }
    }

    @keyframes p-animate-drawer-leave-right {
        to {
            transform: translate3d(100%, 0px, 0px);
        }
    }

    @keyframes p-animate-drawer-enter-top {
        from {
            transform: translate3d(0px, -100%, 0px);
        }
    }

    @keyframes p-animate-drawer-leave-top {
        to {
            transform: translate3d(0px, -100%, 0px);
        }
    }

    @keyframes p-animate-drawer-enter-bottom {
        from {
            transform: translate3d(0px, 100%, 0px);
        }
    }

    @keyframes p-animate-drawer-leave-bottom {
        to {
            transform: translate3d(0px, 100%, 0px);
        }
    }

    @keyframes p-animate-drawer-enter-full {
        from {
            opacity: 0;
            transform: scale(0.93);
        }
    }

    @keyframes p-animate-drawer-leave-full {
        to {
            opacity: 0;
            transform: scale(0.93);
        }
    }
`;var lt=["header"],st=["footer"],dt=["content"],pt=["closeicon"],ct=["headless"],mt=["container"],ut=["closeButton"],_t=["*"];function ft(t,i){t&1&&P(0)}function ht(t,i){if(t&1&&g(0,ft,1,0,"ng-container",4),t&2){let e=p(2);c("ngTemplateOutlet",e.headlessTemplate||e._headlessTemplate)}}function gt(t,i){t&1&&P(0)}function Ct(t,i){if(t&1&&(l(0,"div",9),d(1),s()),t&2){let e=p(3);Q(e.cx("title")),c("pBind",e.ptm("title")),r(),w(e.header)}}function bt(t,i){t&1&&(X(),z(0,"svg",12)),t&2&&v("data-pc-section","closeicon")}function wt(t,i){}function yt(t,i){t&1&&g(0,wt,0,0,"ng-template")}function vt(t,i){if(t&1&&g(0,bt,1,1,"svg",11)(1,yt,1,0,null,4),t&2){let e=p(4);c("ngIf",!e.closeIconTemplate&&!e._closeIconTemplate),r(),c("ngTemplateOutlet",e.closeIconTemplate||e._closeIconTemplate)}}function xt(t,i){if(t&1){let e=x();l(0,"p-button",10),k("onClick",function(o){u(e);let a=p(3);return _(a.close(o))})("keydown.enter",function(o){u(e);let a=p(3);return _(a.close(o))}),g(1,vt,2,2,"ng-template",null,1,ve),s()}if(t&2){let e=p(3);c("pt",e.ptm("pcCloseButton"))("ngClass",e.cx("pcCloseButton"))("buttonProps",e.closeButtonProps)("ariaLabel",e.ariaCloseLabel)("unstyled",e.unstyled()),v("data-pc-group-section","iconcontainer")}}function kt(t,i){t&1&&P(0)}function Mt(t,i){t&1&&P(0)}function Tt(t,i){if(t&1&&(se(0),l(1,"div",5),g(2,Mt,1,0,"ng-container",4),s(),de()),t&2){let e=p(3);r(),c("pBind",e.ptm("footer"))("ngClass",e.cx("footer")),v("data-pc-section","footer"),r(),c("ngTemplateOutlet",e.footerTemplate||e._footerTemplate)}}function Et(t,i){if(t&1&&(l(0,"div",5),g(1,gt,1,0,"ng-container",4)(2,Ct,2,4,"div",6)(3,xt,3,6,"p-button",7),s(),l(4,"div",5),ue(5),g(6,kt,1,0,"ng-container",4),s(),g(7,Tt,3,4,"ng-container",8)),t&2){let e=p(2);c("pBind",e.ptm("header"))("ngClass",e.cx("header")),v("data-pc-section","header"),r(),c("ngTemplateOutlet",e.headerTemplate||e._headerTemplate),r(),c("ngIf",e.header),r(),c("ngIf",e.showCloseIcon&&e.closable),r(),c("pBind",e.ptm("content"))("ngClass",e.cx("content")),v("data-pc-section","content"),r(2),c("ngTemplateOutlet",e.contentTemplate||e._contentTemplate),r(),c("ngIf",e.footerTemplate||e._footerTemplate)}}function St(t,i){if(t&1){let e=x();l(0,"div",3,0),k("pMotionOnBeforeEnter",function(o){u(e);let a=p();return _(a.onBeforeEnter(o))})("pMotionOnAfterLeave",function(o){u(e);let a=p();return _(a.onAfterLeave(o))})("keydown",function(o){u(e);let a=p();return _(a.onKeyDown(o))}),f(2,ht,1,1,"ng-container")(3,Et,8,11),s()}if(t&2){let e=p();he(e.style),Q(e.cn(e.cx("root"),e.styleClass)),c("pBind",e.ptm("root"))("pMotion",e.visible)("pMotionAppear",!0)("pMotionEnterActiveClass",e.$enterAnimation())("pMotionLeaveActiveClass",e.$leaveAnimation())("pMotionOptions",e.computedMotionOptions()),v("data-p",e.dataP)("data-p-open",e.visible),r(2),h(e.headlessTemplate||e._headlessTemplate?2:3)}}var Pt=`
${et}

/** For PrimeNG **/
.p-drawer {
    position: fixed;
}

.p-drawer-left {
    top: 0;
    left: 0;
    width: 20rem;
    height: 100%;
    border-inline-end-width: 1px;
}

.p-drawer-right {
    top: 0;
    right: 0;
    width: 20rem;
    height: 100%;
    border-inline-start-width: 1px;
}

.p-drawer-top {
    top: 0;
    left: 0;
    width: 100%;
    height: 10rem;
    border-block-end-width: 1px;
}

.p-drawer-bottom {
    bottom: 0;
    left: 0;
    width: 100%;
    height: 10rem;
    border-block-start-width: 1px;
}

.p-drawer-full {
    width: 100%;
    height: 100%;
    top: 0;
    left: 0;
    -webkit-transition: none;
    transition: none;
}

/* Animations */
.p-drawer-enter-left {
    animation: p-animate-drawer-enter-left 0.5s cubic-bezier(0.32, 0.72, 0, 1);
}

.p-drawer-leave-left {
    animation: p-animate-drawer-leave-left 0.5s cubic-bezier(0.32, 0.72, 0, 1);
}

.p-drawer-enter-right {
    animation: p-animate-drawer-enter-right 0.5s cubic-bezier(0.32, 0.72, 0, 1);
}

.p-drawer-leave-right {
    animation: p-animate-drawer-leave-right 0.5s cubic-bezier(0.32, 0.72, 0, 1);
}

.p-drawer-enter-top {
    animation: p-animate-drawer-enter-top 0.5s cubic-bezier(0.32, 0.72, 0, 1);
}

.p-drawer-leave-top {
    animation: p-animate-drawer-leave-top 0.5s cubic-bezier(0.32, 0.72, 0, 1);
}

.p-drawer-enter-bottom {
    animation: p-animate-drawer-enter-bottom 0.5s cubic-bezier(0.32, 0.72, 0, 1);
}

.p-drawer-leave-bottom {
    animation: p-animate-drawer-leave-bottom 0.5s cubic-bezier(0.32, 0.72, 0, 1);
}

.p-drawer-enter-full {
    animation: p-animate-drawer-enter-full 0.5s cubic-bezier(0.32, 0.72, 0, 1);
}

.p-drawer-leave-full {
    animation: p-animate-drawer-leave-full 0.5s cubic-bezier(0.32, 0.72, 0, 1);
}
`,Ot={mask:({instance:t})=>["p-drawer-mask",{"p-overlay-mask p-overlay-mask-enter-active":t.modal},{"p-drawer-full":t.fullScreen()}],root:({instance:t})=>["p-drawer p-component",{"p-drawer-full":t.fullScreen(),"p-drawer-open":t.visible},`p-drawer-${t.position()}`],header:"p-drawer-header",title:"p-drawer-title",pcCloseButton:"p-drawer-close-button",content:"p-drawer-content",footer:"p-drawer-footer"},tt=(()=>{class t extends Oe{name="drawer";style=Pt;classes=Ot;static \u0275fac=(()=>{let e;return function(o){return(e||(e=q(t)))(o||t)}})();static \u0275prov=H({token:t,factory:t.\u0275fac})}return t})();var nt=new J("DRAWER_INSTANCE"),It=(()=>{class t extends De{componentName="Drawer";$pcDrawer=A(nt,{optional:!0,skipSelf:!0})??void 0;bindDirectiveInstance=A(D,{self:!0});onAfterViewChecked(){this.bindDirectiveInstance.setAttrs(this.ptm("host"))}appendTo=I(void 0);motionOptions=I(void 0);computedMotionOptions=O(()=>j(j({},this.ptm("motion")),this.motionOptions()));blockScroll=!1;style;styleClass;ariaCloseLabel;autoZIndex=!0;baseZIndex=0;modal=!0;closeButtonProps={severity:"secondary",text:!0,rounded:!0};dismissible=!0;showCloseIcon=!0;closeOnEscape=!0;transitionOptions="150ms cubic-bezier(0, 0, 0.2, 1)";get visible(){return this._visible??!1}set visible(e){this._visible=e,this._visible&&!this.modalVisible&&(this.modalVisible=!0)}position=I("left");fullScreen=I(!1);$enterAnimation=O(()=>this.fullScreen()?"p-drawer-enter-full":`p-drawer-enter-${this.position()}`);$leaveAnimation=O(()=>this.fullScreen()?"p-drawer-leave-full":`p-drawer-leave-${this.position()}`);header;maskStyle;closable=!0;onShow=new B;onHide=new B;visibleChange=new B;containerViewChild;closeButtonViewChild;initialized;_visible;_position="left";_fullScreen=!1;modalVisible=!1;container;mask;maskClickListener;documentEscapeListener;animationEndListener;_componentStyle=A(tt);onAfterViewInit(){this.initialized=!0}headerTemplate;footerTemplate;contentTemplate;closeIconTemplate;headlessTemplate;$appendTo=O(()=>this.appendTo()||this.config.overlayAppendTo());_headerTemplate;_footerTemplate;_contentTemplate;_closeIconTemplate;_headlessTemplate;templates;onAfterContentInit(){this.templates?.forEach(e=>{switch(e.getType()){case"content":this._contentTemplate=e.template;break;case"header":this._headerTemplate=e.template;break;case"footer":this._footerTemplate=e.template;break;case"closeicon":this._closeIconTemplate=e.template;break;case"headless":this._headlessTemplate=e.template;break;default:this._contentTemplate=e.template;break}})}onKeyDown(e){e.code==="Escape"&&this.hide(!1)}show(){this.container?.setAttribute(this.$attrSelector,""),this.autoZIndex&&L.set("modal",this.container,this.baseZIndex||this.config.zIndex.modal),this.modal&&this.enableModality(),this.onShow.emit({}),this.visibleChange.emit(!0)}hide(e=!0){e&&this.onHide.emit({}),this.modal&&this.disableModality()}close(e){this.hide(),this.visibleChange.emit(!1),this.cd.markForCheck(),e.preventDefault()}enableModality(){let e=this.document.querySelectorAll('[data-p-open="true"]'),n=e.length,o=n==1?String(parseInt(this.container.style.zIndex)-1):String(parseInt(e[n-1].style.zIndex)-1);if(!this.mask){if(this.mask=this.renderer.createElement("div"),this.mask){let a=`z-index: ${o};${this.getMaskStyle()}`;U(this.mask,"style",a),U(this.mask,"data-p",this.dataP),Z(this.mask,this.cx("mask"))}this.dismissible&&(this.maskClickListener=this.renderer.listen(this.mask,"click",a=>{this.dismissible&&this.close(a)})),this.renderer.appendChild(this.document.body,this.mask),this.blockScroll&&Le()}}getMaskStyle(){return this.maskStyle?Object.entries(this.maskStyle).map(([e,n])=>`${e}: ${n}`).join("; "):""}disableModality(){this.mask&&(!this.$unstyled()&&Se(this.mask,"p-overlay-mask-enter-active"),!this.$unstyled()&&Z(this.mask,"p-overlay-mask-leave-active"),this.animationEndListener=this.renderer.listen(this.mask,"animationend",this.destroyModal.bind(this)))}destroyModal(){this.unbindMaskClickListener(),this.mask&&this.renderer.removeChild(this.document.body,this.mask),this.blockScroll&&Ae(),this.unbindAnimationEndListener(),this.mask=null}onBeforeEnter(e){this.container=e.element,this.appendContainer(),this.show(),this.closeOnEscape&&this.bindDocumentEscapeListener()}onAfterLeave(){this.hide(!1),L.clear(this.container),this.unbindGlobalListeners(),this.modalVisible=!1,this.container=null}appendContainer(){this.$appendTo()&&this.$appendTo()!=="self"&&(this.$appendTo()==="body"?G(this.document.body,this.container):G(this.$appendTo(),this.container))}bindDocumentEscapeListener(){let e=this.el?this.el.nativeElement.ownerDocument:this.document;this.documentEscapeListener=this.renderer.listen(e,"keydown",n=>{n.which==27&&parseInt(this.container?.style.zIndex)===L.get(this.container)&&this.close(n)})}unbindDocumentEscapeListener(){this.documentEscapeListener&&(this.documentEscapeListener(),this.documentEscapeListener=null)}unbindMaskClickListener(){this.maskClickListener&&(this.maskClickListener(),this.maskClickListener=null)}unbindGlobalListeners(){this.unbindMaskClickListener(),this.unbindDocumentEscapeListener()}unbindAnimationEndListener(){this.animationEndListener&&this.mask&&(this.animationEndListener(),this.animationEndListener=null)}onDestroy(){this.initialized=!1,this.visible&&this.modal&&this.destroyModal(),this.$appendTo()&&this.container&&this.renderer.appendChild(this.el.nativeElement,this.container),this.container&&this.autoZIndex&&L.clear(this.container),this.container=null,this.unbindGlobalListeners(),this.unbindAnimationEndListener()}get dataP(){return this.cn({"full-screen":this.position()==="full",[this.position()]:this.position(),open:this.visible,modal:this.modal})}static \u0275fac=(()=>{let e;return function(o){return(e||(e=q(t)))(o||t)}})();static \u0275cmp=M({type:t,selectors:[["p-drawer"]],contentQueries:function(n,o,a){if(n&1&&_e(a,lt,4)(a,st,4)(a,dt,4)(a,pt,4)(a,ct,4)(a,Pe,4),n&2){let m;C(m=b())&&(o.headerTemplate=m.first),C(m=b())&&(o.footerTemplate=m.first),C(m=b())&&(o.contentTemplate=m.first),C(m=b())&&(o.closeIconTemplate=m.first),C(m=b())&&(o.headlessTemplate=m.first),C(m=b())&&(o.templates=m)}},viewQuery:function(n,o){if(n&1&&fe(mt,5)(ut,5),n&2){let a;C(a=b())&&(o.containerViewChild=a.first),C(a=b())&&(o.closeButtonViewChild=a.first)}},inputs:{appendTo:[1,"appendTo"],motionOptions:[1,"motionOptions"],blockScroll:[2,"blockScroll","blockScroll",y],style:"style",styleClass:"styleClass",ariaCloseLabel:"ariaCloseLabel",autoZIndex:[2,"autoZIndex","autoZIndex",y],baseZIndex:[2,"baseZIndex","baseZIndex",xe],modal:[2,"modal","modal",y],closeButtonProps:"closeButtonProps",dismissible:[2,"dismissible","dismissible",y],showCloseIcon:[2,"showCloseIcon","showCloseIcon",y],closeOnEscape:[2,"closeOnEscape","closeOnEscape",y],transitionOptions:"transitionOptions",visible:"visible",position:[1,"position"],fullScreen:[1,"fullScreen"],header:"header",maskStyle:"maskStyle",closable:[2,"closable","closable",y]},outputs:{onShow:"onShow",onHide:"onHide",visibleChange:"visibleChange"},features:[be([tt,{provide:nt,useExisting:t},{provide:Ie,useExisting:t}]),ie([D]),oe],ngContentSelectors:_t,decls:1,vars:1,consts:[["container",""],["icon",""],["role","complementary","pFocusTrap","",3,"pBind","pMotion","pMotionAppear","pMotionEnterActiveClass","pMotionLeaveActiveClass","pMotionOptions","class","style"],["role","complementary","pFocusTrap","",3,"pMotionOnBeforeEnter","pMotionOnAfterLeave","keydown","pBind","pMotion","pMotionAppear","pMotionEnterActiveClass","pMotionLeaveActiveClass","pMotionOptions"],[4,"ngTemplateOutlet"],[3,"pBind","ngClass"],[3,"pBind","class",4,"ngIf"],[3,"pt","ngClass","buttonProps","ariaLabel","unstyled","onClick","keydown.enter",4,"ngIf"],[4,"ngIf"],[3,"pBind"],[3,"onClick","keydown.enter","pt","ngClass","buttonProps","ariaLabel","unstyled"],["data-p-icon","times",4,"ngIf"],["data-p-icon","times"]],template:function(n,o){n&1&&(me(),f(0,St,4,13,"div",2)),n&2&&h(o.modalVisible?0:-1)},dependencies:[$,ke,Me,Te,Ne,Be,W,D,Je,Ke,Ue,Ge],encapsulation:2,changeDetection:0})}return t})(),xn=(()=>{class t{static \u0275fac=function(n){return new(n||t)};static \u0275mod=ne({type:t});static \u0275inj=K({imports:[It,W,W]})}return t})();var Dt=(t,i)=>i.id,Lt=(t,i)=>i.key;function At(t,i){if(t&1&&z(0,"app-product-link",1),t&2){let e=p();c("item",e.part)}}function Bt(t,i){if(t&1&&d(0),t&2){let e=p();F(" ",e.part.product_name," ")}}function Nt(t,i){t&1&&(l(0,"p")(1,"b"),d(2,"Exclude the standard tabletop materials."),s(),d(3," The replacement tabletop has its own profile below."),s())}function Vt(t,i){t&1&&(l(0,"p"),d(1,"No complete saved cost profile yet. Add the missing information."),s())}function zt(t,i){t&1&&(l(0,"p"),d(1,"Existing material quantities have been loaded. Check them before saving."),s())}function Ft(t,i){if(t&1&&(l(0,"option",10),d(1),s()),t&2){let e=i.$implicit;c("value",e.id),r(),Ce("",e.name," \xB7 ",e.unit,"",e.active?"":" (archived)")}}function $t(t,i){if(t&1){let e=x();l(0,"div",3)(1,"label"),d(2,"Material"),l(3,"select",8),S("ngModelChange",function(o){let a=u(e).$implicit;return E(a.material_id,o)||(a.material_id=o),_(o)}),l(4,"option",9),d(5,"Choose material"),s(),N(6,Ft,2,4,"option",10,Dt),s()(),l(8,"label"),d(9,"Quantity"),l(10,"input",11),S("ngModelChange",function(o){let a=u(e).$implicit;return E(a.quantity,o)||(a.quantity=o),_(o)}),s()(),l(11,"button",4),k("click",function(){let o=u(e).$index,a=p();return _(a.lines.splice(o,1))}),d(12,"Remove"),s()()}if(t&2){let e=i.$implicit,n=p();r(3),T("ngModel",e.material_id),r(3),V(n.s.materials()),r(4),T("ngModel",e.quantity)}}function Wt(t,i){if(t&1){let e=x();l(0,"label"),d(1),l(2,"input",12),S("ngModelChange",function(o){let a=u(e).$implicit,m=p(2);return E(m.work[a.key],o)||(m.work[a.key]=o),_(o)}),s()()}if(t&2){let e=i.$implicit,n=p(2);r(),w(e.label),r(),T("ngModel",n.work[e.key])}}function Rt(t,i){if(t&1&&(l(0,"h4"),d(1,"Work cost for one unit \xB7 incl. GST"),s(),l(2,"div",3),N(3,Wt,3,2,"label",null,Lt),s()),t&2){let e=p();r(3),V(e.categories)}}function jt(t,i){if(t&1){let e=x();l(0,"label"),d(1,"Pans purchase cost \xB7 complete set for one product, incl. GST"),l(2,"input",12),S("ngModelChange",function(o){u(e);let a=p();return E(a.pans,o)||(a.pans=o),_(o)}),s()()}if(t&2){let e=p();r(2),T("ngModel",e.pans)}}function qt(t,i){t&1&&d(0,"Blank = unknown. Zero = no cost. ")}function Qt(t,i){t&1&&(l(0,"p",7),d(1,"Saved to the shared product catalogue."),s())}var it=class t{constructor(i){this.s=i}s;part;linkProduct=!1;showWork=!0;hideColour=!1;lines=[];work={};pans=null;confirmed=!1;version=null;saved=!1;categories=[{key:"cnc",label:"CNC"},{key:"assembly",label:"Assembly"},{key:"sanding",label:"Sanding"},{key:"painting",label:"Painting"}];openedKey="";ngOnChanges(){this.openedKey!==this.part.variant_key&&(this.openedKey=this.part.variant_key,this.lines=structuredClone(this.part.profile?.lines||this.part.legacy_lines||[]),this.work=Object.fromEntries(this.categories.map(i=>[i.key,this.part.profile?.work_costs?.[i.key]??null])),this.pans=this.part.profile?.pans_cost_gst??null,this.confirmed=this.part.profile?.materials_confirmed??!1,this.version=this.part.profile?.updated_at??null,this.saved=!1)}options(){return Object.entries(this.part.options||{}).filter(([i])=>!this.hideColour||!["colour","color"].includes(i.toLowerCase())).map(([i,e])=>`${i}: ${e}`).join(" \xB7 ")||"No structural options"}materialTotal(){if(!this.confirmed)return null;let i=0;for(let e of this.lines){let n=this.s.materials().find(o=>o.id===e.material_id);if(!n?.active||n.price_gst==null)return null;i+=Math.round(Number(n.price_gst)*Number(e.quantity)*100)}return i/100}invalid(){return new Set(this.lines.map(i=>i.material_id)).size!==this.lines.length||this.lines.some(i=>!this.s.materials().some(e=>e.id===i.material_id&&e.active)||!Number.isFinite(Number(i.quantity))||Number(i.quantity)<=0)||Object.values(this.work).some(i=>i!=null&&(!Number.isFinite(Number(i))||Number(i)<0))||this.pans!=null&&(!Number.isFinite(Number(this.pans))||Number(this.pans)<0)}async save(){if(this.invalid())return;let i=this.part.shared_parts?.length?this.part.shared_parts:[this.part];for(let e of i){let n=this.showWork?this.work:e.profile?.work_costs||this.work;if(!await this.s.saveCatalogProfile(e,this.lines,n,this.pans,this.confirmed,e.profile?.updated_at??null))return}this.version=this.s.profiles().find(e=>e.variant_key===this.part.variant_key)?.updated_at??null,this.saved=!0}static \u0275fac=function(e){return new(e||t)(te(Xe))};static \u0275cmp=M({type:t,selectors:[["app-catalog-cost-editor"]],inputs:{part:"part",linkProduct:"linkProduct",showWork:"showWork",hideColour:"hideColour"},features:[Y],decls:33,vars:20,consts:[[1,"editor"],[3,"item"],[3,"disabled"],[1,"fields"],[3,"click"],["type","checkbox",3,"ngModelChange","ngModel"],[1,"primary",3,"click","disabled"],["role","status"],[3,"ngModelChange","ngModel"],["value",""],[3,"value"],["type","number","min","0.0001","step","0.0001",3,"ngModelChange","ngModel"],["type","number","min","0","step","0.01","placeholder","Unknown",3,"ngModelChange","ngModel"]],template:function(e,n){e&1&&(l(0,"section",0)(1,"h3"),f(2,At,1,1,"app-product-link",1)(3,Bt,1,1),s(),l(4,"small"),d(5),s(),l(6,"p"),d(7),s(),f(8,Nt,4,0,"p"),f(9,Vt,2,0,"p"),f(10,zt,2,0,"p"),l(11,"fieldset",2)(12,"legend"),d(13),s(),N(14,$t,13,2,"div",3,ae),l(16,"button",4),k("click",function(){return n.lines.push({material_id:"",quantity:1})}),d(17,"Add material"),s(),l(18,"p")(19,"label")(20,"input",5),S("ngModelChange",function(a){return E(n.confirmed,a)||(n.confirmed=a),a}),s(),d(21," Material list complete (an empty list means no materials)"),s()(),l(22,"b"),d(23),we(24,"currency"),s(),f(25,Rt,5,0),f(26,jt,3,1,"label"),l(27,"p"),f(28,qt,1,0),d(29,"Saved order calculations stay unchanged."),s(),l(30,"button",6),k("click",function(){return n.save()}),d(31),s(),f(32,Qt,2,0,"p",7),s()()),e&2&&(r(2),h(n.linkProduct?2:3),r(3),ge("",n.part.kind==="main"?"Main product":n.part.kind==="processing"?"Processing of addon":n.part.kind==="replacement"?"Replacement tabletop":"Addon"," \xB7 ",n.part.multiplier," per finished product"),r(2),w(n.options()),r(),h(n.part.standard_top_excluded?8:-1),r(),h(n.part.profile?-1:9),r(),h(n.part.legacy_lines!=null&&n.part.legacy_lines.length&&!n.part.profile?10:-1),r(),c("disabled",n.s.busy()||n.s.loading()),r(2),F("Materials for one ",n.part.kind==="main"?"product":"addon"),r(),V(n.lines),r(6),T("ngModel",n.confirmed),r(3),F("Material cost: ",n.materialTotal()===null?"\u2014":ye(24,17,n.materialTotal(),"AUD")),r(2),h(n.showWork?25:-1),r(),h(n.part.has_pans?26:-1),r(2),h(n.showWork?28:-1),r(2),c("disabled",n.invalid()),r(),w(n.s.busy()?"Saving\u2026":"Save product profile"),r(),h(n.saved?32:-1))},dependencies:[R,$,Ze,je,qe,ze,We,Ve,Re,Fe,Qe,$e,Ee],styles:["[_nghost-%COMP%]{display:block;min-width:0}header[_ngcontent-%COMP%], .toolbar[_ngcontent-%COMP%], .fields[_ngcontent-%COMP%]{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px}header[_ngcontent-%COMP%]{justify-content:space-between}h1[_ngcontent-%COMP%], h3[_ngcontent-%COMP%]{margin:0}p[_ngcontent-%COMP%], small[_ngcontent-%COMP%]{color:var(--wc-muted)}small[_ngcontent-%COMP%]{display:block}.editor[_ngcontent-%COMP%]{padding:16px;margin:16px 0;background:var(--wc-surface);border:1px solid var(--wc-border);border-radius:12px}.fields[_ngcontent-%COMP%]{align-items:end}.fields[_ngcontent-%COMP%]   label[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:4px}input[_ngcontent-%COMP%], select[_ngcontent-%COMP%]{max-width:100%}.table-wrap[_ngcontent-%COMP%]{overflow:auto;background:var(--wc-surface);border:1px solid var(--wc-border);border-radius:8px}table[_ngcontent-%COMP%]{width:100%}.badge[_ngcontent-%COMP%]{display:inline-block;padding:3px 7px;background:#fff3d6;color:#92400e}.badge.done[_ngcontent-%COMP%]{background:#dcfce7;color:#166534}a[_ngcontent-%COMP%]{color:var(--wc-primary)}[role=alert][_ngcontent-%COMP%]{color:#b91c1c}.cost-summary[_ngcontent-%COMP%]{padding:12px;background:var(--wc-ground);border:1px solid var(--wc-border);border-radius:8px}.composition-alert[_ngcontent-%COMP%]{margin-top:12px;padding:12px;background:#fff3d6;border:1px solid #f4d59a;border-radius:8px}.composition-alert[_ngcontent-%COMP%]   p[_ngcontent-%COMP%]{color:inherit}.profile-heading[_ngcontent-%COMP%], details[_ngcontent-%COMP%]{margin-top:12px}summary[_ngcontent-%COMP%]{cursor:pointer}details[_ngcontent-%COMP%]   table[_ngcontent-%COMP%]{margin-top:8px}"]})};export{R as a,It as b,xn as c,it as d};
