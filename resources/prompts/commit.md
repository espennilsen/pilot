---
title: "Commit Message"
icon: "💬"
category: "Writing"
command: "commit"
description: "Generate a conventional commit message"
source: builtin
version: 1
---

Please generate a concise, well-structured commit message for the following changes using the Conventional Commits format.

**Diff**:
{{diff}}

Your commit message should follow this format:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Guidelines**:

1. **Type**: Choose the most appropriate type:
   - `feat`: A new feature
   - `fix`: A bug fix
   - `docs`: Documentation only changes
   - `style`: Code style changes (formatting, missing semi-colons, etc.)
   - `refactor`: Code change that neither fixes a bug nor adds a feature
   - `perf`: Performance improvement
   - `test`: Adding or updating tests
   - `chore`: Changes to build process, tooling, dependencies
   - `ci`: Changes to CI configuration files and scripts
   - `revert`: Reverts a previous commit

2. **Scope** (optional): A noun describing the section of the codebase affected (e.g., `api`, `auth`, `ui`, `parser`). Omit if the change is global.

3. **Subject**: 
   - Use imperative mood ("add feature" not "added feature")
   - Don't capitalize first letter
   - No period at the end
   - Keep it under 50 characters
   - Be specific but concise

4. **Body** (optional but recommended for non-trivial changes):
   - Explain *what* changed and *why* (not how — the diff shows how)
   - Wrap at 72 characters
   - Use bullet points for multiple changes
   - Reference issue numbers if applicable

5. **Footer** (optional):
   - Note breaking changes with `BREAKING CHANGE: description`
   - Reference issues closed: `Closes #123` or `Fixes #456`
   - Note deprecations

**Examples**:

```
feat(auth): add OAuth2 login support

Implement OAuth2 authentication flow with Google and GitHub providers.
Users can now sign in using their existing accounts.

Closes #234
```

```
fix(api): handle null responses from external service

The external API occasionally returns null instead of an empty array.
Added null check to prevent crashes.

Fixes #456
```

```
refactor: simplify error handling in HTTP client

- Extract common error handling logic into helper function
- Remove duplicate try-catch blocks
- Improve error messages for better debugging
```

Generate a commit message that accurately and concisely summarizes the changes shown in the diff.
