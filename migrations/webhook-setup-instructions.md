# Supabase Webhook Setup for Lead Assignment Notifications

## Overview

This document explains how to set up the Supabase Database Webhook that will trigger your n8n workflow when a lead is assigned to a rep.

## Complete Flow

1. **New Lead INSERT** → Database trigger `auto_assign_new_lead` fires
2. **Trigger assigns rep** → Sets `assigned_rep_id`, `assigned_at`, etc.
3. **Lead INSERT completes** → With `assigned_rep_id` already set
4. **Supabase Webhook fires** → On INSERT event (lead has `assigned_rep_id` and `rep_alert_sent = false`)
5. **n8n receives webhook** → Processes notification
6. **n8n sends alert to rep** → Via WhatsApp/Email/etc.
7. **n8n updates flag** → Sets `rep_alert_sent = true` and `rep_alert_sent_at = NOW()`

## Step-by-Step: Create Supabase Database Webhook

### 1. Navigate to Webhooks
- Open Supabase Dashboard
- Go to **Database** → **Webhooks**
- Click **"Create a new webhook"**

### 2. Configure Webhook

**Basic Settings:**
- **Name**: `lead-assigned-to-rep`
- **Table**: `leads`
- **Events**: Check **"INSERT"** only (or both INSERT and UPDATE if you want to catch manual assignments too)

**HTTP Request:**
- **Method**: `POST`
- **URL**: `https://dockerfile-1n82.onrender.com/webhook/supabase/lead-assigned`
- **Headers**: 
  - Key: `Content-Type`
  - Value: `application/json`

**Filter SQL:**
```sql
assigned_rep_id IS NOT NULL AND rep_alert_sent = false
```

**Payload:**
- Select **"Send entire record"** or **"Send entire record (JSON)"**

### 3. Save Webhook
Click **"Save"** to create the webhook.

## Expected Webhook Payload

When a new lead is inserted and auto-assigned, Supabase will POST:

```json
{
  "type": "INSERT",
  "table": "leads",
  "record": {
    "id": "uuid-here",
    "lead_id": "MI7883XIC80EKQ",
    "customer_name": "John Doe",
    "email": "john@example.com",
    "assigned_rep_id": "rep-uuid-here",
    "assigned_at": "2026-01-22T10:00:00Z",
    "rep_alert_sent": false,
    "rep_alert_sent_at": null,
    "status": "New",
    ...
  }
}
```

## n8n Workflow Setup

Your n8n workflow should:

1. **Receive Webhook** (Supabase POST)
   - Path: `/webhook/supabase/lead-assigned`
   - Method: POST

2. **Extract Lead Data**
   - `record.assigned_rep_id` - The rep UUID
   - `record.lead_id` - The lead identifier
   - `record.customer_name` - Customer name
   - `record.email` - Customer email

3. **Fetch Rep Details**
   - Query Supabase `profiles` table by `user_id = assigned_rep_id`
   - Get rep's `email`, `phone`, `full_name`

4. **Send Notification**
   - Send WhatsApp/Email to rep
   - Include lead details

5. **Update Lead Flag**
   - Update `leads` table:
     - Set `rep_alert_sent = true`
     - Set `rep_alert_sent_at = NOW()`
   - Use Supabase Admin API (service role key)

## Testing

### Test 1: Insert New Lead
```sql
-- Insert a test lead (trigger will auto-assign)
INSERT INTO leads (lead_id, customer_name, email, status)
VALUES ('TEST-AUTO-001', 'Test Customer', 'test@example.com', 'New')
RETURNING id, lead_id, assigned_rep_id, assigned_at, rep_alert_sent;
```

**Expected Result:**
- `assigned_rep_id` should be set (not NULL)
- `assigned_at` should be set
- `rep_alert_sent` should be `false`
- Webhook should fire to n8n

### Test 2: Check Webhook Logs
- Go to Supabase Dashboard → Database → Webhooks
- Click on your webhook
- Check **"Logs"** tab
- Look for POST requests with status 200/201/202

### Test 3: Verify n8n Received
- Check n8n workflow executions
- Verify webhook was received
- Check payload structure

### Test 4: Verify Flag Update
After n8n processes:
```sql
SELECT id, lead_id, assigned_rep_id, rep_alert_sent, rep_alert_sent_at
FROM leads
WHERE lead_id = 'TEST-AUTO-001';
```

**Expected Result:**
- `rep_alert_sent = true`
- `rep_alert_sent_at` is set

## Important Notes

### Why INSERT (not UPDATE) works:
- The trigger runs **BEFORE INSERT**
- When the lead is inserted, `assigned_rep_id` is already set
- So the INSERT event includes the assigned rep
- The webhook filter `assigned_rep_id IS NOT NULL AND rep_alert_sent = false` will match

### If you also want to catch manual assignments:
- Add **UPDATE** event to the webhook
- Filter: `assigned_rep_id IS NOT NULL AND rep_alert_sent = false`
- This catches both auto-assigned (INSERT) and manually assigned (UPDATE) leads

### Duplicate Prevention:
- The `rep_alert_sent = false` filter prevents duplicates
- n8n must set `rep_alert_sent = true` after processing
- If n8n fails, the webhook will fire again on next page refresh (if using UPDATE event)

## Troubleshooting

**Webhook doesn't fire:**
- Check webhook is enabled
- Verify filter SQL syntax
- Check webhook logs for errors
- Ensure trigger actually assigned a rep (check `assigned_rep_id` is not NULL)

**n8n doesn't receive:**
- Check Render logs for incoming requests
- Verify n8n webhook URL is correct
- Check n8n workflow is active
- Test webhook manually with Postman/curl

**Duplicates:**
- Ensure n8n sets `rep_alert_sent = true` after processing
- Check n8n workflow has proper error handling
- Verify idempotency logic
