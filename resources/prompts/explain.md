---
title: "Explain Code"
icon: "📖"
category: "Explain"
command: "explain"
description: "Explain code at the right level of detail"
source: builtin
version: 2
variables:
  audience:
    type: select
    options: ["Junior dev", "Senior dev", "Non-technical", "Quick refresher"]
    default: "Senior dev"
  code:
    type: file
    placeholder: "Select files to explain…"
---

Please explain the following code for a **{{audience}}** audience.

{{code}}

Tailor your explanation to the audience:

**For a Junior Developer**:
- Explain the overall purpose and what the code does
- Break down each section step-by-step
- Define any technical terms, patterns, or concepts that might be unfamiliar
- Explain *why* certain approaches are used, not just what they do
- Point out important patterns or techniques they should learn
- Use analogies or examples to clarify complex concepts

**For a Senior Developer**:
- Provide a concise high-level overview of the purpose and approach
- Highlight interesting patterns, algorithms, or design decisions
- Explain any non-obvious logic or edge case handling
- Point out performance implications, trade-offs, or potential issues
- Note any deviations from common patterns and why
- Skip basic concepts but explain domain-specific logic

**For a Non-Technical Audience**:
- Explain what the code accomplishes in business/user terms
- Avoid jargon; use plain language and analogies
- Focus on the "what" and "why" rather than the "how"
- Describe the inputs, outputs, and overall flow
- Relate the code to real-world outcomes or user experience
- Use metaphors (like a recipe, assembly line, etc.) to make it relatable

**For a Quick Refresher**:
- One-paragraph summary of what the code does
- Bullet points for key logic or steps
- Highlight any gotchas or important details
- Assume familiarity with the language and domain
- Be concise — just enough to jog memory

Structure your explanation clearly with headings or sections if the code is complex. Use code snippets or inline comments to reference specific parts when needed.
