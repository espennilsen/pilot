---
title: "Security Audit"
icon: "🛡️"
category: "Code"
command: "security"
description: "Security-focused code review"
source: builtin
version: 2
variables:
  code:
    type: file
    placeholder: "Select files to audit…"
---

Please conduct a thorough security audit of the following code. I need you to identify potential security vulnerabilities and provide specific remediation guidance.

{{code}}

Focus your audit on these critical areas:

1. **Injection Attacks**:
   - SQL injection: Are database queries parameterized? Are ORM methods used safely?
   - Command injection: Are shell commands constructed from user input?
   - XSS (Cross-Site Scripting): Is user input properly escaped before rendering? Are dangerous HTML methods avoided?
   - Path traversal: Are file paths validated and sanitized?
   - LDAP, XML, or other injection vectors

2. **Authentication & Authorization**:
   - Are authentication checks present and correctly implemented?
   - Are authorization checks performed before sensitive operations?
   - Are there privilege escalation risks?
   - Is session management secure (session fixation, secure cookies, timeout)?
   - Are passwords hashed with modern algorithms (bcrypt, Argon2)?

3. **Sensitive Data Exposure**:
   - Are secrets, API keys, or credentials hardcoded?
   - Is sensitive data logged or exposed in error messages?
   - Is PII or confidential data encrypted at rest and in transit?
   - Are secure headers set (CSP, HSTS, X-Frame-Options)?

4. **Input Validation & Sanitization**:
   - Is all user input validated (type, format, range, length)?
   - Are there SSRF (Server-Side Request Forgery) risks from user-controlled URLs?
   - Is file upload functionality secure (type checks, size limits, storage location)?

5. **Cryptography**:
   - Are cryptographic operations using secure, modern algorithms?
   - Are random values generated with cryptographically secure RNGs?
   - Is data properly authenticated (HMAC, digital signatures)?

6. **Dependencies & Third-Party Code**:
   - Are there known vulnerable dependencies?
   - Is user-supplied data passed unsafely to libraries?

7. **Business Logic Flaws**:
   - Race conditions in critical operations (TOCTOU)
   - Integer overflow/underflow
   - Insufficient rate limiting or anti-automation

For each vulnerability found:
- Classify severity: 🔴 Critical, 🟠 High, 🟡 Medium, 🟢 Low
- Reference the specific line(s) or function(s)
- Explain the attack scenario
- Provide concrete remediation code or guidance
- Link to OWASP or CWE references if applicable

If the code is secure, confirm that and highlight any particularly good security practices observed.
