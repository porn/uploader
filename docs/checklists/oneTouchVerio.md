# LifeScan OneTouch Verio & Verio Flex

## Checklist for Blood Glucose Meter Implementation

(Key:

 - `[x]` available in data protocol/documented in spec and implemented
 - `[-]` available in data protocol/documented in spec but *not* yet implemented
 - `[?]` unknown whether available in data protocol/documented in spec; *not* yet implemented
 - `*[ ]` TODO: needs implementation!
 - `[ ]` unavailable in data protocol and/or not documented in spec and not yet implemented)

### Required if Present

- `[x]` smbg values
- `[-]` units of smbg values (read from device, not hard-coded)
- `[x]` out-of-range values (LO or HI)
- `[ ]` out-of-range value thresholds (e.g., often 20 for low and 600 for high on BGMs)
- `[ ]` date & time settings changes
- `[ ]` blood ketone values
- `[ ]` units of blood ketone values (read from device, not hard-coded)
- `[ ]` ketone out-of-range values
- `[ ]` ketone out-of-range value thresholds
- `[x]` use `common.checkDeviceTime(currentDeviceTime, timezone, cb)` to check against server time

## Notes
- Display units of smbg values are available in data protocol, but always reported in mg/dL
- HI/LO values are not described in spec, but user manual states that values above 600 and below 20 mg/dL are out-of-range, and are annotated as such

### No Tidepool Data Model Yet

- `[-]` control (solution) tests (whether marked in UI or auto-detected) - until we have a data model, these should be discarded
- `[-]` device settings, other than date & time (e.g., target blood glucose range)
- `[-]` tag/note (e.g., pre- vs. post-meal)

### Tidepool ingestion API

Choose one of the following:

  - `[x]` legacy "jellyfish" ingestion API
  - `[ ]` platform ingestion API

### Known implementation issues/TODOs

*Use this space to describe device-specific known issues or implementation TODOs **not** contained in the above datatype-specific sections.*
