---
title: "Generate Docs"
icon: "📝"
category: "Explain"
command: "docs"
description: "Generate documentation for code"
source: builtin
version: 2
variables:
  code:
    type: file
    placeholder: "Select files to document…"
---

Please generate comprehensive documentation for the following code:

{{code}}

Your documentation should include:

1. **API Documentation** (JSDoc, docstrings, or language-appropriate format):
   - Document all public functions, classes, and methods
   - Include parameter types, return types, and descriptions
   - Document any exceptions or errors that can be thrown
   - Add `@example` tags with usage examples for complex APIs
   - Note any deprecations or version information

2. **Module/File Overview**:
   - A high-level description of what this module does
   - Its role in the larger system
   - Key concepts or patterns used
   - Dependencies and why they're needed

3. **Usage Examples**:
   - Provide realistic code examples showing how to use the main functionality
   - Cover common use cases
   - Show both simple and advanced usage
   - Include expected output or behavior

4. **Configuration & Options**:
   - Document any configuration objects, parameters, or options
   - Explain what each option does and its default value
   - Note required vs. optional parameters
   - Provide example configurations

5. **Implementation Notes** (if relevant):
   - Explain any non-obvious design decisions
   - Document known limitations or edge cases
   - Note performance characteristics or trade-offs
   - Explain any complex algorithms or logic
   - Point out areas that might need future refactoring

6. **README Section** (if this is a library or significant module):
   - Installation instructions
   - Quick start guide
   - Complete API reference
   - Examples and recipes
   - Contributing guidelines (if applicable)

Format the documentation appropriately for the language and context:
- Use JSDoc for JavaScript/TypeScript
- Use docstrings for Python
- Use Rustdoc for Rust
- Use Javadoc for Java
- Use Markdown for README sections

The documentation should be clear, accurate, and maintainable. Avoid documenting obvious things, but do explain anything non-obvious or likely to confuse future developers.
