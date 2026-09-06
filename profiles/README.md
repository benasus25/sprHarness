# Personal profile overlays

A profile is a **committed** personal layer on top of `shared/`. Create a
directory named after yourself that mirrors `shared/`'s structure:

```
profiles/
  sparsh/
    skills/my-notes-style/SKILL.md     ← adds a personal skill
    agents/reviewer.md                 ← overrides the shared reviewer by name
    instructions/personal.md           ← appended after shared instructions
    prompts/standup.md                 ← adds a personal command
    hooks/hooks.json                   ← extra/overriding hook definitions (by id)
    mcp/servers.json                   ← extra/overriding MCP servers (by name)
```

Rules:

- **Override by name**: a profile skill/agent/prompt with the same name as a
  shared one replaces it. Instructions are appended, never replaced.
- Profiles are committed and shared — colleagues can read (and borrow from)
  each other's overlays. Anything private to one machine belongs in `local/`.
- Which profile a machine uses is machine-local state, not committed:

```
harness profile use sparsh
harness install
```
