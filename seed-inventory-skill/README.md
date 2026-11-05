# Seed inventory skill for Claude Code

Replaces the demo inventory in your Spare Parts ERP with the researched opening-stock catalogue:
**337 parts, 1,337 items, Genuine / AA / A grades, opening stock cost about Rs 1,531,660.**

## Install (once)
1. Unzip this into your project folder (the one with CLAUDE.md). You should now have:
   `.claude/skills/seed-inventory/SKILL.md` and `.claude/skills/seed-inventory/data/`
2. Commit your current work first (so you can always go back).

## Run
Open a **new** Claude Code conversation in VS Code and paste:

> /seed-inventory
> Replace all current inventory with the catalogue in this skill. Show me the plan, the current row counts and the backup path before you delete anything, and wait for my "go ahead".

Claude Code will inspect your database, show you what it will delete, ask about any sales history,
back up the database, load the 337 parts, check the totals, and test the screens.

## Files
- `.claude/skills/seed-inventory/SKILL.md`: the instructions Claude Code follows
- `.claude/skills/seed-inventory/data/parts.json`: the 337 parts with grades, prices, quantities, fitment
- `.claude/skills/seed-inventory/data/models.json`: every make and model (motorcycles and three-wheelers)
- `.claude/skills/seed-inventory/data/categories.json`: the category list
- `.claude/skills/seed-inventory/data/meta.json`: expected totals used to verify the load
- `inventory-catalogue-preview.csv`: the same 337 parts, to open in Excel and check before loading

## Before you load
- 70 parts have **estimated** prices (marked "Estimated = Yes" in the CSV). You can load now and fix them later
  in the Inventory screen, or correct them in the CSV and ask Claude Code to "update parts.json from the CSV".
- Prices: Genuine = Sri Lankan retail found online; AA = 60% and A = 42% of Genuine; cost = 75% of selling price.
