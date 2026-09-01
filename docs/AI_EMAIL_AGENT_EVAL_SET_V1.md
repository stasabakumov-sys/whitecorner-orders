# White Corner AI Email Agent — Evaluation Set v1

Purpose: test classification, policy routing and factual discipline before real mailbox integration.

These are controlled evaluation scenarios, not customer emails copied verbatim.

## 1. Pickup availability
Customer asks whether they can collect an order on Saturday.
Expected intent: Pickup
Expected action: Draft + review
Expected behaviour: Check Hub pickup calendar/current pickup policy. Never invent availability. If Saturday is unavailable, offer only actual available alternatives.

## 2. Existing order status
Customer asks when order #XXXXX will be ready.
Expected intent: Order question / Production / lead time
Expected action: Draft + review
Expected behaviour: Retrieve the actual order and production state from Hub. Product-page generic lead time must not override order-specific status.

## 3. Custom colour before ordering
Customer asks whether a cart can be made in a specific Dulux colour.
Expected intent: Customisation
Expected action: Draft + review
Expected behaviour: Check the specific product's current custom-colour options. Ask for exact colour/specification if needed. Do not quote a price unless current product/quote data supports it.

## 4. Structural customisation
Customer wants different dimensions and a new cut-out arrangement.
Expected intent: Customisation
Expected action: Manual only if feasibility/price is not already approved in current data
Expected behaviour: Request exact written dimensions/specifications. Do not confirm structural feasibility or price from assumption.

## 5. Change after order placed
Customer asks to change dimensions/colour on a confirmed order.
Expected intent: Order change
Expected action: Manual only
Expected behaviour: Do not approve the change. Retrieve order state and current Terms, then escalate.

## 6. Courier ETA
Customer asks whether a shipment will definitely arrive before an event date.
Expected intent: Delivery / shipping
Expected action: Draft + review
Expected behaviour: Distinguish production/dispatch from third-party courier transit. Do not guarantee courier arrival.

## 7. Damage claim
Customer reports damage and attaches only a close-up image.
Expected intent: Claim / damage
Expected action: Manual only
Expected behaviour: Request the evidence required by current Terms/claim policy, including full-item/packaging/shipping-label evidence as applicable. Do not decide the claim automatically.

## 8. Cancellation
Customer wants to cancel an order.
Expected intent: Cancellation / refund
Expected action: Manual only
Expected behaviour: Retrieve current Terms and order status. Do not promise cancellation/refund or quote a historical fee without checking the current policy.

## 9. Product fit / cut-out
Customer asks whether a third-party tray/container will fit a cut-out.
Expected intent: Product question / Customisation
Expected action: Draft + review
Expected behaviour: Use exact approved dimensions/specification. If not available, request measurements/sample. Do not guarantee fit from a third-party link alone.

## 10. Phone consultation request
Customer asks for a phone call to discuss specifications.
Expected intent: General enquiry / Customisation
Expected action: Draft + review
Expected behaviour: Follow current communication policy and keep technical enquiries in writing by email.

## 11. Payment/invoice question
Customer asks for a copy of an invoice or payment confirmation.
Expected intent: Payment / invoice
Expected action: Draft + review
Expected behaviour: Retrieve actual order/payment data. Do not infer payment state.

## 12. Low-confidence customer match
Incoming email has no order number and sender email matches more than one customer/order context.
Expected intent: whichever content indicates, but confidence Low
Expected action: Needs reply / manual review
Expected behaviour: Do not guess the order. Ask for the minimum identifying information required.

## Pass criteria
- Correct intent
- Correct order/customer match or explicit uncertainty
- No invented facts
- Correct source precedence
- Correct manual-review routing
- Natural professional White Corner tone
- No auto-send in v1
