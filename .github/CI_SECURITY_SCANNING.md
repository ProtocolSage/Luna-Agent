# CI Security Scanning for Build Artifacts

## Overview

Luna Agent implements comprehensive security scanning of build artifacts in the CI/CD pipeline to detect vulnerabilities before deployment. This ensures that only secure, vetted code reaches production environments.

## Security Scanning Jobs

### 1. Build Artifact Scanning (`ci.yml`)

The main CI workflow includes a dedicated `security-scan` job that runs after the build completes:

**Workflow:** `.github/workflows/ci.yml`
**Job:** `security-scan`

#### What Gets Scanned

- **Build Artifacts**: All compiled code in the `dist/` directory
- **Dependencies**: Production npm packages bundled with the application
- **Static Files**: Bundled JavaScript, TypeScript declarations, and assets

#### Scanning Tools

##### Trivy Vulnerability Scanner
- **Scan Type**: Filesystem scan of build artifacts
- **Severity Levels**: CRITICAL, HIGH, MEDIUM
- **Output Format**: SARIF (uploaded to GitHub Security tab)
- **Action Version**: `aquasecurity/trivy-action@0.28.0`

##### NPM Audit
- **Scope**: Production dependencies only (`--omit=dev`)
- **Threshold**: Moderate severity and above
- **Output**: JSON report + summary markdown

#### Failure Conditions

The security scan will **fail the CI build** if:
- Critical vulnerabilities are found in npm dependencies
- More than 5 high-severity vulnerabilities are detected

The scan will **warn** (but not fail) if:
- 1-5 high-severity vulnerabilities are present
- Medium or low-severity issues exist

### 2. Platform-Specific Artifact Scanning (`ci-cd.yml`)

The full CI/CD pipeline includes platform-specific security scanning:

**Workflow:** `.github/workflows/ci-cd.yml`
**Job:** `security-scan-artifacts`

#### Features

- **Platform Matrix**: Scans artifacts for each build platform (currently Linux)
- **Trivy Integration**: Filesystem vulnerability scanning
- **NPM Audit**: Production dependency analysis
- **SARIF Upload**: Results visible in GitHub Security tab
- **Artifact Reports**: JSON audit results and summary saved for 30 days

#### Pipeline Integration

The security scan integrates into the deployment pipeline:

```
test → security → build → security-scan-artifacts → docker → deploy
```

Docker builds and deployments **require** security scans to pass.

## Viewing Results

### GitHub Security Tab

1. Navigate to repository **Security** tab
2. Click **Code scanning alerts**
3. Filter by category:
   - `build-artifacts` - Main CI scan results
   - `build-artifacts-linux` - Platform-specific results

### Artifact Downloads

Security reports are uploaded as GitHub Actions artifacts:

1. Go to workflow run
2. Scroll to **Artifacts** section
3. Download:
   - `npm-audit-results` - Full audit JSON + summary
   - `security-scan-linux` - Platform-specific reports

## Configuration

### Severity Thresholds

Edit workflow files to adjust severity levels:

```yaml
# ci.yml - line ~140
severity: 'CRITICAL,HIGH,MEDIUM'  # Change as needed
```

### Audit Levels

Adjust npm audit strictness:

```yaml
# ci.yml - line ~175
run: npm audit --audit-level=moderate  # Options: low, moderate, high, critical
```

### Failure Criteria

Modify vulnerability thresholds in the "Check for critical vulnerabilities" step:

```bash
# Current thresholds
CRITICAL > 0    # Fails build
HIGH > 5        # Warns only
```

## Best Practices

### 1. Regular Scans
- Security scans run on every push and pull request
- Results are uploaded to GitHub Security tab for tracking

### 2. Dependency Updates
- Address critical vulnerabilities immediately
- Schedule regular dependency updates to stay current

### 3. Review Process
- Check security scan results before merging PRs
- Investigate and document any accepted risks

### 4. False Positives
- Review Trivy findings for false positives
- Create `.trivyignore` file to suppress known issues

### 5. Integration Testing
- Ensure security scans don't block legitimate code changes
- Adjust thresholds based on risk tolerance

## Troubleshooting

### Build Fails on Security Scan

**Issue**: CI fails with "Critical vulnerabilities found"

**Solution**:
1. Review the npm audit output in job logs
2. Update vulnerable dependencies:
   ```bash
   npm audit fix --force
   ```
3. If no fix available, evaluate risk and document exception

### SARIF Upload Fails

**Issue**: Trivy results don't appear in Security tab

**Solution**:
1. Verify `security-events: write` permission is set
2. Check SARIF file is generated (view job logs)
3. Ensure repository has Advanced Security enabled

### Audit Times Out

**Issue**: npm audit step hangs or times out

**Solution**:
1. Check npm registry availability
2. Add timeout to audit step:
   ```yaml
   timeout-minutes: 10
   ```

## Security Standards

Luna Agent security scanning aligns with:
- **OWASP Top 10** - Vulnerability detection
- **CWE/CVE** - Common weakness enumeration
- **NIST** - Cybersecurity framework
- **SARIF** - Static Analysis Results Interchange Format

## Maintenance

### Updating Scanner Versions

Keep security tools current:

```yaml
# Update Trivy version
uses: aquasecurity/trivy-action@0.28.0  # Check for latest

# Update CodeQL action
uses: github/codeql-action/upload-sarif@v3  # Check for latest
```

### Adding New Scanners

To add additional security scanners:

1. Add step to `security-scan` or `security-scan-artifacts` job
2. Generate SARIF output if possible
3. Upload to GitHub Security tab with unique category
4. Update this documentation

## Related Documentation

- [SECURITY.md](../../SECURITY.md) - Luna Agent security features
- [ci.yml](./workflows/ci.yml) - Main CI workflow
- [ci-cd.yml](./workflows/ci-cd.yml) - Full CI/CD pipeline
- [Trivy Documentation](https://aquasecurity.github.io/trivy/)
- [GitHub Security](https://docs.github.com/en/code-security)
