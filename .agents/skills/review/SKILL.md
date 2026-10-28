---
name: review
description: Review code, diffs, pull requests, or repositories for evidence-backed correctness, security, reliability, and maintainability issues when a review is requested.
---

Review the provided code, diff, or repository as a senior software engineer. Identify meaningful issues affecting correctness, security, reliability, and maintainability, and recommend practical improvements.

## Understand the context first

- Establish the intended behavior, relevant business rules, architectural boundaries, and existing conventions.
- Read relevant callers, dependencies, types, schemas, and tests before drawing conclusions. Check whether a suspected issue is already handled elsewhere.
- For a PR or diff, prioritize issues introduced or worsened by the change. Clearly separate relevant pre-existing issues.
- If context is missing, state your assumptions and explain what information would change your conclusion.

## Review dimensions

Apply the following where relevant. Do not force a finding into every category.

### 1. Correctness and business logic
Does the code behave as intended across normal, edge, and failure cases?

Look for incorrect assumptions, broken invariants, missing validation, null or empty values, boundary conditions, ordering problems, and unintended behavior changes. Consider whether individually valid operations can produce an invalid overall state.

### 2. Design, naming, structure, and readability
What would you do differently, and what concrete benefit would it provide?

Assess responsibility boundaries, cohesion, naming precision, control flow, unnecessary complexity, dead code, and misleading comments. Favor designs that make behavior and invariants easy to understand. Follow established conventions unless there is a concrete reason to change them.

### 3. Coupling and dependencies
Are modules or classes dependent on details they should not need to know?

Look for leaked implementation details, circular dependencies, hidden side effects, mutable global state, and changes that require unrelated modules to move together. Recommend clearer boundaries or dependency changes when they reduce actual complexity or risk.

Do not introduce interfaces, layers, or dependency injection without a specific benefit.

### 4. DRY and abstraction quality
Is the same business rule or knowledge implemented in multiple places?

Distinguish duplicated knowledge from code that merely looks similar. Recommend extraction when the implementations should evolve together. Check whether existing abstractions combine unrelated responsibilities or require excessive configuration and special cases.

Explain when keeping similar code separate is the better trade-off.

### 5. Security and privacy
Identify concrete weaknesses in trust boundaries, input handling, authentication, authorization, and sensitive-data handling.

Where relevant, inspect:
- Resource-level authorization and isolation between users or tenants.
- Injection, unsafe rendering or deserialization, and server-side requests influenced by untrusted input.
- Secret handling, sensitive logs, excessive data exposure, and insecure defaults.
- Abuse paths involving expensive operations, uploads, or missing limits.

Explain the conditions needed to exploit each issue and the potential impact. Distinguish confirmed vulnerabilities from concerns requiring verification. Redact any discovered secret values.

### 6. Reliability and error handling
What happens when a dependency fails, returns unexpected data, or takes too long?

Review error propagation, timeouts, cancellation, retries, cleanup, and partial failures. Check whether failures are silently ignored, leave inconsistent state, or cause repeated side effects. Assess whether recovery behavior is appropriate for the operation.

### 7. Concurrency and data integrity
Can overlapping requests, duplicate jobs, or out-of-order events produce incorrect results?

Where applicable, inspect race conditions, atomicity, transactions, idempotency, stale reads, cache invalidation, and update conflicts. Describe a concrete execution sequence that could trigger the problem.

### 8. Performance and resource usage
Are there plausible bottlenecks or unbounded resource costs?

Look for unnecessary queries or network calls, repeated work, inefficient data access, blocking operations, missing pagination, unbounded concurrency, and resource leaks.

Explain the workload or scale at which an issue matters. Separate demonstrable problems from hypotheses that require measurement.

### 9. Contracts, compatibility, and deployment
Does the change preserve the contracts its consumers rely on?

Consider API behavior, data formats, schema migrations, persisted data, configuration, and interactions between old and new versions during rollout. Flag migration or deployment ordering requirements and rollback limitations when relevant.

### 10. Tests and testability
Which important behaviors or failure modes lack meaningful verification?

Assess whether tests validate observable behavior and business rules, whether regressions could pass unnoticed, and whether tests are fragile or dependent on implementation details.

Recommend focused tests for concrete risks. Avoid proposing tests solely to increase coverage or mirror the implementation.

### 11. Observability and diagnosis
If this code failed in production, could someone identify what happened and why?

Assess whether errors, logs, metrics, and tracing provide useful context for important operations without exposing sensitive information or creating excessive noise.

## Review standards

- Prioritize correctness, security, and data integrity over cosmetic improvements.
- Base findings on evidence from the actual code and reachable execution paths.
- Do not present assumptions, stylistic preferences, or generic best practices as defects.
- Consider existing safeguards and framework behavior before reporting an issue.
- Recommend the smallest change that adequately addresses the problem. Explain trade-offs when a larger refactor is justified.
- Consolidate findings that share the same root cause.
- Report all material, actionable issues without inventing findings to fill a quota.
- If no material issues are found, say so and describe the limits of the review. Do not imply that the code is proven correct or secure.
- Review only; do not modify files unless explicitly requested.
- Run relevant existing checks when available and appropriate. Clearly distinguish checks actually executed from suggested validation.

## Output format

### Overall assessment
Briefly explain the main risks, the scope reviewed, and any material limitations.

### Findings, ordered by severity
For each finding, provide:

1. **Title and severity:** Critical, High, Medium, or Low, based on actual impact and likelihood.
2. **Location:** File, function, and precise line range when available.
3. **Problem and evidence:** What is wrong and what in the code supports the conclusion.
4. **Trigger and impact:** A realistic input or execution scenario and its consequences.
5. **Recommended fix:** The smallest practical correction, including relevant trade-offs.
6. **Verification:** A focused test or check that would confirm the fix.

Use short code snippets only when they make the recommendation clearer.

### Optional improvements
List worthwhile design, naming, readability, or structural improvements separately from defects. Explain the benefit of each.

### Open questions and validation gaps
List unresolved assumptions, suspected issues that need more evidence, and important behaviors that could not be verified. State which checks were run and their results.
