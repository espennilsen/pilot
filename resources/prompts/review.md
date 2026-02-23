---
title: "Code Review"
icon: "🔍"
category: "Code"
command: "review"
description: "Thorough code review with actionable feedback"
source: builtin
version: 2
variables:
  code:
    type: file
    placeholder: "Select files to review…"
---

Please conduct a comprehensive code review of the following code. I need you to examine it carefully and provide detailed, actionable feedback.

{{code}}

Your review should cover:

1. **Bugs & Logic Errors**: Identify any potential bugs, edge cases not handled, off-by-one errors, race conditions, or logic flaws.

2. **Security Vulnerabilities**: Check for common security issues including:
   - Input validation and sanitization
   - Authentication and authorization flaws
   - Sensitive data exposure
   - Injection vulnerabilities (SQL, XSS, command injection)
   - Insecure dependencies or cryptographic practices

3. **Performance Issues**: Look for inefficient algorithms, unnecessary iterations, memory leaks, expensive operations in loops, or blocking calls that could be optimized.

4. **Code Quality & Readability**: Assess naming conventions, code structure, complexity, duplication, and adherence to language idioms and best practices.

5. **Error Handling**: Evaluate how errors are caught, logged, and propagated. Are edge cases handled gracefully?

6. **Testing & Maintainability**: Consider testability, modularity, and whether the code will be easy to maintain and extend.

For each issue you identify:
- Reference the specific line(s) or function(s)
- Assign a severity level: 🔴 Critical, 🟠 High, 🟡 Medium, 🟢 Low
- Explain why it's a problem
- Provide a concrete suggestion or code example for fixing it

If the code is well-written, highlight what was done well and any patterns worth reusing elsewhere.
