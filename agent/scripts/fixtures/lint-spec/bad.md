# Spec: Example feature

## Intent

Users want X; the system provides it. Retention window is [NEEDS CLARIFICATION] 30 days.

## Behavioral Contracts

- The system returns X to the user, stored in Postgres for later replay.
- WHEN the request arrives without credentials, THE SYSTEM SHALL return an error.

## Edge Case Inventory

- Contract 1 fails when the service is down: the user sees a retry message.

## Negative Space

- The system must not store X beyond the retention window.

## Open Questions

none
