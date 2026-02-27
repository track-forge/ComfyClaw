---

# Role-Based Context Architecture for Agent Skills

## Overview

This project uses a **role-based context architecture** to coordinate agent behavior.

Instead of giving a single agent a broad, unfocused objective, the system defines:

* Distinct roles
* Explicit scope boundaries
* Defined inputs and outputs
* Structured logging
* Controlled authority transitions

Each role operates with a **focused context window**, preventing drift, overreach, and context overload.

This enables agents to collaborate deterministically while remaining modular and composable.

---

## Core Idea

> Separate cognition by responsibility.

Each role:

* Has a clearly defined purpose
* Operates on a bounded set of files
* Produces specific artifacts
* Does not overstep into other roles
* Feeds outputs forward in a structured loop

This creates:

Clarity → Discipline → Composability → Compounding behavior

---

## Why Role-Based Context Works

### 1. Prevents Context Dilution

Large prompts degrade performance.

By narrowing context to a specific role, the agent:

* Stays focused
* Avoids mixing objectives
* Produces cleaner outputs
* Makes fewer accidental cross-system changes

---

### 2. Enables Deterministic Collaboration

Each role has:

* Known inputs
* Known outputs
* Known authority boundaries

This makes role interactions predictable and reviewable.

No role is allowed to:

* Rewrite strategy casually
* Execute outside its domain
* Mutate upstream artifacts without ownership

---

### 3. Creates Feedback Loops

Roles are wired into loops:

Detection → Interpretation → Production → Execution → Evaluation → Adjustment

Because outputs are logged and structured, future roles can:

* Expand behavior when signals are strong
* Contract behavior when signals weaken
* Promote ideas into primary channels
* Retire underperforming areas

This makes the system adaptive.

---

### 4. Allows Incremental Growth

Roles may:

* Add new candidates
* Expand into adjacent domains
* Refine strategy
* Propose structural changes

But authority is always mediated through the appropriate role.

This prevents chaotic expansion.

---

## Structural Pattern

A role-based agent system typically includes:

### Strategic Layer

Defines direction and guardrails.

### Intelligence Layer

Observes patterns and extracts durable signals.

### Opportunity Layer

Detects real-time openings.

### Production Layer

Generates actionable artifacts.

### Execution Layer

Performs irreversible actions.

### Evaluation Layer

Measures performance and recommends adjustment.

Each layer is isolated by design.

---

## Role Definition Template

Each role should define:

* Purpose
* Scope
* Time horizon
* Inputs
* Outputs
* Boundaries
* Success condition

Roles must not:

* Implicitly assume authority
* Collapse into other roles
* Bypass lifecycle rules

---

## Input / Output Mapping

Every role should have an explicit I/O map.

Example:

```
Role A:
  Input:
    - File X
    - Log Y
  Output:
    - Artifact Z

Role B:
  Input:
    - Artifact Z
  Output:
    - Modified Strategy Doc
```

This makes the system inspectable and testable.

---

## Controlled Expansion & Contraction

Role-based systems should encode:

* How new domains are introduced
* Who approves promotion to primary state
* How underperforming areas are retired
* Limits per run (to prevent runaway expansion)

Expansion is bounded.
Contraction is deliberate.

---

## Operational Model

Roles can be scheduled independently (e.g., cron).

Each execution:

* Loads only its relevant context
* Produces a deterministic artifact
* Appends to structured logs

This enables:

* Auditability
* Replayability
* Performance evaluation
* Distributed orchestration

---

## Design Principles

* Separation of concerns
* Explicit authority boundaries
* Structured logging
* Small incremental changes
* Reviewable state transitions
* Platform-agnostic architecture

---

## Benefits

This pattern:

* Reduces agent drift
* Improves reliability
* Encourages composable design
* Enables safe autonomy
* Makes multi-agent collaboration predictable
* Supports long-term compounding behavior

---

## When to Use This Pattern

This architecture is ideal when:

* Agents perform multi-step workflows
* Outputs need evaluation before promotion
* Expansion must be controlled
* Feedback loops are required
* Autonomy must remain bounded

It is especially useful in:

* Social systems
* Content pipelines
* Research + production workflows
* Monitoring + response systems
* OSS collaboration automation
* Multi-platform orchestration

---

## Summary

A role-based context architecture:

* Decomposes complex agent behavior
* Assigns clear authority
* Defines explicit I/O boundaries
* Enables compounding systems
* Prevents uncontrolled automation drift

It turns “an agent that does things” into:

> A structured, evolving system with internal governance.

