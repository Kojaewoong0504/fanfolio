# Platform Hardening 2-12 Implementation Plan

## Goal

Complete the non-device portion of the platform-hardening checklist (items 2-12) by reusing the existing fan app, admin app, studio, and backend contracts; implement only confirmed gaps and verify the resulting end-to-end behavior locally.

## Scope

1. Map existing coverage for push, safety/CS, operations, product scheduling, studio workflow, analytics, and release verification.
2. Add authenticated personal-data export and account-deletion controls with audit-preserving anonymization and session revocation.
3. Verify existing studio autosave/version/review behavior and document collaboration/calendar gaps without inventing disconnected flows.
4. Run non-device backend, frontend, admin, and studio regression suites plus local browser smoke checks where the running apps support them.
5. Report device testing as intentionally excluded and separate verified behavior from infrastructure-dependent gaps.

## Design decisions

- Export returns a safe JSON representation and never includes passwords, refresh tokens, or payment secrets.
- Account deletion is reversible only through an operator-led recovery process; user-owned ledgers and audit history remain intact while identity/session data is anonymized and access is revoked.
- Existing contracts are preferred over parallel pages or duplicate models.
- Destructive account deletion is covered by isolated backend tests, not exercised against the live local QA account.

## Verification gate

- Backend targeted tests, then full backend suite.
- Admin, builder, and frontend test suites.
- Type/build checks and `git diff --check`.
- Local browser smoke evidence for the already-connected card lifecycle; no real-device testing.

## Follow-up execution batch

- [x] Add the calendar controls to the existing card operations workspace rather than creating a parallel page.
- [x] Add card-scoped studio collaboration comments with author, status, mentions, and review linkage; expose the threads in the existing admin card review panel.
- [x] Add deterministic checks for push configuration, backup/restore prerequisites, CS evidence coverage, and release rehearsal readiness through the existing contract/unit suites and audit matrix.
- [x] Run the complete non-device regression suite and update the audit matrix.

## 1-12 continuous execution checklist

- [x] 1. Card-scoped studio collaboration comments, mentions, and resolution states.
- [x] 2. Admin review surface for collaboration threads and review linkage.
- [x] 3. Calendar-to-release status linkage and conflict visibility.
- [x] 4. Push configuration and delivery failure readiness checks.
- [ ] 5. PostgreSQL, Redis, SMTP, and object-storage configuration validation (requires real environment credentials).
- [ ] 6. Backup and restore rehearsal commands with non-destructive verification (requires a real backup target).
- [x] 7. CS evidence, trade hold, refund, and user-notification release checks.
- [x] 8. Analytics funnel and cohort data contract verification.
- [x] 9. Empty/error/permission state browser QA across all three web apps.
- [x] 10. Responsive regression at 360, 390, 430, tablet, and desktop widths.
- [x] 11. Full non-device end-to-end release rehearsal.
- [x] 12. Final audit matrix, release gate, and operations handoff report.
