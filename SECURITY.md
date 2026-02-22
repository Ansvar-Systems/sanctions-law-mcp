# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 0.x.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it responsibly.

**Email:** [security@ansvar.eu](mailto:security@ansvar.eu)

### What to include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response timeline

- **Acknowledgment:** Within 48 hours
- **Initial assessment:** Within 5 business days
- **Fix timeline:** Depends on severity (critical: 7 days, high: 14 days, medium: 30 days, low: 90 days)

### Responsible Disclosure Guidelines

- **Do not** open a public GitHub issue for security vulnerabilities
- **Do not** exploit the vulnerability beyond what is necessary to demonstrate it
- **Do not** access, modify, or delete data belonging to others
- Allow reasonable time for the issue to be resolved before public disclosure
- Act in good faith to avoid privacy violations, data destruction, and service disruption

### Scope

This policy applies to the `@ansvar/sanctions-law-mcp` npm package and the hosted endpoint at `sanctions-law-mcp.vercel.app`. The database contains only publicly available legal data; however, vulnerabilities in the server code, dependencies, or deployment configuration are in scope.

### Recognition

We appreciate responsible disclosure and will credit reporters (with permission) in our changelog and release notes.

## Security Measures

This project implements 6-layer security CI/CD:

1. **CodeQL** — Static analysis for code vulnerabilities
2. **Semgrep** — Pattern-based security scanning
3. **Trivy** — Container and dependency vulnerability scanning
4. **Gitleaks** — Secret detection in code and history
5. **Socket** — Supply chain attack detection
6. **Scorecard** — OpenSSF security best practices
