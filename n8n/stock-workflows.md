# Stock workflows (n8n)

## Secure endpoints (read-only)

All endpoints require the header:

- `x-n8n-secret: <N8N_WEBHOOK_SECRET>`

Endpoints:

- `GET /api/n8n/stock/low-stock`
  - Returns only items where `qty_on_hand <= minimum_level`
- `GET /api/n8n/stock/inventory-report?format=json|csv`
  - Returns full inventory + summary (or CSV download)

## Low-stock notification workflow

Suggested nodes:

1. **Cron** (e.g. every morning)
2. **HTTP Request** → `GET /api/n8n/stock/low-stock`
   - Add header `x-n8n-secret`
3. **IF** → `count > 0`
4. **Format message** (Function node)
5. **WhatsApp / Email send** (your existing provider nodes)

## Periodic inventory report workflow

Suggested nodes:

1. **Cron** (weekly/monthly)
2. **HTTP Request** → `GET /api/n8n/stock/inventory-report?format=csv`
3. **Email** node with CSV attached

## Notes

- These endpoints do not modify inventory and do not require any Supabase keys inside n8n.
- Inventory changes should only happen via in-app admin actions or the `deduct_stock_for_job` RPC.

