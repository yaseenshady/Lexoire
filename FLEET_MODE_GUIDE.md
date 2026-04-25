# Fleet Mode & Planning Guide for JARVIS Development

## Overview

Fleet Mode is the recommended workflow for orchestrating complex development tasks. It uses parallel sub-agents, SQL-based todo tracking, and coordinated execution to maximize efficiency.

## Core Principles

### 1. Always Plan First
Before implementing, create a plan:
- Use `[[PLAN]]` prefix in requests
- Decompose work into parallel todos
- Identify dependencies
- Save plan to `/Users/yshady/.copilot/session-state/*/plan.md`

### 2. Track Work in SQL
All work is tracked in SQLite:
```sql
-- View pending todos
SELECT * FROM todos WHERE status = 'pending';

-- View todo dependencies
SELECT * FROM todo_deps;

-- Update status when complete
UPDATE todos SET status = 'done' WHERE id = 'my-todo';
```

### 3. Dispatch in Parallel
Launch independent sub-agents simultaneously:
```bash
# Bad: Sequential sub-agents
task(agent1) -> agent1 completes -> task(agent2)

# Good: Parallel sub-agents
task(agent1) + task(agent2) + task(agent3) in same turn
```

### 4. Respect Dependencies
- Only dispatch todos with no pending dependencies
- Use `todo_deps` table to track blocking relationships
- Query ready todos: `SELECT * FROM todos WHERE status = 'pending' AND id NOT IN (SELECT todo_id FROM todo_deps td JOIN todos t ON td.depends_on = t.id WHERE t.status != 'done')`

## Workflow Steps

### Step 1: Understand the Request
Read the user request carefully. Identify:
- Main goal
- Deliverables
- Constraints
- Scope boundaries

### Step 2: Create a Plan (if non-trivial)
```
Problem: [What are we solving?]
Approach: [How will we solve it?]
Todos:
  - todo-1: [Description with enough detail to execute]
  - todo-2: [Description]
  - Dependencies: todo-2 depends on todo-1
```

Save plan to session workspace (`plan.md`).

### Step 3: Decompose into Todos
Create SQL todos for all work:
```sql
INSERT INTO todos (id, title, description, status) VALUES
  ('feature-auth', 'Add user authentication', 'Implement JWT auth...', 'pending'),
  ('feature-db', 'Create user schema', 'SQLite schema for users...', 'pending'),
  ('feature-api', 'Add auth endpoints', 'POST /login, /register...', 'pending');

INSERT INTO todo_deps (todo_id, depends_on) VALUES
  ('feature-api', 'feature-db'),
  ('feature-api', 'feature-auth');
```

### Step 4: Dispatch Sub-Agents
Launch parallel agents for independent todos:
```
task(agent1) for todo-1
task(agent2) for todo-2
task(agent3) for todo-3 (no dependencies)
All in SAME turn
```

Include in each agent prompt:
- Clear todo description
- Expected deliverables
- Update SQL status when done
- Return summary of what was completed

### Step 5: Wait for Completion
Sub-agents will notify when done. Then:
- Check SQL todo status
- Review the work via agent responses
- Validate it matches the request

### Step 6: Dispatch More if Needed
If todos remain:
- Query ready todos again
- Dispatch next batch in parallel
- Repeat until all done

## Sub-Agent Prompts Template

When dispatching, provide this structure:

```
You are completing todo: [TODO_ID]

**Task:** [What to build/fix/improve]

**Requirements:**
- [Requirement 1]
- [Requirement 2]
- [Requirement 3]

**Acceptance Criteria:**
- [Criterion 1]
- [Criterion 2]

**After completing:**
- Run: [Build/test commands]
- Update SQL: UPDATE todos SET status = 'done' WHERE id = '[TODO_ID]'
- Return: Summary of what was completed, any blockers

**Expected deliverables:**
- Files changed/created
- Tests passing
- No regressions
```

## Examples

### Example 1: Simple Feature
Request: "Add dark mode toggle"

```sql
INSERT INTO todos (id, title, description, status) VALUES
  ('dark-mode-toggle', 'Add dark mode toggle', 'Create toggle switch in settings panel that stores preference in localStorage', 'pending');
```

Dispatch 1 agent → done in 1 turn.

### Example 2: Multi-Part Feature with Dependencies
Request: "Add user profiles with avatars"

```sql
INSERT INTO todos (id, title, description, status) VALUES
  ('db-profile-schema', 'Create profile database schema', 'SQLite schema with user_id, avatar_url, bio, etc.', 'pending'),
  ('api-profile-endpoints', 'Add profile API endpoints', 'GET/POST /api/profile, file upload for avatar', 'pending'),
  ('ui-profile-page', 'Build profile UI component', 'React component to display and edit profile', 'pending'),
  ('avatar-upload', 'Implement avatar upload', 'Browser file picker + backend storage', 'pending');

INSERT INTO todo_deps (todo_id, depends_on) VALUES
  ('api-profile-endpoints', 'db-profile-schema'),
  ('ui-profile-page', 'api-profile-endpoints'),
  ('avatar-upload', 'api-profile-endpoints');
```

**Turn 1:** Dispatch 1 agent for `db-profile-schema`
**Turn 2:** Dispatch 1 agent for `api-profile-endpoints` (when `db-profile-schema` done)
**Turn 3:** Dispatch 2 agents for `ui-profile-page` + `avatar-upload` (both ready now)

### Example 3: Fully Parallel Work
Request: "Polish app UI, add docs, optimize performance"

```sql
INSERT INTO todos (id, title, description, status) VALUES
  ('ui-polish', 'Polish UI design', 'Improve colors, spacing, animations', 'pending'),
  ('add-docs', 'Write API documentation', 'Document all endpoints and response formats', 'pending'),
  ('optimize-perf', 'Optimize performance', 'Profile, identify bottlenecks, improve speed', 'pending');
```

**Turn 1:** Dispatch 3 agents simultaneously (no dependencies)
**Turn 2:** Done

## Key Commands

```bash
# View pending work
psql -c "SELECT id, title FROM todos WHERE status = 'pending';"

# View blocked work
psql -c "SELECT * FROM todos WHERE status = 'blocked';"

# View dependencies
psql -c "SELECT t1.id, t2.id FROM todo_deps td JOIN todos t1 ON td.todo_id = t1.id JOIN todos t2 ON td.depends_on = t2.id;"

# Mark todo done
psql -c "UPDATE todos SET status = 'done' WHERE id = 'my-todo';"

# Block todo with reason
psql -c "UPDATE todos SET status = 'blocked', description = 'Blocked: reason here' WHERE id = 'my-todo';"
```

## Best Practices

✅ **DO:**
- Plan before implementing
- Decompose into small, independent todos
- Dispatch multiple agents in parallel
- Use SQL for source of truth
- Update todo status explicitly
- Return clear summaries from agents
- Validate deliverables match requirements

❌ **DON'T:**
- Start implementing without a plan
- Dispatch just one agent (use sync agents or multiple background agents)
- Dispatch todos with unmet dependencies
- Forget to update SQL status
- Leave ambiguous todo descriptions
- Dispatch agents without clear acceptance criteria
- Ignore sub-agent blockers

## Fleet Mode vs Linear Mode

### Linear Mode (avoid)
```
Read request → Implement feature → Test → Done
```
- No parallelism
- Hard to track progress
- Difficult to coordinate multiple changes
- Can't validate incrementally

### Fleet Mode (recommended)
```
Understand → Plan → Decompose → Dispatch parallel agents → Validate → Done
```
- Parallel execution
- Clear todo tracking
- Easy progress monitoring
- Incremental validation
- Faster delivery

## When to Use Fleet Mode

**Use Fleet Mode when:**
- Task has multiple independent sub-components
- Work can be parallelized
- Need clear progress tracking
- Multiple changes to different files
- Unclear scope (planning helps clarify)

**Use Direct Mode when:**
- Simple, single-file changes
- Quick bug fixes
- One-line edits
- Clear, trivial task

## Integration with Copilot CLI

JARVIS itself uses fleet mode for coordinating Copilot sessions:

```
Voice input → Session router → Multiple parallel Copilot workers
```

Each worker is a durable session that can be resumed:
```bash
copilot --resume <session_id>
```

This architecture enables:
- Multiple parallel investigations
- Persistent agent memory
- Voice-driven orchestration
- Searchable session history

## For Your Development

When working on JARVIS:

1. **Planning phase** (`[[PLAN]]` prefix)
   - Decompose work into todos
   - Identify parallelizable work
   - Commit plan to session state

2. **Execution phase**
   - Dispatch sub-agents in parallel
   - Wait for completion
   - Validate deliverables

3. **Validation phase**
   - Test changes
   - Check for regressions
   - Verify against requirements

4. **Commit phase**
   - Include all changes
   - Update docs
   - Mark todos done
   - Commit with fleet mode summary

This ensures JARVIS development is fast, organized, and auditable.
