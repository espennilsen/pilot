---
title: "Write Tests"
icon: "🧪"
category: "Code"
command: "test"
description: "Generate comprehensive tests for code"
source: builtin
version: 2
variables:
  framework:
    type: select
    options: ["Vitest", "Jest", "Mocha", "Pytest", "Go testing"]
    default: "Vitest"
  code:
    type: file
    placeholder: "Select files to test…"
---

Please write comprehensive tests for the following code using **{{framework}}**.

{{code}}

Your test suite should include:

1. **Happy Path Tests**: Test the primary use cases with valid inputs and verify expected outputs. Cover the main functionality that users will rely on.

2. **Edge Cases**: Test boundary conditions, empty inputs, maximum/minimum values, special characters, and unusual but valid scenarios.

3. **Error Cases**: Test invalid inputs, error conditions, exceptions, and failure modes. Verify that errors are thrown or handled correctly.

4. **State & Side Effects**: If the code maintains state or has side effects (I/O, mutations, external calls), test different states and verify side effects occur as expected.

5. **Integration Points**: If the code depends on external services, databases, or APIs, include tests with appropriate mocks or stubs.

For each test:
- Use descriptive test names that clearly state what is being tested
- Follow the Arrange-Act-Assert (AAA) pattern
- Keep tests focused and independent
- Mock or stub external dependencies appropriately
- Add comments for complex test setups or non-obvious assertions

Organize tests logically (by function, by scenario, etc.) and use appropriate test helpers, fixtures, or setup/teardown hooks to keep the code DRY.

Provide complete, runnable test code that I can copy directly into my test file.
