# AGENTS.md

Guidelines for agents contributing to this repository.

This project is maintained via disciplined, reviewable changes.  
Agents must follow the rules below.

---

## 1. Branching Rules

Agents must **never commit directly to `main`**.

All changes must be made on feature branches using the naming pattern:

    dev/<short-description>

Examples:

    dev/add-config-loader
    dev/refactor-auth-middleware
    dev/fix-api-timeout

Branch names must be:

- Lowercase
- Hyphen-separated
- Descriptive but concise

---

## 2. Issue-Driven Workflow

This repository uses **GitHub Issues for coordination between agents**.

### Agents must:

- Look for issues assigned to them.
- If starting work on an unassigned issue:
  - Comment that they are taking it.
  - Assign the issue to themselves.
- Do not duplicate work already in progress.
- Keep issue threads updated with meaningful progress notes.

Issues are the single source of truth for task coordination.

No “stealth work.”

---

## 3. Pull Request Workflow

All changes must go through a Pull Request (PR).

Requirements:

- At least one approval before merging.
- No self-approval.
- PR description must explain:
  - What changed
  - Why it changed
  - What areas of the system are affected
  - Any follow-up implications

Agents must not merge their own PRs unless explicitly authorized.

Small PRs are strongly preferred over large ones.

---

## 4. Scope Discipline

Agents must:

- Modify only the files relevant to the task.
- Avoid broad refactors unless explicitly requested.
- Preserve existing architecture unless change is part of the issue.
- Avoid introducing unrelated improvements “while here.”

This repository optimizes for clarity and stability over cleverness.

---

## 5. Incremental Improvement

Prefer:

- Small, reviewable diffs
- Clear commit history
- Backward-compatible changes
- Feature flags for risky changes

Avoid sweeping redesigns without discussion.

---

## 6. Security & Safety

Agents must not:

- Embed secrets
- Hardcode API keys
- Commit credentials
- Introduce insecure defaults
- Bypass platform or service terms

Security mistakes compound. Treat them as critical failures.

---

## 7. Secret Scanning

This repository uses automated secret scanning.

If pre-commit hooks are configured:

    pip install pre-commit
    pre-commit install

To run manually:

    pre-commit run --all-files

Agents must never bypass secret scanning.

---

## 8. Documentation First

If adding new capability:

- Update README if externally visible.
- Update relevant documentation.
- Keep architecture understandable.
- Prefer explicit over implicit behavior.

Clarity compounds.

---

## 9. Communication Standards

- If uncertain, open a draft PR.
- If blocked, comment on the issue.
- If a change affects system behavior, explain the impact.
- Do not assume intent — document reasoning.

Transparency > speed.

---

## 10. When in Doubt

Open a draft PR.  
Explain the uncertainty.  
Request review.

This repository values stability, clarity, and long-term maintainability over rapid iteration.
