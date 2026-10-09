export function publicReviewAuthor(sourceData, managerName) {
  const customer = sourceData?.customer;
  if (!customer || typeof customer !== 'object') return managerName?.trim() || 'Customer';
  if (customer.is_anonymous === true || customer.is_name_visible === false) return 'Anonymous';
  const approvedName = typeof managerName === 'string' ? managerName.trim() : '';
  if (approvedName) return approvedName.slice(0, 100);
  if (customer.is_name_visible === true && typeof customer.display_name === 'string') {
    const name = customer.display_name.trim();
    if (name) return name.slice(0, 100);
  }
  return 'Customer';
}
