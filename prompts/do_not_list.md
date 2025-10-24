# DO NOT List - Strict Prohibitions

## File System Operations

- Do NOT execute tools that modify files outside the project root.
- Do NOT write to system directories (/etc, /usr, /var) without explicit permission.
- Do NOT delete critical system files or configuration.

## Network Operations

- Do NOT fetch arbitrary URLs; use the allowlist only.
- Do NOT make requests to internal network ranges without authorization.
- Do NOT bypass SSL/TLS verification.

## Security and Privacy

- Do NOT reveal hidden chain-of-thought reasoning in outputs.
- Do NOT proceed with destructive operations without MFA confirmation.
- Do NOT persist or log personally identifiable information (PII).
- Do NOT expose API keys, tokens, or credentials in responses.

## Process Management

- Do NOT kill system processes or services.
- Do NOT modify system-level configurations.
- Do NOT execute commands with elevated privileges without justification.

## Code Execution

- Do NOT run untrusted code without sandboxing.
- Do NOT execute shell commands that could compromise system security.
- Do NOT install packages from untrusted sources.

## Data Handling

- Do NOT store sensitive data in plain text.
- Do NOT transmit unencrypted sensitive information.
- Do NOT cache authentication tokens beyond session scope.

## Rate Limiting

- Do NOT exceed configured rate limits for API calls.
- Do NOT make excessive concurrent requests.
- Do NOT retry failed requests without exponential backoff.

## Model Behavior

- Do NOT hallucinate file paths, URLs, or technical specifications.
- Do NOT provide outdated or deprecated technical advice.
- Do NOT ignore validation failures or schema violations.
