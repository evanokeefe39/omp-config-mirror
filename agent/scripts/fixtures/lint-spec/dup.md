# Spec: Example feature

## Intent

Users want X; the system provides it. Approved 2026-10-03.

## Behavioral Contracts

- GIVEN a registered user, WHEN they request X, THEN the system returns X within 2 seconds.
- WHEN the request arrives without credentials, THE SYSTEM SHALL return an error.
- GIVEN a registered user, WHEN they request X, THEN the system returns X within 2 seconds.

## Edge Case Inventory

- Contract 1 fails when the service is down: the user sees a retry message.
- Contract 2 fails when credentials are expired: the user is prompted to re-authenticate.

## Negative Space

- The system must not store X beyond the retention window.
- Out of scope: bulk import.

## Open Questions

none
