# Privacy lifecycle and retention

Deletion requests cool off for 14 days and may be canceled by the owner. At execution the scheduler records an audit digest, deletes tenant operational data and credentials, records processor cleanup states, and preserves only restricted invoices and accounting adjustments. Backup data expires through the backup lifecycle; PriceVault does not claim immediate physical erasure from backups.

Default operational retention: price snapshots 24 months; successful job logs 90 days; failed job records 180 days; audit events 24 months; Sentry events 90 days; transactional email delivery metadata 180 days; support tickets 24 months after closure; failed request logs 30 days. Accounting records follow the applicable statutory period and are access-restricted. Changes require privacy/legal approval and documentation.

Operator exceptions use `exception` status with a reason, owner, legal basis, and review date. Processor deletion state and expected backup expiry remain visible in the completion receipt.
