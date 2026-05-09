# Skill: Logical Commit Separation

## Purpose
To analyze a working directory with multiple uncommitted changes and logically partition them into distinct, well-scoped Git commits. This ensures a clean, readable, and maintainable Git history.

## Instructions

1. **Analyze Changes**
   Run `git status` and `git diff` (including untracked files with `git ls-files --others --exclude-standard` or `git diff --untracked`) to understand all modifications, additions, and deletions.

2. **Identify Logical Groups**
   Group the changes into cohesive sets based on context. Common groupings include:
   - **Configuration / Tooling**: Build scripts, package managers, root configs (e.g., `package.json`, `turbo.json`).
   - **Refactoring**: Migrating file types, renaming, or restructuring (e.g., `.ts` to `.mjs`).
   - **Features / UI**: Design tokens, new components, CSS changes.
   - **Chores**: `.gitignore` updates, minor repo maintenance.
   - **Fixes**: Bug fixes, dependency adjustments.

3. **Stage and Commit**
   For each logical group:
   - Use `git add <files>` to stage *only* the relevant files.
   - Use the Conventional Commits format for the commit message: `<type>(<scope>): <description>`.
     - **Types**: `feat`, `fix`, `chore`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`.
     - **Scope**: (Optional) The component or package affected (e.g., `web`, `api`).
     - **Description**: A concise summary of the change in imperative mood (e.g., "add Shadcn UI tokens" instead of "added Shadcn UI tokens").
   - Run `git commit -m "<message>"`.

4. **Verify**
   Run `git status` again to ensure all intended changes are committed and the working tree is clean.
