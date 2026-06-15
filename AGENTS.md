# AGENTS.md

## Project goal

This is an existing production project. Make small, safe, reviewable changes.

## Working style

- First inspect the existing code before editing.
- Prefer minimal changes over rewrites.
- Keep current UI/design patterns unless explicitly asked.
- Do not remove existing features unless requested.
- Explain what changed after each task.
- Before coding, summarize the plan briefly.
- After coding, list files changed and how to test.

## Git/change tracking

- Check `git status` before changes.
- Use small commits or suggest commit messages after each completed task.
- Mention any risky changes clearly.

## Development rules

- Reuse existing components, CSS classes, utilities, and data structures.
- Do not add new dependencies unless necessary.
- If adding a dependency, explain why.
- Keep code readable and maintainable.

## Verification

- Run the project locally if possible.
- Run available lint/build/test commands.
- If unable to run something, explain why.

## Token-saving rule

- Do not re-read the whole project unless necessary.
- Use targeted file inspection.
- Refer to PROJECT_NOTES.md and TASKS.md for context.
