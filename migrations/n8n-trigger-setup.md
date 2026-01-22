# N8N Trigger Setup for Lead Assignment Notifications

This document describes how to set up an n8n workflow to send notifications when leads are assigned to reps.

## Supabase Database Trigger

The n8n workflow should be triggered by Supabase row-updated events on the `leads` table.

### Filter Conditions

The workflow should only process leads where:
- `assigned_rep_id IS NOT NULL` (lead has been assigned)
- `rep_alert_sent = false` (alert has not been sent yet)

### Workflow Steps

1. **Supabase Trigger**: Listen for row-updated events on `leads` table
   - Filter: `assigned_rep_id != null AND rep_alert_sent = false`

2. **Fetch Rep Profile**: Query `profiles` table to get rep details
   - Use `assigned_rep_id` to find the rep
   - Select: `user_id`, `full_name`, `email`, `phone`

3. **Send Notifications**: Send notifications via your preferred channel (WhatsApp, Email, etc.)
   - Include lead details: `lead_id`, `customer_name`, `organization`
   - Include rep details: `full_name`, `email`

4. **Update Lead**: Mark alert as sent
   - Update `leads` table:
     - Set `rep_alert_sent = true`
     - Set `rep_alert_sent_at = NOW()`
   - Use Supabase Admin API or service role key for this update

### Example n8n Workflow Structure

```
┌─────────────────┐
│ Supabase Trigger│ (leads table, row-updated)
│ Filter:         │ assigned_rep_id != null AND rep_alert_sent = false
└────────┬────────┘
         │
┌────────▼────────┐
│ Fetch Rep       │ (Query profiles by assigned_rep_id)
└────────┬────────┘
         │
┌────────▼────────┐
│ Send WhatsApp   │ (or Email, etc.)
└────────┬────────┘
         │
┌────────▼────────┐
│ Update Lead     │ (Set rep_alert_sent = true, rep_alert_sent_at = now())
└─────────────────┘
```

### Supabase Webhook Configuration

In Supabase Dashboard:
1. Go to Database → Webhooks
2. Create new webhook for `leads` table
3. Event: `UPDATE`
4. Filter: `assigned_rep_id IS NOT NULL AND rep_alert_sent = false`
5. URL: Your n8n webhook URL

### Important Notes

- The workflow must update `rep_alert_sent` and `rep_alert_sent_at` to prevent duplicate notifications
- Use Supabase Admin API (service role key) for the final update step
- Handle errors gracefully - if notification fails, you may want to retry or log the error
- Consider rate limiting if you expect high volume of assignments
