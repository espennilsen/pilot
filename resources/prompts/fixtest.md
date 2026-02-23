---
title: "Fix Failing Test"
icon: "🔧"
category: "Debug"
command: "fixtest"
description: "Fix failing tests from output"
source: builtin
version: 1
---

I have a failing test that needs to be fixed. Please analyze the test output and determine the correct fix.

**Test output**:
{{test_output}}

Your analysis should:

1. **Parse the Test Failure**:
   - Identify which test(s) are failing
   - Extract the assertion that failed (expected vs. actual)
   - Note any error messages, stack traces, or context
   - Determine if it's an assertion failure, exception, timeout, or other issue

2. **Determine Root Cause**:
   - Is the bug in the **production code** (the code being tested)?
   - Is the bug in the **test itself** (wrong assertion, bad mock, incorrect setup)?
   - Is it a **test environment issue** (missing dependency, wrong configuration, timing)?
   - Is the test **flaky** (intermittent failure due to race conditions or randomness)?

3. **Identify the Fix Location**:
   - Which file(s) need to be modified (production code, test file, mocks, fixtures)?
   - Which function or module is the source of the problem?
   - Are there related tests that might also fail?

4. **Provide the Fix**:
   - Show the corrected code (production code and/or test code)
   - Explain exactly what was wrong and why your fix resolves it
   - If the test itself was wrong, explain what it should actually be testing
   - If the production code was wrong, show the bug and the corrected behavior

5. **Validation**:
   - Explain how to verify the fix works
   - Suggest additional test cases if the current tests missed an edge case
   - If the test is flaky, suggest how to make it deterministic

6. **Prevention**:
   - Recommend how to prevent similar failures (better assertions, test helpers, CI improvements)
   - Suggest additional tests if coverage is lacking

If the test output is ambiguous or doesn't provide enough information, explain what additional details you need (full stack trace, code being tested, test setup, etc.).
