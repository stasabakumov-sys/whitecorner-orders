import { Component } from '@angular/core';

@Component({
  selector: 'app-finance',
  standalone: true,
  template: `
    <section class="finance-shell">
      <iframe
        src="finance/index.html"
        title="White Corner Finance"
        loading="eager"
      ></iframe>
    </section>
  `,
  styles: [`
    :host{display:block;height:100%;min-height:0}
    .finance-shell{height:100%;min-height:0;background:#f4f6f8}
    iframe{display:block;width:100%;height:100%;border:0;background:#f4f6f8}
  `],
})
export class FinanceComponent {}
