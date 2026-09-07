# Aura across the Hub

PrimeNG already uses the installed Aura preset in `app.config.ts`. Previously,
component styles overrode its table, control and typography defaults, while
native HTML screens and the Finance iframe used independent styling.

Component styles now live in the `hub-layout` cascade layer. Their layout and
business status colours remain available; unlayered Aura component styles take
precedence. `angular-app/public/aura-hub.css` adapts native tables, controls,
navigation and cards to the same Aura tokens. It is imported by the Angular
global stylesheet and linked by Finance. Finance also receives the active
`--p-*` variables from its same-origin parent when its frame loads; standalone
light-theme fallbacks remain available.

Use PrimeNG components for new UI. Put screen-specific layout in `hub-layout`;
change shared visual defaults through Aura or the native adapter, rather than
adding per-page font and table overrides. Keep status colours meaningful.
Rendered email content is excluded from the adapter.

This is a visual change. No shipping, order, quote, approval or finance data
contracts change. Browser review uses synthetic local fixtures with external
requests blocked. Existing component/service tests cover the business flows;
the Finance test also checks theme propagation into its frame.
