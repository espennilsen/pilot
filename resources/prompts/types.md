---
title: "Add Types"
icon: "🏷️"
category: "Code"
command: "types"
description: "Add TypeScript types and interfaces"
source: builtin
version: 2
variables:
  code:
    type: file
    placeholder: "Select files to add types to…"
---

Please add proper TypeScript types and interfaces to the following code:

{{code}}

Your type additions should:

1. **Comprehensive Type Coverage**: Add types for:
   - All function parameters and return values
   - All variables, constants, and class properties
   - Event handlers and callbacks
   - Generic functions and components where appropriate

2. **Proper Type Definitions**: 
   - Use interfaces for object shapes and classes
   - Use type aliases for unions, intersections, and complex types
   - Use enums for fixed sets of values when appropriate
   - Avoid `any` — use `unknown` if the type is truly dynamic, or use proper generics

3. **Leverage TypeScript Features**:
   - Use discriminated unions for state machines or variant types
   - Use mapped types, conditional types, or utility types where they add value
   - Use `readonly` for immutable data
   - Use optional properties (`?`) and nullish types correctly
   - Add JSDoc comments for exported types if they need explanation

4. **Type Safety**:
   - Ensure types are precise enough to catch real errors
   - Eliminate type assertions (`as`) unless absolutely necessary
   - If you must use type assertions, add a comment explaining why
   - Consider adding branded types for values that need additional compile-time safety

5. **Extract Reusable Types**: If you define multiple similar types, extract shared interfaces or create generic base types.

Provide the fully typed code with all type definitions included. If creating many new types, consider organizing them into a separate types section at the top or suggesting a separate types file.
