import { Component, effect, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/services/auth.service';
import { OrdersService } from './core/services/orders.service';
import { ActivityService } from './core/services/activity.service';
import { EmailService } from './core/services/email.service';
import { LoginComponent } from './shared/login/login.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, LoginComponent],
  template: `
    @if (!auth.ready()) {
      <div class="boot">Loading…</div>
    } @else if (!auth.session()) {
      <app-login />
    } @else if (!workspaceReady()) {
      <div class="boot"><div><b>White Corner Hub</b><span>Loading workspace…</span></div></div>
    } @else {
      <aside>
        <div class="brand">White Corner<small>Hub</small></div>
        <a routerLink="/home" routerLinkActive="active"><span>⌂</span>Home</a>
        <a routerLink="/orders" routerLinkActive="active"><span>▤</span>Orders</a>
        <a routerLink="/production" routerLinkActive="active"><span>▦</span>Production Board</a>
        <a routerLink="/fulfilment" routerLinkActive="active"><span>✓</span>Fulfilment</a>
        <a routerLink="/email" routerLinkActive="active"><span>✉</span>Email</a>
        <a routerLink="/address-review" routerLinkActive="active"><span>◎</span>Address Review</a>
        <a routerLink="/shipping-data" routerLinkActive="active"><span>⇄</span>Shipping Data</a>
        <button (click)="auth.signOut()">Sign out</button>
      </aside>
      <main>
        <div class="content" [class.email-content]="router.url.startsWith('/email')">
          @if (router.url.startsWith('/email')) {
            <div class="gmail-connect-bar">
              <div class="gmail-title"><span class="gmail-dot" [class.ok]="email.connectedCount()===2"></span><b>Gmail</b><small>{{email.connectedCount()}}/2</small></div>
              <div class="gmail-account" [class.connected]="email.isConnected('info')">
                <span>info@whitecorner.com.au</span>
                @if (email.isConnected('info')) {<strong>Connected</strong>} @else {<button type="button" (click)="email.connect('info')" [disabled]="email.loading()">Connect</button>}
              </div>
              <div class="gmail-account" [class.connected]="email.isConnected('support')">
                <span>support@whitecorner.com.au</span>
                @if (email.isConnected('support')) {<strong>Connected</strong>} @else {<button type="button" (click)="email.connect('support')" [disabled]="email.loading()">Connect</button>}
              </div>
              <button class="refresh-mail" type="button" (click)="email.refreshStatus()">↻</button>
              @if (email.error()) {<div class="gmail-error">{{email.error()}}</div>}
            </div>
          }
          <router-outlet />
        </div>
      </main>
    }
  `,
  styles: [`
    .boot{position:fixed;inset:0;display:grid;place-items:center;background:#f4f6f8}.boot>div{display:flex;flex-direction:column;gap:8px;text-align:center}.boot span{color:#758198;font-size:12px}
    aside{position:fixed;inset:0 auto 0 0;width:205px;background:#17191f;color:#fff;padding:18px 9px}.brand{padding:2px 11px 22px;font-size:18px}.brand small{display:block;color:#9097a5;font-size:11px}
    aside a{color:#dfe4ec;text-decoration:none;padding:9px 11px;border-radius:8px;display:flex;gap:10px;margin:2px 0;align-items:center;font-size:14px}aside a.active{background:#2b3039;color:#fff}
    aside button{position:absolute;bottom:20px;left:18px;right:18px;background:transparent;color:#fff;border:1px solid #454b57;border-radius:8px;padding:8px}
    main{margin-left:205px;height:100vh;overflow:hidden;background:#f4f6f8}.content{height:100vh;overflow:auto;padding:12px 16px 24px}.content.email-content{overflow:hidden;padding:6px 10px 8px;display:flex;flex-direction:column}.content.email-content app-email{display:block;flex:1;min-height:0}
    .gmail-connect-bar{display:flex;align-items:center;gap:6px;flex:0 0 auto;background:#fff;border:1px solid #dfe3e8;border-radius:8px;padding:4px 6px;margin-bottom:5px;min-height:32px}.gmail-title{display:flex;align-items:center;gap:5px;margin-right:auto;white-space:nowrap}.gmail-title b{font-size:10px;color:#344054}.gmail-title small{font-size:9px;color:#98a2b3}.gmail-dot{width:8px;height:8px;border-radius:50%;background:#f59e0b}.gmail-dot.ok{background:#12b76a}.gmail-account{display:flex;align-items:center;gap:5px;border:1px solid #e4e7ec;border-radius:7px;padding:3px 6px;font-size:9px;color:#475467;background:#fafbfc}.gmail-account.connected{background:#f6fef9;border-color:#d1fadf}.gmail-account strong{font-size:8px;color:#067647}.gmail-account button,.refresh-mail{position:static!important;left:auto!important;right:auto!important;bottom:auto!important;width:auto!important;border:0!important;border-radius:6px!important;background:#172033!important;color:#fff!important;padding:3px 6px!important;font-size:8px!important;cursor:pointer}.gmail-account button:disabled{opacity:.55;cursor:default}.refresh-mail{background:#eef2f6!important;color:#475467!important;padding:5px 7px!important}.gmail-error{width:100%;font-size:10px;color:#b42318;background:#fef3f2;border-radius:6px;padding:6px 8px}
    :host ::ng-deep app-fulfilment .head{align-items:flex-start!important;flex-direction:column!important;gap:12px!important}
    :host ::ng-deep app-fulfilment .tabs{margin-left:0!important}
    @media(max-width:760px){.gmail-title{width:100%}.gmail-account{flex:1 1 100%}}
  `],
})
export class AppComponent {
  readonly workspaceReady = signal(false);
  private preloading = false;

  constructor(
    readonly auth: AuthService,
    private readonly orders: OrdersService,
    private readonly activity: ActivityService,
    readonly email: EmailService,
    readonly router: Router,
  ) {
    void auth.initialize();
    effect(() => {
      const session = auth.session();
      if (!session) {
        this.workspaceReady.set(false);
        this.preloading = false;
        return;
      }
      if (this.workspaceReady() || this.preloading) return;
      this.preloading = true;
      void Promise.allSettled([
        this.orders.load(),
        this.activity.load(),
        this.email.refreshStatus(),
      ]).finally(() => {
        this.workspaceReady.set(true);
        this.preloading = false;
      });
    });
  }
}
