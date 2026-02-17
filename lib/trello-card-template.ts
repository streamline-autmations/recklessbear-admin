export const TRELLO_CARD_DESCRIPTION_TEMPLATE = `👕 ORDER
ID: [JOB_ID]
Deadline: [ORDER_DEADLINE]
Payment: [PAYMENT_STATUS]

👕 PRODUCTS
[PRODUCT_LIST]

📞 CONTACT
[CUSTOMER_NAME]
[ORGANIZATION]
[PHONE]
[EMAIL]

📝 NOTES
[DESIGN_NOTES]

<!--
LEAD_ID: [LEAD_ID]
JOB_ID: [JOB_ID]
-->`;

export function renderTrelloCardDescription(vars: Record<string, string>): string {
  return Object.entries(vars).reduce((acc, [key, value]) => {
    return acc.split(`[${key}]`).join(value);
  }, TRELLO_CARD_DESCRIPTION_TEMPLATE);
}
