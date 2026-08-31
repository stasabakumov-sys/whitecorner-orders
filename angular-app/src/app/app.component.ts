import { Component, effect, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/services/auth.service';
import { OrdersService } from './core/services/orders.service';
import { ActivityService } from './core/services/activity.service';
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
        @for (n of nav; track n[1]) {
          <a [routerLink]="n[1]" routerLinkActive="active"><span>{{ n[2] }}</span>{{ n[0] }}</a>
        }
        <button (click)="auth.signOut()">Sign out</button>
      </aside>
      <main>
        <header>White Corner Hub <small>Angular 22 preview</small></header>
        <div class="content"><router-outlet /></div>
      </main>
    }
  `,
  styles: [`
    .boot{position:fixed;inset:0;display:grid;place-items:center;background:#f4f6f8}.boot>div{display:flex;flex-direction:column;gap:8px;text-align:center}.boot span{color:#758198;font-size:12px}aside{position:fixed;inset:0 auto 0 0;width:240px;background:#17191f;color:#fff;padding:18px 10px}.brand{padding:2px 12px 22px;font-size:18px}.brand small{display:block;color:#9097a5;font-size:11px}aside a{color:#dfe4ec;text-decoration:none;padding:10px 12px;border-radius:8px;display:flex;gap:12px;margin:2px 0}aside a.active{background:#2b3039;color:#fff}aside button{position:absolute;bottom:20px;left:22px;right:22px;background:transparent;color:#fff;border:1px solid #454b57;border-radius:8px;padding:8px}main{margin-left:240px;min-height:100vh;background:#f4f6f8}header{height:56px;background:#fff;border-bottom:1px solid #e4e7ec;display:flex;align-items:center;padding:0 24px;font-size:18px;font-weight:600}header small{margin-left:auto;color:#758198}.content{padding:18px 24px 38px}
  `],
})
export class AppComponent {
  readonly nav = [
    ['Home','/home','⌂'],
    ['Orders','/orders','▤'],
    ['Production Board','/production','▦'],
    ['Fulfilment','/fulfilment','✓'],
    ['Address Review','/address-review','◎'],
    ['Shipping Data','/shipping-data','⇄'],
  ] as const;
  readonly workspaceReady = signal(false);
  private preloading = false;

  constructor(
    readonly auth: AuthService,
    private readonly orders: OrdersService,
    private readonly activity: ActivityService,
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
      ]).finally(() => {
        this.workspaceReady.set(true);
        this.preloading = false;
      });
    });
  }
}
