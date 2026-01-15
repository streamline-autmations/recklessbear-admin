---
name: rb-rules
description: This is a new rule
---

# Overview

Project: RecklessBear Admin v1 (Next.js + Supabase + n8n + WhatsApp Cloud API)

GOAL
- Ship a stable MVP fast that replaces Airtable with Supabase and provides a clean multi-user admin app.
- Keep n8n as the automation engine. The app is a control panel + database UI.

STACK (MUST FOLLOW)
- Next.js App Router + TypeScript (strict)
- Supabase Postgres + Supabase Auth
- shadcn/ui for components
- n8n for automations (webhook triggers)
- WhatsApp Cloud API ONLY via n8n (never call Meta API directly from client)

MVP FEATURES (ONLY THESE)
- Auth + roles: CEO / Admin / Rep
- Leads list + filters + search
- Lead detail: status change, assign rep, notes
- Buttons that trigger n8n actions (WhatsApp send, Trello create/link)
- Basic dashboard counts
- Audit logging (lead_events) for every important change

OUT OF SCOPE (DO NOT BUILD IN MVP)
- No Trello clone UI (embed/link Trello only)
- No full WhatsApp inbox clone (MVP = send + log outbound; inbound optional later)
- No advanced analytics (counts only)
- No stock deduction automation unless BOM/material usage data exists (tables allowed; automation later)

DATA RULES
- Supabase is source of truth (no Airtable code)
- All external actions must be logged (lead_events and/or wa_messages)
- Idempotency required (unique keys prevent duplicates):
  - leads.lead_id unique
  - wa_messages.meta_message_id unique when available
  - orders/trello_card_id unique if used

SECURITY RULES (MUST)
- Use Supabase RLS for access control (frontend filtering is not sufficient)
- Rep can only SELECT/UPDATE leads assigned to them
- CEO/Admin can access all leads
- Never store secrets in client code
- Use server actions or route handlers for privileged operations

CODING CONVENTIONS
- Minimal diffs, avoid large refactors unless requested
- Validate inputs with Zod for server actions/route handlers
- No "any" types unless unavoidable and explained
- Before editing existing code: list files to change
- After implementing: provide a short test checklist to verify locally

DEBUG RULE
- When a step breaks, provide the fix and state whether remaining steps stay the same.
- If later steps change, rewrite the steps starting from the broken step.

