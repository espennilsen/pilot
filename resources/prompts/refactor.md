---
title: "Refactor"
icon: "♻️"
category: "Refactor"
command: "refactor"
description: "Refactor code with specific goals"
source: builtin
version: 2
variables:
  code:
    type: file
    placeholder: "Select files to refactor…"
---

I need you to refactor the following code to achieve these specific goals:

**Goals**: {{goals}}

**Code to refactor**:
{{code}}

Please refactor this code while:

1. **Preserving behavior**: The refactored code must work exactly the same as the original. Do not change the external API or introduce breaking changes unless explicitly requested in the goals.

2. **Meeting the stated goals**: Directly address each goal listed above. If the goals are vague, ask clarifying questions first.

3. **Improving code quality**: Beyond the specific goals, apply general refactoring best practices:
   - Extract complex expressions into well-named variables
   - Break down large functions into smaller, focused ones
   - Remove duplication (DRY principle)
   - Improve naming for clarity
   - Simplify conditionals and reduce nesting
   - Follow language-specific idioms and conventions

4. **Explaining your changes**: For each significant refactoring, explain:
   - What you changed and why
   - How it addresses the stated goals
   - Any trade-offs or considerations
   - Whether any tests should be updated

Provide the complete refactored code, not just snippets. If there are multiple approaches, briefly explain why you chose your approach.
