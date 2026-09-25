import{e as Se,p as He}from"./chunk-2EUOTPZU.js";import{$ as Le,N as G,V as Oe,W as $,Y as Ie,_ as De,ba as Ae,ca as Be,fa as L,k as Z,l as Pe,la as Ne,oa as Ve,ra as Ge,sa as Ue,u as K,va as A,wa as Je,xa as Xe}from"./chunk-NFZAWBDM.js";import{a as Ye}from"./chunk-J53VSHK7.js";import{B as $e,D as Re,E as je,F as qe,G as Qe,I as Ze,M as Ke,g as ke,i as Me,k as Te,n as Ee,o as W,v as ze,w as Fe,y as We}from"./chunk-TOSWCAL3.js";import{$ as B,$a as f,Ab as b,Ac as xe,Fa as te,Gb as he,Hb as Q,Ib as d,J as U,Jb as w,K as H,Ka as T,Kb as F,La as ne,Lb as ge,M as J,Mb as Ce,O as M,Oa as ie,Pa as oe,Pb as E,Qa as g,Qb as S,Rb as P,T as _,U as h,V as X,Wb as be,Xa as v,_a as u,ab as ae,cb as N,db as V,dc as we,eb as c,fb as l,fc as ye,ga as Y,gb as s,ha as q,hb as z,ib as re,ic as ve,jb as le,lb as se,mb as de,nb as O,ob as x,oc as I,pb as pe,sa as ee,sb as k,sc as D,tb as ce,ub as p,vb as me,wa as r,wb as ue,xb as fe,yb as _e,zb as C,zc as y}from"./chunk-6H75JGWL.js";import{a as j}from"./chunk-IFGU66OU.js";function rt(t){let n=new URLSearchParams,e=t?.wix_product_id||He(t||{});return t?.shipping_product_id?n.set("productId",t.shipping_product_id):e&&n.set("wixProductId",e),t?.product_name&&n.set("product",t.product_name),"#/shipping-data?"+n.toString()}var R=class t{item;router=M(Se);href(){return rt(this.item)}open(n){n.stopPropagation(),!(n.button!==0||n.ctrlKey||n.metaKey||n.shiftKey||n.altKey)&&(n.preventDefault(),this.router.navigateByUrl(this.href().slice(1)))}stopDrag(n){n.preventDefault(),n.stopPropagation()}static \u0275fac=function(e){return new(e||t)};static \u0275cmp=T({type:t,selectors:[["app-product-link"]],inputs:{item:"item"},decls:2,vars:2,consts:[["draggable","false","title","Open product in Products",3,"click","dblclick","keydown","dragstart","href"]],template:function(e,i){e&1&&(re(0,"a",0),ce("click",function(a){return i.open(a)})("dblclick",function(a){return a.stopPropagation()})("keydown",function(a){return a.stopPropagation()})("dragstart",function(a){return i.stopDrag(a)}),d(1),le()),e&2&&(pe("href",i.href(),ee),r(),w((i.item==null?null:i.item.product_name)||"Unnamed product"))},styles:["[_nghost-%COMP%]{display:inline}a[_ngcontent-%COMP%]{color:inherit;font:inherit;text-decoration:none;cursor:pointer}a[_ngcontent-%COMP%]:hover{text-decoration:underline;color:var(--p-primary-color)}a[_ngcontent-%COMP%]:focus-visible{outline:2px solid var(--p-primary-color);outline-offset:3px;border-radius:2px}"]})};var tt=`
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
`;var st=["header"],dt=["footer"],pt=["content"],ct=["closeicon"],mt=["headless"],ut=["container"],ft=["closeButton"],_t=["*"];function ht(t,n){t&1&&O(0)}function gt(t,n){if(t&1&&g(0,ht,1,0,"ng-container",4),t&2){let e=p(2);c("ngTemplateOutlet",e.headlessTemplate||e._headlessTemplate)}}function Ct(t,n){t&1&&O(0)}function bt(t,n){if(t&1&&(l(0,"div",9),d(1),s()),t&2){let e=p(3);Q(e.cx("title")),c("pBind",e.ptm("title")),r(),w(e.header)}}function wt(t,n){t&1&&(X(),z(0,"svg",12)),t&2&&v("data-pc-section","closeicon")}function yt(t,n){}function vt(t,n){t&1&&g(0,yt,0,0,"ng-template")}function xt(t,n){if(t&1&&g(0,wt,1,1,"svg",11)(1,vt,1,0,null,4),t&2){let e=p(4);c("ngIf",!e.closeIconTemplate&&!e._closeIconTemplate),r(),c("ngTemplateOutlet",e.closeIconTemplate||e._closeIconTemplate)}}function kt(t,n){if(t&1){let e=x();l(0,"p-button",10),k("onClick",function(o){_(e);let a=p(3);return h(a.close(o))})("keydown.enter",function(o){_(e);let a=p(3);return h(a.close(o))}),g(1,xt,2,2,"ng-template",null,1,ve),s()}if(t&2){let e=p(3);c("pt",e.ptm("pcCloseButton"))("ngClass",e.cx("pcCloseButton"))("buttonProps",e.closeButtonProps)("ariaLabel",e.ariaCloseLabel)("unstyled",e.unstyled()),v("data-pc-group-section","iconcontainer")}}function Mt(t,n){t&1&&O(0)}function Tt(t,n){t&1&&O(0)}function Et(t,n){if(t&1&&(se(0),l(1,"div",5),g(2,Tt,1,0,"ng-container",4),s(),de()),t&2){let e=p(3);r(),c("pBind",e.ptm("footer"))("ngClass",e.cx("footer")),v("data-pc-section","footer"),r(),c("ngTemplateOutlet",e.footerTemplate||e._footerTemplate)}}function St(t,n){if(t&1&&(l(0,"div",5),g(1,Ct,1,0,"ng-container",4)(2,bt,2,4,"div",6)(3,kt,3,6,"p-button",7),s(),l(4,"div",5),ue(5),g(6,Mt,1,0,"ng-container",4),s(),g(7,Et,3,4,"ng-container",8)),t&2){let e=p(2);c("pBind",e.ptm("header"))("ngClass",e.cx("header")),v("data-pc-section","header"),r(),c("ngTemplateOutlet",e.headerTemplate||e._headerTemplate),r(),c("ngIf",e.header),r(),c("ngIf",e.showCloseIcon&&e.closable),r(),c("pBind",e.ptm("content"))("ngClass",e.cx("content")),v("data-pc-section","content"),r(2),c("ngTemplateOutlet",e.contentTemplate||e._contentTemplate),r(),c("ngIf",e.footerTemplate||e._footerTemplate)}}function Pt(t,n){if(t&1){let e=x();l(0,"div",3,0),k("pMotionOnBeforeEnter",function(o){_(e);let a=p();return h(a.onBeforeEnter(o))})("pMotionOnAfterLeave",function(o){_(e);let a=p();return h(a.onAfterLeave(o))})("keydown",function(o){_(e);let a=p();return h(a.onKeyDown(o))}),u(2,gt,1,1,"ng-container")(3,St,8,11),s()}if(t&2){let e=p();he(e.style),Q(e.cn(e.cx("root"),e.styleClass)),c("pBind",e.ptm("root"))("pMotion",e.visible)("pMotionAppear",!0)("pMotionEnterActiveClass",e.$enterAnimation())("pMotionLeaveActiveClass",e.$leaveAnimation())("pMotionOptions",e.computedMotionOptions()),v("data-p",e.dataP)("data-p-open",e.visible),r(2),f(e.headlessTemplate||e._headlessTemplate?2:3)}}var Ot=`
${tt}

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
`,It={mask:({instance:t})=>["p-drawer-mask",{"p-overlay-mask p-overlay-mask-enter-active":t.modal},{"p-drawer-full":t.fullScreen()}],root:({instance:t})=>["p-drawer p-component",{"p-drawer-full":t.fullScreen(),"p-drawer-open":t.visible},`p-drawer-${t.position()}`],header:"p-drawer-header",title:"p-drawer-title",pcCloseButton:"p-drawer-close-button",content:"p-drawer-content",footer:"p-drawer-footer"},nt=(()=>{class t extends Ie{name="drawer";style=Ot;classes=It;static \u0275fac=(()=>{let e;return function(o){return(e||(e=q(t)))(o||t)}})();static \u0275prov=U({token:t,factory:t.\u0275fac})}return t})();var it=new J("DRAWER_INSTANCE"),Dt=(()=>{class t extends Le{componentName="Drawer";$pcDrawer=M(it,{optional:!0,skipSelf:!0})??void 0;bindDirectiveInstance=M(L,{self:!0});onAfterViewChecked(){this.bindDirectiveInstance.setAttrs(this.ptm("host"))}appendTo=D(void 0);motionOptions=D(void 0);computedMotionOptions=I(()=>j(j({},this.ptm("motion")),this.motionOptions()));blockScroll=!1;style;styleClass;ariaCloseLabel;autoZIndex=!0;baseZIndex=0;modal=!0;closeButtonProps={severity:"secondary",text:!0,rounded:!0};dismissible=!0;showCloseIcon=!0;closeOnEscape=!0;transitionOptions="150ms cubic-bezier(0, 0, 0.2, 1)";get visible(){return this._visible??!1}set visible(e){this._visible=e,this._visible&&!this.modalVisible&&(this.modalVisible=!0)}position=D("left");fullScreen=D(!1);$enterAnimation=I(()=>this.fullScreen()?"p-drawer-enter-full":`p-drawer-enter-${this.position()}`);$leaveAnimation=I(()=>this.fullScreen()?"p-drawer-leave-full":`p-drawer-leave-${this.position()}`);header;maskStyle;closable=!0;onShow=new B;onHide=new B;visibleChange=new B;containerViewChild;closeButtonViewChild;initialized;_visible;_position="left";_fullScreen=!1;modalVisible=!1;container;mask;maskClickListener;documentEscapeListener;animationEndListener;_componentStyle=M(nt);onAfterViewInit(){this.initialized=!0}headerTemplate;footerTemplate;contentTemplate;closeIconTemplate;headlessTemplate;$appendTo=I(()=>this.appendTo()||this.config.overlayAppendTo());_headerTemplate;_footerTemplate;_contentTemplate;_closeIconTemplate;_headlessTemplate;templates;onAfterContentInit(){this.templates?.forEach(e=>{switch(e.getType()){case"content":this._contentTemplate=e.template;break;case"header":this._headerTemplate=e.template;break;case"footer":this._footerTemplate=e.template;break;case"closeicon":this._closeIconTemplate=e.template;break;case"headless":this._headlessTemplate=e.template;break;default:this._contentTemplate=e.template;break}})}onKeyDown(e){e.code==="Escape"&&this.hide(!1)}show(){this.container?.setAttribute(this.$attrSelector,""),this.autoZIndex&&A.set("modal",this.container,this.baseZIndex||this.config.zIndex.modal),this.modal&&this.enableModality(),this.onShow.emit({}),this.visibleChange.emit(!0)}hide(e=!0){e&&this.onHide.emit({}),this.modal&&this.disableModality()}close(e){this.hide(),this.visibleChange.emit(!1),this.cd.markForCheck(),e.preventDefault()}enableModality(){let e=this.document.querySelectorAll('[data-p-open="true"]'),i=e.length,o=i==1?String(parseInt(this.container.style.zIndex)-1):String(parseInt(e[i-1].style.zIndex)-1);if(!this.mask){if(this.mask=this.renderer.createElement("div"),this.mask){let a=`z-index: ${o};${this.getMaskStyle()}`;G(this.mask,"style",a),G(this.mask,"data-p",this.dataP),Z(this.mask,this.cx("mask"))}this.dismissible&&(this.maskClickListener=this.renderer.listen(this.mask,"click",a=>{this.dismissible&&this.close(a)})),this.renderer.appendChild(this.document.body,this.mask),this.blockScroll&&Ae()}}getMaskStyle(){return this.maskStyle?Object.entries(this.maskStyle).map(([e,i])=>`${e}: ${i}`).join("; "):""}disableModality(){this.mask&&(!this.$unstyled()&&Pe(this.mask,"p-overlay-mask-enter-active"),!this.$unstyled()&&Z(this.mask,"p-overlay-mask-leave-active"),this.animationEndListener=this.renderer.listen(this.mask,"animationend",this.destroyModal.bind(this)))}destroyModal(){this.unbindMaskClickListener(),this.mask&&this.renderer.removeChild(this.document.body,this.mask),this.blockScroll&&Be(),this.unbindAnimationEndListener(),this.mask=null}onBeforeEnter(e){this.container=e.element,this.appendContainer(),this.show(),this.closeOnEscape&&this.bindDocumentEscapeListener()}onAfterLeave(){this.hide(!1),A.clear(this.container),this.unbindGlobalListeners(),this.modalVisible=!1,this.container=null}appendContainer(){this.$appendTo()&&this.$appendTo()!=="self"&&(this.$appendTo()==="body"?K(this.document.body,this.container):K(this.$appendTo(),this.container))}bindDocumentEscapeListener(){let e=this.el?this.el.nativeElement.ownerDocument:this.document;this.documentEscapeListener=this.renderer.listen(e,"keydown",i=>{i.which==27&&parseInt(this.container?.style.zIndex)===A.get(this.container)&&this.close(i)})}unbindDocumentEscapeListener(){this.documentEscapeListener&&(this.documentEscapeListener(),this.documentEscapeListener=null)}unbindMaskClickListener(){this.maskClickListener&&(this.maskClickListener(),this.maskClickListener=null)}unbindGlobalListeners(){this.unbindMaskClickListener(),this.unbindDocumentEscapeListener()}unbindAnimationEndListener(){this.animationEndListener&&this.mask&&(this.animationEndListener(),this.animationEndListener=null)}onDestroy(){this.initialized=!1,this.visible&&this.modal&&this.destroyModal(),this.$appendTo()&&this.container&&this.renderer.appendChild(this.el.nativeElement,this.container),this.container&&this.autoZIndex&&A.clear(this.container),this.container=null,this.unbindGlobalListeners(),this.unbindAnimationEndListener()}get dataP(){return this.cn({"full-screen":this.position()==="full",[this.position()]:this.position(),open:this.visible,modal:this.modal})}static \u0275fac=(()=>{let e;return function(o){return(e||(e=q(t)))(o||t)}})();static \u0275cmp=T({type:t,selectors:[["p-drawer"]],contentQueries:function(i,o,a){if(i&1&&fe(a,st,4)(a,dt,4)(a,pt,4)(a,ct,4)(a,mt,4)(a,Oe,4),i&2){let m;C(m=b())&&(o.headerTemplate=m.first),C(m=b())&&(o.footerTemplate=m.first),C(m=b())&&(o.contentTemplate=m.first),C(m=b())&&(o.closeIconTemplate=m.first),C(m=b())&&(o.headlessTemplate=m.first),C(m=b())&&(o.templates=m)}},viewQuery:function(i,o){if(i&1&&_e(ut,5)(ft,5),i&2){let a;C(a=b())&&(o.containerViewChild=a.first),C(a=b())&&(o.closeButtonViewChild=a.first)}},inputs:{appendTo:[1,"appendTo"],motionOptions:[1,"motionOptions"],blockScroll:[2,"blockScroll","blockScroll",y],style:"style",styleClass:"styleClass",ariaCloseLabel:"ariaCloseLabel",autoZIndex:[2,"autoZIndex","autoZIndex",y],baseZIndex:[2,"baseZIndex","baseZIndex",xe],modal:[2,"modal","modal",y],closeButtonProps:"closeButtonProps",dismissible:[2,"dismissible","dismissible",y],showCloseIcon:[2,"showCloseIcon","showCloseIcon",y],closeOnEscape:[2,"closeOnEscape","closeOnEscape",y],transitionOptions:"transitionOptions",visible:"visible",position:[1,"position"],fullScreen:[1,"fullScreen"],header:"header",maskStyle:"maskStyle",closable:[2,"closable","closable",y]},outputs:{onShow:"onShow",onHide:"onHide",visibleChange:"visibleChange"},features:[be([nt,{provide:it,useExisting:t},{provide:De,useExisting:t}]),ie([L]),oe],ngContentSelectors:_t,decls:1,vars:1,consts:[["container",""],["icon",""],["role","complementary","pFocusTrap","",3,"pBind","pMotion","pMotionAppear","pMotionEnterActiveClass","pMotionLeaveActiveClass","pMotionOptions","class","style"],["role","complementary","pFocusTrap","",3,"pMotionOnBeforeEnter","pMotionOnAfterLeave","keydown","pBind","pMotion","pMotionAppear","pMotionEnterActiveClass","pMotionLeaveActiveClass","pMotionOptions"],[4,"ngTemplateOutlet"],[3,"pBind","ngClass"],[3,"pBind","class",4,"ngIf"],[3,"pt","ngClass","buttonProps","ariaLabel","unstyled","onClick","keydown.enter",4,"ngIf"],[4,"ngIf"],[3,"pBind"],[3,"onClick","keydown.enter","pt","ngClass","buttonProps","ariaLabel","unstyled"],["data-p-icon","times",4,"ngIf"],["data-p-icon","times"]],template:function(i,o){i&1&&(me(),u(0,Pt,4,13,"div",2)),i&2&&f(o.modalVisible?0:-1)},dependencies:[W,ke,Me,Te,Ve,Ne,$,L,Xe,Je,Ue,Ge],encapsulation:2,changeDetection:0})}return t})(),In=(()=>{class t{static \u0275fac=function(i){return new(i||t)};static \u0275mod=ne({type:t});static \u0275inj=H({imports:[Dt,$,$]})}return t})();var Lt=(t,n)=>n.id,At=(t,n)=>n.key;function Bt(t,n){if(t&1&&d(0),t&2){let e=p();F(" ",e.part.kind.slice(7)," \xB7 material addition ")}}function Nt(t,n){if(t&1&&z(0,"app-product-link",1),t&2){let e=p();c("item",e.part)}}function Vt(t,n){if(t&1&&d(0),t&2){let e=p();F(" ",e.part.product_name," ")}}function zt(t,n){t&1&&(l(0,"p"),d(1,"Reusable base cost. Cart colour and optional shelves do not duplicate these materials."),s())}function Ft(t,n){t&1&&(l(0,"p"),d(1,"Add only the extra materials and work required by this option. The base Cart cost is added automatically."),s())}function Wt(t,n){t&1&&(l(0,"p")(1,"b"),d(2,"Exclude the standard tabletop materials."),s(),d(3," The replacement tabletop has its own profile below."),s())}function $t(t,n){t&1&&(l(0,"p"),d(1,"No complete saved cost profile yet. Add the missing information."),s())}function Rt(t,n){t&1&&(l(0,"p"),d(1,"Existing material quantities have been loaded. Check them before saving."),s())}function jt(t,n){if(t&1&&(l(0,"option",10),d(1),s()),t&2){let e=n.$implicit;c("value",e.id),r(),Ce("",e.name," \xB7 ",e.unit,"",e.active?"":" (archived)")}}function qt(t,n){if(t&1){let e=x();l(0,"div",3)(1,"label"),d(2,"Material"),l(3,"select",8),P("ngModelChange",function(o){let a=_(e).$implicit;return S(a.material_id,o)||(a.material_id=o),h(o)}),l(4,"option",9),d(5,"Choose material"),s(),N(6,jt,2,4,"option",10,Lt),s()(),l(8,"label"),d(9,"Quantity"),l(10,"input",11),P("ngModelChange",function(o){let a=_(e).$implicit;return S(a.quantity,o)||(a.quantity=o),h(o)}),s()(),l(11,"button",4),k("click",function(){let o=_(e).$index,a=p();return h(a.lines.splice(o,1))}),d(12,"Remove"),s()()}if(t&2){let e=n.$implicit,i=p();r(3),E("ngModel",e.material_id),r(3),V(i.s.materials()),r(4),E("ngModel",e.quantity)}}function Qt(t,n){if(t&1){let e=x();l(0,"label"),d(1),l(2,"input",12),P("ngModelChange",function(o){let a=_(e).$implicit,m=p(2);return S(m.work[a.key],o)||(m.work[a.key]=o),h(o)}),s()()}if(t&2){let e=n.$implicit,i=p(2);r(),w(e.label),r(),E("ngModel",i.work[e.key])}}function Zt(t,n){if(t&1&&(l(0,"h4"),d(1,"Work cost for one unit \xB7 incl. GST"),s(),l(2,"div",3),N(3,Qt,3,2,"label",null,At),s()),t&2){let e=p();r(3),V(e.categories)}}function Kt(t,n){if(t&1){let e=x();l(0,"label"),d(1,"Pans purchase cost \xB7 complete set for one product, incl. GST"),l(2,"input",12),P("ngModelChange",function(o){_(e);let a=p();return S(a.pans,o)||(a.pans=o),h(o)}),s()()}if(t&2){let e=p();r(2),E("ngModel",e.pans)}}function Gt(t,n){t&1&&d(0,"Blank = unknown. Zero = no cost. ")}function Ut(t,n){t&1&&(l(0,"p",7),d(1,"Saved to the shared product catalogue."),s())}var ot=class t{constructor(n){this.s=n}s;part;linkProduct=!1;showWork=!0;hideColour=!1;lines=[];work={};pans=null;confirmed=!1;version=null;saved=!1;categories=[{key:"cnc",label:"CNC"},{key:"assembly",label:"Assembly"},{key:"sanding",label:"Sanding"},{key:"painting",label:"Painting"}];openedKey="";ngOnChanges(){this.openedKey!==this.part.variant_key&&(this.openedKey=this.part.variant_key,this.lines=structuredClone(this.part.profile?.lines||this.part.legacy_lines||[]),this.work=Object.fromEntries(this.categories.map(n=>[n.key,this.part.profile?.work_costs?.[n.key]??null])),this.pans=this.part.profile?.pans_cost_gst??null,this.confirmed=this.part.profile?.materials_confirmed??!1,this.version=this.part.profile?.updated_at??null,this.saved=!1)}options(){return Object.entries(this.part.options||{}).filter(([n])=>!this.hideColour||!["colour","color"].includes(n.toLowerCase())).map(([n,e])=>`${n}: ${e}`).join(" \xB7 ")||"No structural options"}materialTotal(){if(!this.confirmed)return null;let n=0;for(let e of this.lines){let i=this.s.materials().find(o=>o.id===e.material_id);if(!i?.active||i.price_gst==null)return null;n+=Math.round(Number(i.price_gst)*Number(e.quantity)*100)}return n/100}invalid(){return new Set(this.lines.map(n=>n.material_id)).size!==this.lines.length||this.lines.some(n=>!this.s.materials().some(e=>e.id===n.material_id&&e.active)||!Number.isFinite(Number(n.quantity))||Number(n.quantity)<=0)||Object.values(this.work).some(n=>n!=null&&(!Number.isFinite(Number(n))||Number(n)<0))||this.pans!=null&&(!Number.isFinite(Number(this.pans))||Number(this.pans)<0)}async save(){if(!this.invalid()){if(this.part.backdrop_material_scope){if(!await this.s.saveBackdropMaterialProfile(this.part,this.lines,this.confirmed,this.part.profile?.updated_at??null))return}else if(this.part.cart_material_scope){if(!await this.s.saveCartMaterialProfile(this.part,this.lines,this.confirmed,this.part.profile?.updated_at??null))return}else{let n=this.part.shared_parts?.length?this.part.shared_parts:[this.part];for(let e of n){let i=this.showWork?this.work:e.profile?.work_costs||this.work;if(!await this.s.saveCatalogProfile(e,this.lines,i,this.pans,this.confirmed,e.profile?.updated_at??null))return}}this.version=this.s.profiles().find(n=>n.variant_key===this.part.variant_key)?.updated_at??null,this.saved=!0}}static \u0275fac=function(e){return new(e||t)(te(Ye))};static \u0275cmp=T({type:t,selectors:[["app-catalog-cost-editor"]],inputs:{part:"part",linkProduct:"linkProduct",showWork:"showWork",hideColour:"hideColour"},features:[Y],decls:36,vars:22,consts:[[1,"editor"],[3,"item"],[3,"disabled"],[1,"fields"],[3,"click"],["type","checkbox",3,"ngModelChange","ngModel"],[1,"primary",3,"click","disabled"],["role","status"],[3,"ngModelChange","ngModel"],["value",""],[3,"value"],["type","number","min","0.0001","step","0.0001",3,"ngModelChange","ngModel"],["type","number","min","0","step","0.01","placeholder","Unknown",3,"ngModelChange","ngModel"]],template:function(e,i){e&1&&(l(0,"section",0)(1,"h3"),u(2,Bt,1,1)(3,Nt,1,1,"app-product-link",1)(4,Vt,1,1),s(),l(5,"small"),d(6),s(),l(7,"p"),d(8),s(),u(9,zt,2,0,"p"),u(10,Ft,2,0,"p"),u(11,Wt,4,0,"p"),u(12,$t,2,0,"p"),u(13,Rt,2,0,"p"),l(14,"fieldset",2)(15,"legend"),d(16),s(),N(17,qt,13,2,"div",3,ae),l(19,"button",4),k("click",function(){return i.lines.push({material_id:"",quantity:1})}),d(20,"Add material"),s(),l(21,"p")(22,"label")(23,"input",5),P("ngModelChange",function(a){return S(i.confirmed,a)||(i.confirmed=a),a}),s(),d(24," Material list complete (an empty list means no materials)"),s()(),l(25,"b"),d(26),we(27,"currency"),s(),u(28,Zt,5,0),u(29,Kt,3,1,"label"),l(30,"p"),u(31,Gt,1,0),d(32,"Saved order calculations stay unchanged."),s(),l(33,"button",6),k("click",function(){return i.save()}),d(34),s(),u(35,Ut,2,0,"p",7),s()()),e&2&&(r(2),f(i.part.kind.startsWith("option:")?2:i.linkProduct?3:4),r(4),ge("",i.part.kind==="main"?"Base product":i.part.kind.startsWith("option:")?"Cart option delta":i.part.kind==="processing"?"Processing of addon":i.part.kind==="replacement"?"Replacement tabletop":"Addon"," \xB7 ",i.part.multiplier," per finished product"),r(2),w(i.options()),r(),f(i.part.kind==="main"?9:-1),r(),f(i.part.kind.startsWith("option:")?10:-1),r(),f(i.part.standard_top_excluded?11:-1),r(),f(i.part.profile?-1:12),r(),f(i.part.legacy_lines!=null&&i.part.legacy_lines.length&&!i.part.profile?13:-1),r(),c("disabled",i.s.busy()||i.s.loading()),r(2),w(i.part.kind.startsWith("option:")?"Additional materials for one selected option":"Materials for one "+(i.part.kind==="main"?"base product":"addon")),r(),V(i.lines),r(6),E("ngModel",i.confirmed),r(3),F("Material cost: ",i.materialTotal()===null?"\u2014":ye(27,19,i.materialTotal(),"AUD")),r(2),f(i.showWork?28:-1),r(),f(i.part.has_pans?29:-1),r(2),f(i.showWork?31:-1),r(2),c("disabled",i.invalid()),r(),w(i.s.busy()?"Saving\u2026":"Save product profile"),r(),f(i.saved?35:-1))},dependencies:[R,W,Ke,qe,Qe,Fe,Re,ze,je,We,Ze,$e,Ee],styles:["[_nghost-%COMP%]{display:block;min-width:0}header[_ngcontent-%COMP%], .toolbar[_ngcontent-%COMP%], .fields[_ngcontent-%COMP%]{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px}header[_ngcontent-%COMP%]{justify-content:space-between}h1[_ngcontent-%COMP%], h3[_ngcontent-%COMP%]{margin:0}p[_ngcontent-%COMP%], small[_ngcontent-%COMP%]{color:var(--wc-muted)}small[_ngcontent-%COMP%]{display:block}.editor[_ngcontent-%COMP%]{padding:16px;margin:16px 0;background:var(--wc-surface);border:1px solid var(--wc-border);border-radius:12px}.fields[_ngcontent-%COMP%]{align-items:end}.fields[_ngcontent-%COMP%]   label[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:4px}input[_ngcontent-%COMP%], select[_ngcontent-%COMP%]{max-width:100%}.table-wrap[_ngcontent-%COMP%]{overflow:auto;background:var(--wc-surface);border:1px solid var(--wc-border);border-radius:8px}table[_ngcontent-%COMP%]{width:100%}.badge[_ngcontent-%COMP%]{display:inline-block;padding:3px 7px;background:#fff3d6;color:#92400e}.badge.done[_ngcontent-%COMP%]{background:#dcfce7;color:#166534}a[_ngcontent-%COMP%]{color:var(--wc-primary)}[role=alert][_ngcontent-%COMP%]{color:#b91c1c}.cost-summary[_ngcontent-%COMP%]{padding:12px;background:var(--wc-ground);border:1px solid var(--wc-border);border-radius:8px}.composition-alert[_ngcontent-%COMP%]{margin-top:12px;padding:12px;background:#fff3d6;border:1px solid #f4d59a;border-radius:8px}.composition-alert[_ngcontent-%COMP%]   p[_ngcontent-%COMP%]{color:inherit}.profile-heading[_ngcontent-%COMP%], details[_ngcontent-%COMP%]{margin-top:12px}summary[_ngcontent-%COMP%]{cursor:pointer}details[_ngcontent-%COMP%]   table[_ngcontent-%COMP%]{margin-top:8px}"]})};export{R as a,Dt as b,In as c,ot as d};
