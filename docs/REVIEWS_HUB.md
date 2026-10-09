# Reviews in Hub and the customer site

Fera remains the source of imported review text, rating, date, customer display rules and attachments. Hub owns publication, the explicit product link and the first photo shown on a review card. Imports must preserve these Hub fields. Missing records or media in a partial import do not delete or unpublish saved data.

The manager-only Reviews menu has Overview, Product reviews, Store reviews, Photos & videos, Products and Messages. The first five use saved Hub data. Messages currently identifies the missing request-message import; it must not display invented requests or send Fera messages. The Overview uses saved review dates and ratings, not Fera's response-rate metric.

The cover is `wc_fera_review_media.is_cover`. A manager selects one available photo per review through `wc_set_fera_review_cover`; the database permits at most one cover and rejects video or unavailable files. The public API returns that photo first, followed by the remaining attachments. It returns only published reviews and media confirmed in private Storage.

For future catalogue cards, use `productId` from the public reviews contract to join the visible product's Hub ID in `wc_storefront_catalog`. `wixProductId` is retained as an external reference. Store reviews have no product link. Do not join by product name. The catalogue card can fetch or filter published reviews by this ID, show count and average rating, and open the same full-review view as the reviews page. The operational reviews tables, customer contact details and private media bucket must not be exposed to the storefront.

Fera reply text and review-request messages are not in the current public API or Hub request model. Import and review their privacy/publication rules before showing replies or implementing request automation. Publishing the new cover contract requires the migration before deploying `hub-reviews-public`.
