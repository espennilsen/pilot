---
title: "Debug Error"
icon: "🐛"
category: "Debug"
command: "debug"
description: "Diagnose and fix errors"
source: builtin
version: 1
---

I'm encountering an error and need help diagnosing and fixing it.

**Error**:
{{error}}

**Context** (code where the error occurs, stack trace, environment details):
{{context}}

Please help me by:

1. **Understanding the Error**:
   - Parse the error message and stack trace
   - Identify the exact line or function where the error originates
   - Explain what the error means in plain language
   - Distinguish between the symptom and the root cause

2. **Root Cause Analysis**:
   - Trace the error back to its source
   - Identify what conditions trigger this error
   - Consider edge cases, race conditions, or timing issues
   - Check for common mistakes (null/undefined, type mismatches, async issues, scope problems)
   - Look for environmental factors (missing dependencies, wrong versions, configuration)

3. **Reproduction & Verification**:
   - Suggest how to reliably reproduce the error
   - Recommend debugging techniques (console logs, debugger breakpoints, test cases)
   - Identify what data or state leads to this error

4. **Solution**:
   - Provide a concrete fix with corrected code
   - Explain why this fix resolves the root cause
   - Show before/after code snippets
   - Note any side effects or implications of the fix

5. **Prevention**:
   - Suggest how to prevent this error in the future (validation, types, tests)
   - Recommend defensive programming practices
   - Identify related code that might have similar issues

If there are multiple possible causes, list them in order of likelihood and explain how to determine which one applies.

If you need more information to diagnose the issue, ask specific questions about the context, environment, or steps leading to the error.
