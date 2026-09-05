# AGENTS.md — White Corner Hub

## Назначение

White Corner Hub — внутреннее операционное приложение White Corner для работы с заказами: синхронизации заказов Wix, производственного учёта, проверки адресов, подготовки и оформления доставки, почты и финансового представления. Доступ к данным приложения рассчитан на аутентифицированных пользователей White Corner.

## Актуальная структура репозитория

- `angular-app/` — **основное приложение**, Angular 21.2 workspace (`^21.2.0` в `package.json`; в `package-lock.json` — Angular core/compiler-cli 21.2.22, CLI/build 21.2.23), PrimeNG 21.1.9, PrimeUIX Themes (`@primeuix/themes`) 2.0.3 и TypeScript (`~5.9.2` в `package.json`, 5.9.3 в lockfile). Рабочий UI, модели и интеграционные сервисы находятся в `angular-app/src/app/`; публичные файлы — в `angular-app/public/`; настройки окружения — в `angular-app/src/environments/`.
- `supabase/` — серверная часть: SQL-схема, последовательные migrations, конфигурация Supabase, cron-пример и Edge Functions.
  - `supabase/migrations/` — версионируемые изменения рабочей схемы и RLS. Новые изменения БД оформляйте новой миграцией; не переписывайте уже применённые миграции без явного запроса.
  - `supabase/functions/` — Deno Edge Functions, через которые выполняются привилегированные операции и обращения к внешним API.
  - `supabase/orders-schema.sql` — исходная базовая схема заказов. Репозиторий не уточняет, должна ли она поддерживаться как полный снимок актуальной схемы; при изменении БД ориентируйтесь на migrations и уточните необходимость синхронизации этого файла.
- `docs/` — документация и материалы для Email AI.
- `.github/workflows/` — сборка публикаций и деплой Edge Functions.
- `README.md` — устаревшее краткое описание раннего прототипа; оно не является описанием текущего Angular-приложения.

### Исторические прототипы и собранные публикации

`index.html`, `v0.3-preview.html`, каталоги `v04/`–`v097/`, `angular-preview/` и `angular2/` содержат исторические standalone-прототипы или собранные preview-артефакты. **Не изменяйте их без явного запроса.** Изменения продукта вносите в `angular-app/`. Некоторые существующие workflows всё ещё публикуют эти каталоги; требуемая целевая схема публикации основного приложения в репозитории однозначно не зафиксирована и требует уточнения перед изменением deployment flow.

## Команды основного приложения

Все npm-команды выполняются из `angular-app/`:

```bash
cd angular-app
npm ci                 # воспроизводимая установка из package-lock.json
npm start              # dev server (по умолчанию http://localhost:4200/)
npm run build          # production build в dist/
npm run watch          # development build в watch-режиме
npm test -- --watch=false  # однократный запуск unit tests
```

В `package.json` нет lint-скрипта и в workspace не настроен e2e runner. Версия Node.js зафиксирована в корневом `.nvmrc`: `v22.22.3`; версия npm — в `angular-app/package.json`, поле `packageManager`: `npm@10.9.8`. Для Supabase CLI также нет локального npm-скрипта или зафиксированной версии вне CI (`latest`); команды локального запуска/проверки Supabase следует согласовать, а не придумывать.

## Supabase migrations и Edge Functions

- Migrations создают и развивают таблицы `wc_*`, ограничения, индексы и RLS для заказов, production units, fulfilment/shipments, shipping profiles, address review и email. Сохраняйте порядок миграций, обратную совместимость с существующими данными и принцип закрытого доступа через RLS.
- Edge Functions являются серверной границей для Wix, Fast Courier, Gmail/OAuth, address review и Email AI. Внешние API credentials и `SUPABASE_SERVICE_ROLE_KEY` должны использоваться только здесь, через runtime secrets.
- Изменяя контракт функции, одновременно проверяйте вызывающий Angular service, миграции/таблицы и соответствующий deploy workflow.
- Не выполняйте deployment, production migration, реальную courier booking, отправку Gmail или изменение заказа Wix в рамках проверки без явного разрешения.

## Заказы, booking и GST

### Заказы и Wix

- Wix — источник импортируемых полей заказа. `wix-orders-sync` синхронизирует незавершённые, неархивные и неотменённые заказы и upsert-ит их по `wix_order_id`.
- Синхронизация **не должна перезаписывать локальные White Corner fields** (`internal_comment`, `due_date`, `priority`, `is_hidden` и локальные поля items/production units). Не заменяйте selective upsert полной перезаписью строк.
- Одна `wc_production_units` соответствует одной физической единице товара: quantity позиции Wix разворачивается в независимые units.
- Delivery/shipping fee line не является производственным товаром. При определении Pickup учитывайте существующее правило: нулевая delivery line вместе с нулевым shipping total считается Pickup.
- Завершение Pickup синхронно помечает fulfilment и заказ выполненными и отправляет fulfillment в Wix; при ошибке Wix локальные изменения откатываются. Не ослабляйте эту согласованность без отдельного решения.

### Fast Courier booking

- Запрос quotes допустим только после заполнения всех package dimensions/weight/contents, назначения всех товаров упаковкам и явного approval packing list.
- Изменение упаковки до booking инвалидирует сохранённый quote и возвращает shipment в `Packaging Review`.
- Booking — операция с реальными последствиями: она создаёт отправление и списывает средства с сохранённого аккаунта Fast Courier. До вызова API обязательны выбранный quote, заполненная форма, дата не раньше текущей, подтверждение условий/отсутствия dangerous goods и отдельное подтверждение суммы пользователем.
- Если доступный страховой tier не покрывает стоимость товара, quote нельзя выбирать и booking нельзя создавать: требуется manual review.
- После booking сохраняйте статус и полученные label/invoice/manifest в приватном bucket `shipping-documents`; наружу выдавайте только короткоживущие signed URLs. Не делайте bucket публичным.

### GST и суммы

- Текущая реализация считает цены order items (или `order.subtotal` как fallback) суммами **включая GST**; стоимость товаров без GST вычисляется делением на `1.1` и округлением до центов. Delivery исключена из goods value для insurance.
- Порог extended liability сейчас применяется к goods value без GST: при сумме свыше AUD 450 добавляется fee выбранного страхового tier.
- Итог courier quote в UI — `priceIncludingGst + insuranceFee`; declared `valueOfContent` для booking передаётся включая GST.
- Не меняйте трактовку GST, порог AUD 450, валюту AUD или включение insurance fee без явного бизнес-требования. Репозиторий не содержит отдельной налоговой спецификации и не объясняет, применимы ли эти правила к освобождённым от GST товарам/другим ставкам; такие случаи требуют уточнения.

## Интеграции

- **Wix:** `wix-orders-sync` читает заказы через Wix eCommerce API и создаёт fulfillment только для локально завершённого Pickup. Использует `WIX_API_KEY`, `WIX_SITE_ID`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; предусмотрен cron-пример синхронизации каждые 5 минут.
- **Fast Courier:** `fast-courier-api` проксирует address classification, quotes, insurance list, order details, booking, status и документы. Использует `FAST_COURIER_API_KEY`, опциональный `FAST_COURIER_API_BASE_URL`, `GOOGLE_MAPS_API_KEY` и Supabase server credentials.
- **Gmail:** `gmail-oauth` подключает mailboxes `info` и `support`; refresh tokens хранятся в `wc_mailboxes`, для которой намеренно нет authenticated RLS policies. `gmail-api` читает, отправляет/пересылает письма и меняет их состояние. OAuth/API используют `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` и Supabase credentials. Точные production redirect/return URLs сейчас зашиты в функции; перед изменением домена их нужно отдельно проверить.

## Безопасность секретов и данных

- Никогда не коммитьте private API keys, OAuth client secrets, refresh/access tokens, service-role keys, пароли, `.env` с credentials или production customer/email payloads.
- Секреты Edge Functions должны читаться через `Deno.env`; секрет CI для deployment — через GitHub Actions `secrets`. Не переносите их в Angular bundle, логи, fixtures, screenshots или PR description.
- Frontend может содержать только Supabase publishable/anon configuration; она не заменяет RLS. `SUPABASE_SERVICE_ROLE_KEY` допустим только на серверной стороне.
- Сохраняйте JWT verification для защищённых functions и проверку пользовательской сессии. `gmail-oauth` — существующее исключение с `verify_jwt = false`, поэтому особенно важно сохранять подписанный OAuth state; не расширяйте список публичных functions без явного security review.
- Не логируйте тела писем, токены, credentials или полные персональные данные. Courier documents остаются private и открываются посредством signed URL.

## Обязательные проверки перед завершением

1. Просмотрите `git diff --check` и полный `git diff`; убедитесь, что изменены только ожидаемые исходники и нет secrets/build artifacts.
2. Для любого изменения `angular-app/` выполните из него:
   - `npm test -- --watch=false`;
   - `npm run build`.
3. Для изменений UI дополнительно вручную откройте затронутый flow; если окружение позволяет запуск браузера, сохраните screenshot для review.
4. Для Edge Function проверьте затронутые action/error paths и запустите доступную статическую проверку. Универсальная команда type-check для Deno в репозитории не определена — отсутствие проверки явно укажите в итоговом отчёте либо сначала согласуйте команду.
5. Для migration проверьте SQL, RLS, constraints, работу на существующих данных и соответствие TypeScript-моделям. Не применяйте миграцию к production только ради теста.
6. Для Wix/Fast Courier/Gmail используйте mocks или безопасные read-only проверки. Не допускайте реального списания, booking, отправки письма или изменения Wix без явного разрешения.
7. Зафиксируйте все результаты и ограничения окружения в итоговом сообщении. Не объявляйте проверку успешной, если соответствующая команда не выполнялась.
