# Customers and Wix Contacts

Wix Contacts includes purchasers, form submissions, newsletter subscribers, site members, and manually created/imported contacts. A contact does not necessarily have an order or consent to marketing. Site membership and email/SMS subscription are separate properties.

Sources checked 9 September 2026:
- https://support.wix.com/en/article/about-your-contact-list
- https://support.wix.com/en/article/site-members-understanding-the-differences-between-contacts-members-and-subscribers
- https://dev.wix.com/docs/api-reference/crm/members-contacts/contacts/contacts/contact-v4/query-contacts

## Current implementation

`Customers` reads Contacts v4 through the authenticated `queryContacts` action in `wix-orders-sync`. The existing server-side Wix API key needs **Read Contacts**. No keys are exposed to the frontend. JWT verification and an explicit user-session check protect the action.

The server queries 500 records at a time without a contact filter. The frontend follows offsets, deduplicates by Wix contact ID, and only replaces the displayed list when all pages have completed and the total matches. An interrupted or inconsistent load retains the previous complete list and shows an error. Data is held in memory, not persisted to a new database table. Refresh retrieves the current Wix list again.

Name, primary email/phone, subscription status, membership status, last activity, and creation date are shown only when supplied by Wix. Missing values are not inferred from orders. Labels currently display Wix label keys; resolving display names via Labels API is not connected. No order-history import, contact editing, merging, deletion, subscription changes, marketing, or automatic messages are performed. Import/export and Manage View remain disabled.

## Pending live verification

The owner will grant Read Contacts later. Until then, live completeness, actual field coverage and the account's contact count are unverified. The screenshot count is not used as a data source. Once permission is granted and this release is deployed, open Customers and use Refresh Wix to verify completion and contact field coverage.

Checks: Angular pagination tests include 1,506 synthetic contacts and failure preservation. Server tests verify the query endpoint, unrestricted paging, permission errors and truncated results. A TypeScript static check covers contacts.ts; no full Deno check of the existing function was performed.
