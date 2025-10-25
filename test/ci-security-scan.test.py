#!/usr/bin/env python3
"""
Test script to validate CI workflow configurations for security scanning.
"""

import sys
import yaml
from pathlib import Path


def test_workflow_yaml_syntax():
    """Test that workflow files have valid YAML syntax."""
    workflows_dir = Path('.github/workflows')
    
    workflows = ['ci.yml', 'ci-cd.yml']
    
    for workflow_file in workflows:
        filepath = workflows_dir / workflow_file
        print(f"Testing {filepath}...")
        
        try:
            with open(filepath, 'r') as f:
                yaml.safe_load(f)
            print(f"✅ {workflow_file} has valid YAML syntax")
        except yaml.YAMLError as e:
            print(f"❌ {workflow_file} has invalid YAML syntax: {e}")
            return False
    
    return True


def test_ci_security_scan_job():
    """Test that ci.yml has the security-scan job configured correctly."""
    filepath = Path('.github/workflows/ci.yml')
    
    with open(filepath, 'r') as f:
        config = yaml.safe_load(f)
    
    # Check security-scan job exists
    if 'security-scan' not in config['jobs']:
        print("❌ ci.yml missing 'security-scan' job")
        return False
    
    security_scan = config['jobs']['security-scan']
    
    # Check job dependencies
    if security_scan.get('needs') != 'build':
        print("❌ security-scan job should depend on 'build' job")
        return False
    
    # Check permissions
    permissions = security_scan.get('permissions', {})
    if permissions.get('security-events') != 'write':
        print("❌ security-scan job needs 'security-events: write' permission")
        return False
    
    # Check steps exist
    steps = security_scan.get('steps', [])
    step_names = [step.get('name', '') for step in steps]
    
    required_steps = [
        'Download build artifacts',
        'Run Trivy vulnerability scanner on build artifacts',
        'Upload Trivy results to GitHub Security tab',
        'Run npm audit on production dependencies',
        'Check for critical vulnerabilities'
    ]
    
    for required_step in required_steps:
        if not any(required_step in name for name in step_names):
            print(f"❌ security-scan job missing step: {required_step}")
            return False
    
    print("✅ ci.yml security-scan job configured correctly")
    return True


def test_cicd_security_scan_artifacts_job():
    """Test that ci-cd.yml has the security-scan-artifacts job configured correctly."""
    filepath = Path('.github/workflows/ci-cd.yml')
    
    with open(filepath, 'r') as f:
        config = yaml.safe_load(f)
    
    # Check security-scan-artifacts job exists
    if 'security-scan-artifacts' not in config['jobs']:
        print("❌ ci-cd.yml missing 'security-scan-artifacts' job")
        return False
    
    security_scan = config['jobs']['security-scan-artifacts']
    
    # Check job dependencies
    if security_scan.get('needs') != 'build':
        print("❌ security-scan-artifacts job should depend on 'build' job")
        return False
    
    # Check permissions
    permissions = security_scan.get('permissions', {})
    if permissions.get('security-events') != 'write':
        print("❌ security-scan-artifacts job needs 'security-events: write' permission")
        return False
    
    # Check docker job depends on security scan
    docker_job = config['jobs'].get('docker', {})
    docker_needs = docker_job.get('needs', [])
    if 'security-scan-artifacts' not in docker_needs:
        print("❌ docker job should depend on 'security-scan-artifacts'")
        return False
    
    print("✅ ci-cd.yml security-scan-artifacts job configured correctly")
    return True


def test_security_documentation_exists():
    """Test that security scanning documentation exists."""
    doc_path = Path('.github/CI_SECURITY_SCANNING.md')
    
    if not doc_path.exists():
        print("❌ CI_SECURITY_SCANNING.md documentation missing")
        return False
    
    content = doc_path.read_text()
    
    required_sections = [
        '# CI Security Scanning',
        '## Security Scanning Jobs',
        '## Viewing Results',
        '## Configuration',
        '## Troubleshooting'
    ]
    
    for section in required_sections:
        if section not in content:
            print(f"❌ Documentation missing section: {section}")
            return False
    
    print("✅ Security scanning documentation exists and is complete")
    return True


def main():
    """Run all tests."""
    print("Running CI Security Scanning Tests\n")
    
    tests = [
        ("YAML Syntax", test_workflow_yaml_syntax),
        ("CI Security Scan Job", test_ci_security_scan_job),
        ("CI/CD Security Scan Artifacts Job", test_cicd_security_scan_artifacts_job),
        ("Security Documentation", test_security_documentation_exists),
    ]
    
    results = []
    for test_name, test_func in tests:
        print(f"\n{test_name}:")
        result = test_func()
        results.append(result)
    
    print("\n" + "="*50)
    passed = sum(results)
    total = len(results)
    print(f"Tests: {passed}/{total} passed")
    
    if all(results):
        print("✅ All tests passed!")
        return 0
    else:
        print("❌ Some tests failed")
        return 1


if __name__ == '__main__':
    sys.exit(main())
