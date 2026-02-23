---
title: "PR Description"
icon: "📋"
category: "Writing"
command: "pr"
description: "Generate a pull request description"
source: builtin
version: 1
---

Please generate a comprehensive pull request description for the following changes.

**Changes**:
{{changes}}

Your PR description should be well-structured and include these sections:

## **Summary**
A 2-3 sentence overview of what this PR does and why. This should be understandable to both technical and non-technical stakeholders.

## **Changes**
A detailed list of what was changed, organized logically:
- Use bullet points for each significant change
- Group related changes together
- Explain *what* changed and *why*, not just *how*
- Highlight any architectural or design decisions
- Mention any files or components that were significantly modified

## **Type of Change**
Check all that apply:
- [ ] 🐛 Bug fix (non-breaking change which fixes an issue)
- [ ] ✨ New feature (non-breaking change which adds functionality)
- [ ] 💥 Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] 📝 Documentation update
- [ ] 🎨 Style/UI update (no functional changes)
- [ ] ♻️ Code refactoring (no functional changes)
- [ ] ⚡ Performance improvement
- [ ] ✅ Test updates

## **Testing**
Describe how these changes were tested:
- Manual testing steps performed
- New or updated automated tests
- Test coverage (if relevant)
- Edge cases considered
- Screenshots or videos (for UI changes)

Example:
```
- Added unit tests for new validation logic (98% coverage)
- Manually tested OAuth flow with Google and GitHub
- Verified error handling with expired tokens
- Tested on Chrome, Firefox, and Safari
```

## **Breaking Changes**
If this PR includes breaking changes:
- List each breaking change clearly
- Explain the migration path for users
- Document any required configuration changes
- Provide before/after examples

If there are no breaking changes, you can omit this section or write "None".

## **Related Issues**
Link to related issues, tickets, or discussions:
- Closes #123
- Related to #456
- Fixes #789

## **Checklist**
Standard pre-merge checklist:
- [ ] Code follows the project's style guidelines
- [ ] Self-review completed
- [ ] Commented complex or non-obvious code
- [ ] Updated documentation
- [ ] No new warnings or errors
- [ ] Added tests that prove the fix/feature works
- [ ] New and existing tests pass locally
- [ ] Dependent changes merged and published

## **Screenshots / Demo**
(If applicable — especially for UI changes)
Add before/after screenshots, GIFs, or links to demo videos.

## **Notes for Reviewers**
Any specific areas you'd like reviewers to focus on, potential concerns, or context that would help the review.

---

Generate a complete PR description following this structure. Be specific and thorough — this description will be the primary reference for reviewers and future developers looking at this change.
