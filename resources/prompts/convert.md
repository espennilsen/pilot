---
title: "Convert Language"
icon: "🔄"
category: "Refactor"
command: "convert"
description: "Convert code between programming languages"
source: builtin
version: 2
variables:
  code:
    type: file
    placeholder: "Select files to convert…"
---

Please convert the following code from **{{from_language}}** to **{{to_language}}**.

{{code}}

When converting, ensure you:

1. **Idiomatic Translation**: Don't just transliterate syntax. Use the target language's idioms, patterns, and conventions:
   - Use the standard library and ecosystem of the target language
   - Follow the target language's naming conventions (camelCase, snake_case, etc.)
   - Use native language features (e.g., list comprehensions in Python, LINQ in C#)
   - Adopt the target language's error handling patterns (exceptions, Result types, etc.)

2. **Functional Equivalence**: The converted code should behave identically to the original:
   - Preserve all logic, edge cases, and error handling
   - Maintain the same public API and function signatures (adapted to target language conventions)
   - Keep the same dependencies on external systems (databases, APIs, etc.)

3. **Language-Specific Best Practices**:
   - Use appropriate data structures (arrays, lists, maps, sets, etc.)
   - Follow memory management patterns of the target language
   - Use async/await, promises, goroutines, or other concurrency patterns as appropriate
   - Apply proper type annotations (TypeScript, Python type hints, etc.) if the target language supports them

4. **Dependencies & Imports**: 
   - Identify equivalent libraries in the target language
   - If there's no direct equivalent, suggest the closest alternative or implement the functionality
   - List all imports/packages needed at the top

5. **Comments & Documentation**:
   - Preserve important comments from the original
   - Add new comments explaining any non-obvious translations
   - Note any gotchas or behavioral differences between languages

Provide:
- The complete converted code, ready to run
- A brief summary of key translation decisions
- Any dependencies or setup required
- Notes on any features that don't translate directly and how you handled them
