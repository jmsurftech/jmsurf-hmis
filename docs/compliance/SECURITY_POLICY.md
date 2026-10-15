# Security, privacy and confidentiality policy (draft)
- **Access control:** least privilege, role-based access, unique user accounts, automatic session expiry (12h JWT), MFA for administrators (roadmap: TOTP).
- **Encryption:** TLS for all traffic (Coolify/Let's Encrypt); database volume encryption at rest on the host; secrets held in Coolify environment variables, never in git.
- **Logging:** hash-chained audit trail for logins, sensitive record reads and every change; logs kept 2 years.
- **Vulnerability management:** dependency scanning in CI, monthly patching, an annual penetration test.
- **Incident response:** detect → contain → assess → notify the ODPC within 72h → remediate → review.
- **Staff:** confidentiality agreements and annual privacy training.
