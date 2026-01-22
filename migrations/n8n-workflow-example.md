# n8n Workflow Example for Lead Assignment Notifications

## Workflow Structure

```
┌─────────────────┐
│ Webhook Trigger │ (Receives all INSERT/UPDATE events)
│ Path: /webhook/ │
│ supabase/lead-  │
│ assigned        │
└────────┬────────┘
         │
┌────────▼────────┐
│ IF Node         │ (Filter: only process if assigned_rep_id exists and rep_alert_sent = false)
│ Condition:      │
│ - record.       │
│   assigned_     │
│   rep_id exists │
│ - record.rep_   │
│   alert_sent    │
│   = false       │
└────────┬────────┘
         │ (only if true)
┌────────▼────────┐
│ Extract Data    │ (Get lead_id, customer_name, assigned_rep_id, etc.)
└────────┬────────┘
         │
┌────────▼────────┐
│ Supabase Query  │ (Get rep details from profiles table)
│ SELECT * FROM   │
│ profiles WHERE  │
│ user_id =       │
│ assigned_rep_id │
└────────┬────────┘
         │
┌────────▼────────┐
│ Send WhatsApp   │ (or Email, etc.)
│ To: rep.phone   │
│ Message: Lead   │
│ assigned...     │
└────────┬────────┘
         │
┌────────▼────────┐
│ Supabase Update │ (Set rep_alert_sent = true)
│ UPDATE leads    │
│ SET rep_alert_  │
│ sent = true,    │
│ rep_alert_sent_ │
│ at = NOW()      │
│ WHERE id =      │
│ record.id       │
└─────────────────┘
```

## n8n Node Configuration

### 1. Webhook Trigger Node
- **Name**: `Supabase Lead Webhook`
- **HTTP Method**: POST
- **Path**: `webhook/supabase/lead-assigned`
- **Response Mode**: Respond to Webhook
- **Response Data**: Last Node Output

### 2. IF Node (Filter)
- **Name**: `Filter: Only Assigned Leads`
- **Condition**: 
  ```javascript
  // Check if lead is assigned and alert not sent
  {{ $json.body.record.assigned_rep_id }} !== null && 
  {{ $json.body.record.assigned_rep_id }} !== '' &&
  ({{ $json.body.record.rep_alert_sent }} === false || {{ $json.body.record.rep_alert_sent }} === null)
  ```
  
  Or use n8n's IF conditions:
  - **Condition 1**: `record.assigned_rep_id` is not empty
  - **Condition 2**: `record.rep_alert_sent` equals `false` OR is empty/null
  - **Combine with**: AND

### 3. Set Node (Extract Data)
- **Name**: `Extract Lead Data`
- **Set Fields**:
  - `leadId`: `{{ $json.body.record.lead_id }}`
  - `leadUuid`: `{{ $json.body.record.id }}`
  - `customerName`: `{{ $json.body.record.customer_name }}`
  - `customerEmail`: `{{ $json.body.record.email }}`
  - `assignedRepId`: `{{ $json.body.record.assigned_rep_id }}`

### 4. Supabase Node (Get Rep)
- **Name**: `Get Rep Details`
- **Operation**: Get Row
- **Table**: `profiles`
- **Filter**: `user_id` equals `{{ $json.assignedRepId }}`
- **Select Fields**: `full_name`, `email`, `phone`

### 5. WhatsApp/Email Node
- **Name**: `Send Alert to Rep`
- **To**: `{{ $json.phone }}` or `{{ $json.email }}`
- **Message**: 
  ```
  New lead assigned to you!
  
  Lead ID: {{ $('Extract Lead Data').item.json.leadId }}
  Customer: {{ $('Extract Lead Data').item.json.customerName }}
  Email: {{ $('Extract Lead Data').item.json.customerEmail }}
  
  View in admin: [link]
  ```

### 6. Supabase Node (Update Flag)
- **Name**: `Mark Alert as Sent`
- **Operation**: Update Row
- **Table**: `leads`
- **Filter**: `id` equals `{{ $('Extract Lead Data').item.json.leadUuid }}`
- **Update Fields**:
  - `rep_alert_sent`: `true`
  - `rep_alert_sent_at`: `{{ $now }}`

## Error Handling

Add an **Error Trigger** node to catch failures:
- If notification fails, log error but don't retry immediately
- If flag update fails, log error (may cause duplicate notifications)

## Testing

1. **Test with INSERT event**: Insert a new lead, verify webhook fires
2. **Test with UPDATE event**: Manually assign a lead, verify webhook fires
3. **Test filter**: Insert a lead that's already assigned (`rep_alert_sent = true`), verify n8n doesn't process it
4. **Test duplicate prevention**: Send same webhook twice, verify only one notification sent

## Important Notes

- The IF node filter is critical - without it, you'll process ALL lead changes
- Always update `rep_alert_sent = true` after sending notification
- Use the lead `id` (UUID) for updates, not `lead_id` (text field)
- Test with both INSERT and UPDATE events to ensure both work
