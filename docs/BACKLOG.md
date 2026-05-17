# Backlog

Ad-hoc tasks pending pickup. Distinct from `ROADMAP.md` (milestone plan) and `CHANGELOG.md` (shipped). When a task here is picked up, move it into the relevant milestone in ROADMAP and delete it from this file.

---

## Move `subscription_plan` to Kinde Properties (M3 follow-up)

The Account UX revamp established the pattern (`KindeBackendClient.fetchUserProperties` /
`updateUserProperties` + `language` as the first Property). The next natural candidate is
`users.subscription_plan` and the `subscription_current_period_*` timestamps — moving them out
of local SQL into Kinde Properties would let Stripe webhooks update Kinde directly and remove
the need for `V5__subscription.sql`'s columns to be the source of truth.

- [ ] Create Properties in Kinde Dashboard → Settings → Properties: `subscription_plan` (text),
      `subscription_period_start` (text, ISO 8601), `subscription_period_end` (text, ISO 8601).
- [ ] Refactor `SubscriptionService` to read these from `KindeBackendClient.fetchUserProperties`
      instead of `user.getSubscriptionPlan()`. Add a per-user TTL cache (~30s) since this is
      checked on every `POST /api/reports`.
- [ ] Wire `KindeBackendClient.updateUserProperties` into the Stripe webhook handler when the
      `customer.subscription.*` events land (`feature/stripe`).
- [ ] Flyway `V14`: drop `subscription_plan` + `subscription_current_period_*` columns from
      `users`.

Notes:
- The per-request latency of a single extra Kinde call is unacceptable on the AI rate-limit path;
  the TTL cache is non-negotiable for this one.
- Triggered by M3 progress — don't pick up until Stripe webhook receiver is in flight, otherwise
  there's no producer for the value.
