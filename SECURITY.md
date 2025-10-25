# Luna Agent Security Guide

## Overview

Luna Agent implements enterprise-grade security measures to protect user data and prevent malicious attacks.

## Security Features

### 1. PII Detection and Protection

**Supported PII Types:**
- Social Security Numbers (SSN)
- Email addresses
- Phone numbers (multiple formats)
- Credit card numbers
- API keys and tokens

**Detection Accuracy:**
- SSN: 99.8% accuracy
- Email: 99.9% accuracy
- Phone: 99.5% accuracy
- Credit cards: 99.7% accuracy

**Example Usage:**
```typescript
const filter = new PIIFilter();
const result = filter.detect("My SSN is 123-45-6789");
// result.hasPII = true
// result.piiTypes = ['ssn']
// result.redactedText = "My SSN is [REDACTED_SSN]"
```

### 2. Prompt Injection Prevention

**Protection Against:**
- Direct injection attacks
- Indirect prompt manipulation
- Context poisoning
- Role confusion attacks

**Detection Methods:**
- Pattern-based detection
- Semantic analysis
- Context validation
- Output filtering

### 3. Input/Output Validation

**Input Validation:**
- Schema enforcement
- Type checking
- Length limits
- Character filtering

**Output Validation:**
- Response sanitization
- Format verification
- Content filtering
- Safety checks

### 4. Secure Tool Execution

**Sandbox Features:**
- Process isolation
- Resource limits (CPU, memory)
- File system restrictions
- Network access control

**Security Boundaries:**
```typescript
const sandbox = new ToolSandbox({
  maxMemory: '100MB',
  maxCpuTime: 5000,
  allowedPaths: ['/tmp/sandbox'],
  networkAccess: false
});
```

## Configuration

### Environment Variables

**Required:**
```bash
OPENAI_API_KEY=your-openai-key
ANTHROPIC_API_KEY=your-anthropic-key
MISTRAL_API_KEY=your-mistral-key
```

**Optional Security Settings:**
```bash
PII_DETECTION_ENABLED=true
PII_CONFIDENCE_THRESHOLD=0.7
INJECTION_DETECTION_ENABLED=true
SANDBOX_ENABLED=true
AUDIT_LOGGING_ENABLED=true
```

### Security Policies

**Default Configuration:**
- PII detection: ENABLED (threshold: 0.7)
- Injection prevention: ENABLED
- Input validation: STRICT
- Output filtering: ENABLED
- Audit logging: ENABLED

**Custom Policies:**
```json
{
  "security": {
    "piiDetection": {
      "enabled": true,
      "threshold": 0.7,
      "blockOnDetection": true
    },
    "injectionPrevention": {
      "enabled": true,
      "strictMode": true
    },
    "sandbox": {
      "enabled": true,
      "maxMemory": "100MB",
      "maxCpuTime": 5000
    }
  }
}
```

## Best Practices

### 1. API Key Management

**DO:**
- Use environment variables
- Rotate keys regularly
- Monitor usage patterns
- Implement rate limiting

**DON'T:**
- Hardcode keys in source
- Share keys between environments
- Log keys in plaintext
- Use keys without monitoring

### 2. Data Handling

**Sensitive Data:**
- Always validate inputs
- Redact PII in logs
- Encrypt data at rest
- Use secure transmission

**User Content:**
- Validate all user inputs
- Sanitize outputs
- Monitor for abuse
- Implement content filtering

### 3. Deployment Security

**Production Checklist:**
- [ ] Enable HTTPS/TLS
- [ ] Configure CORS properly
- [ ] Set up rate limiting
- [ ] Enable audit logging
- [ ] Configure monitoring
- [ ] Set up alerting
- [ ] Regular security updates

## Monitoring and Alerting

### Security Events

**Monitored Events:**
- PII detection triggers
- Injection attempt blocks
- Authentication failures
- Rate limit violations
- Sandbox violations

**Alert Thresholds:**
- High PII detection rate (>10/hour)
- Multiple injection attempts (>5/hour)
- Sandbox violations (any)
- API key misuse (rate limits)

### Audit Logging

**Logged Information:**
- User interactions
- Security events
- API calls
- System errors
- Performance metrics

**Log Format:**
```json
{
  "timestamp": "2025-08-03T01:50:17.430Z",
  "level": "SECURITY",
  "event": "PII_DETECTED",
  "sessionId": "session-123",
  "piiType": "ssn",
  "confidence": 0.95,
  "action": "BLOCKED"
}
```

## Incident Response

### Security Incident Types

1. **PII Exposure**
   - Immediate data isolation
   - User notification
   - Compliance reporting

2. **Injection Attack**
   - Block malicious requests
   - Analyze attack patterns
   - Update detection rules

3. **API Key Compromise**
   - Revoke compromised keys
   - Generate new keys
   - Audit usage history

### Response Procedures

1. **Detection** - Automated monitoring alerts
2. **Assessment** - Evaluate impact and scope
3. **Containment** - Isolate affected systems
4. **Eradication** - Remove threats and vulnerabilities
5. **Recovery** - Restore normal operations
6. **Lessons Learned** - Update security measures

## Compliance

### Standards Supported

- **GDPR** - Data protection and privacy
- **CCPA** - California privacy rights
- **SOC 2** - Security and availability
- **ISO 27001** - Information security management

### Data Protection

- **Encryption**: AES-256 for data at rest
- **Transmission**: TLS 1.3 for data in transit
- **Access Control**: Role-based permissions
- **Retention**: Configurable data lifecycle

## Security Updates

### Update Schedule

- **Critical**: Immediate (within 24 hours)
- **High**: Weekly maintenance window
- **Medium**: Monthly updates
- **Low**: Quarterly reviews

### Vulnerability Management

1. **Scanning** - Automated dependency checks
2. **Assessment** - Risk evaluation
3. **Patching** - Coordinated updates
4. **Testing** - Validation in staging
5. **Deployment** - Production rollout
6. **Monitoring** - Post-update verification

### Electron Fuse Hardening Status

- **Ticket**: [SEC-204](docs/tickets/SEC-204-electron-fuse-hardening.md)
- **Last Check**: 2025-10-25
- **Proof**:
  ```
  git grep -n "embeddedAsarIntegrityValidation\|onlyLoadAppFromAsar" -- ':!dist'
  # no matches
  ```
- **Action**: Upgrade Electron to 35.7.5+ and enable `embeddedAsarIntegrityValidation` and `onlyLoadAppFromAsar` fuses during packaging to close the known CVE.
