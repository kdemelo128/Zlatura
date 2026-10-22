---
name: skill-check
description: Check a Zlatura skill is short, triggers at the right time and matches CLAUDE.md. Use when adding or editing a file in .claude/skills/, or when a retro says a skill should be trimmed.
---

# Skill check

1. **Description:** one sentence for what it does, one "Use when ..." for when. Its trigger must not overlap another skill's.
2. **Body under about 40 lines.** Link `docs/working-rules.md` or another skill instead of repeating it: one home per rule.
3. **Matches CLAUDE.md:** the gates, invented fixtures, no network from `app/`, one PR per item. A skill never loosens a gate.
4. **Try it once by hand:** give the main session a realistic request, and check the skill loads and its steps are followed. No eval harness, no extra agents.
5. **Adopted text (ponytail):** the upstream bytes are unchanged (`tests/ponytail-skill.test.js`), and the `THIRD_PARTY.md` row and commit SHA are current.
6. **Edits to CLAUDE.md or a gate** are the owner's to approve.

The idea of checking skills before relying on them comes from Anthropic's skill-creator (Apache-2.0, `anthropics/skills` at `dbd4588`); this checklist is our own wording and copies none of it.
