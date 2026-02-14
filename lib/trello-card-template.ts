export const TRELLO_CARD_DESCRIPTION_TEMPLATE = `INVOICE NUMBER:
[INVOICE_NUMBER]

📝 PLEASE COMPLETE THIS ORDER
Instructions:
Fill in the Invoice Number and Order ID.
Update the Product Name and (Variant) on the first line of each block. Use (STD) for standard items.
For each product, list the quantities and sizes needed (e.g., 4, M).

👕 ORDER DETAILS
Payment Status: [PAYMENT_STATUS]
Order ID: [JOB_ID]
Order Quantity: [ORDER_QUANTITY]
Order Deadline: [ORDER_DEADLINE]

---PRODUCT LIST---
[PRODUCT_LIST]
---END LIST---

📞 CONTACT
Name: [CUSTOMER_NAME]
Phone: [PHONE]
Email: [EMAIL]
Organization: [ORGANIZATION]
Location: [LOCATION]

🎨 DESIGN NOTES
[DESIGN_NOTES]

<!-- MACHINE DATA - DO NOT EDIT -->
<!--
LEAD_ID: [LEAD_ID]
JOB_ID: [JOB_ID]
INVOICE: [INVOICE_MACHINE]
PAYMENT_STATUS: [PAYMENT_STATUS]
ORDER_QUANTITY: [ORDER_QUANTITY_MACHINE]
ORDER_DEADLINE: [ORDER_DEADLINE_MACHINE]
-->`;

export function renderTrelloCardDescription(vars: Record<string, string>): string {
  return Object.entries(vars).reduce((acc, [key, value]) => {
    return acc.split(`[${key}]`).join(value);
  }, TRELLO_CARD_DESCRIPTION_TEMPLATE);
}

