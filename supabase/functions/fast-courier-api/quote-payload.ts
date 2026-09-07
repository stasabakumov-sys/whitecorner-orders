// Fast Courier contents is a fixed category, not the Hub package name.
// Enforce the business rule at the API boundary, including older Hub clients.
export function withGeneralContents<T extends { items: Record<string, unknown>[] }>(payload: T): T {
  return {
    ...payload,
    items: payload.items.map(item => ({ ...item, contents: 'General/Others' })),
  };
}
