---
name: pf2e-macros
description: Write, debug, and improve Foundry VTT v14 script macros for the Pathfinder 2e system. Use whenever the user wants a macro, hotbar button, chat automation, dice/check/damage automation, condition or effect application, GM utility (XP, secret checks, party rolls), or asks to fix a macro that throws errors — even if they just describe a table-time annoyance like "I keep doing X by hand every session". Also use for questions about the game.pf2e API or converting old (v12/v13) macros to v14.
---

# PF2e Macro Writer (Foundry v14)

Turn "I want a button that..." into a working, resilient script macro for the PF2e system on Foundry v14.

## Before writing, pin down three things

1. **Who runs it** — GM or player? Players can't update actors they don't own and can't see unowned tokens' data; GM-only operations need a `game.user.isGM` guard with a friendly refusal.
2. **Actor selection model** — pick one deliberately:
   - selected tokens: `canvas.tokens.controlled` (GM workflows, batch operations)
   - the user's character: `game.user.character` (player convenience buttons)
   - targets: `game.user.targets` (offensive/applied effects)
   - the pf2e-standard fallback chain: `token?.actor ?? actor ?? game.user.character` (what official system macros use)
3. **Output** — chat card, dialog, actor update, or canvas change. Prefer posting results to chat: it keeps the table informed and creates an audit trail.

If the request is ambiguous on any of these, ask — a macro built on the wrong selection model feels broken at the table even when the code is correct.

## Workflow

1. Read `references/pf2e-api.md` (system API: actions, checks, conditions, damage) and `references/foundry-v14-api.md` (core API: dialogs, chat, compendia, v14 breaking changes). Recipes for complete common macros: `references/recipes.md`.
2. Write the macro as a plain async script body. Conventions that prevent most table-time failures:
   - Guard clauses first; report problems via `ui.notifications.warn(...)` — a macro that silently does nothing gets reported as a bug.
   - `await` every document create/update/delete and every roll you post.
   - User-facing strings can be in the campaign's language (Russian etc.); API slugs, statistic names, and condition slugs stay English (`"athletics"`, `"frightened"`).
   - Don't hardcode actor/token ids or names unless the user asks for a character-specific macro; prefer the selection model.
3. Check it against old-API traps (v14 killed several idioms — see the breaking-changes table in `references/foundry-v14-api.md`). This matters most when adapting macros found on Reddit/wikis, which are overwhelmingly v11-v13 era.
4. Deliver:
   - **Paste-in**: give the code plus one line of setup instructions ("create a Script macro, paste, drag to hotbar").
   - **Module pack**: for macros that belong to the campaign module, wrap in a Macro document JSON (`{"name", "type": "script", "img", "scope": "global", "command": "<code as JSON string>"}`) and hand off to the `foundry-pf2e` skill's build workflow. Watch the escaping — `command` is a JSON string; prefer template literals inside the code so you only escape `"` rarely.
5. Have the user test: paste the body into the console (F12) first — errors surface with real stack traces there, while the macro editor swallows them. Test the empty-selection case and (if relevant) as a player account, not just as GM.

## Verification checklist for every macro you hand over

- Runs with nothing selected → warns instead of throwing
- Runs with the wrong thing selected (loot token, vehicle) → filtered or warned
- All async calls awaited; no orphaned promises after the macro "finishes"
- No v13-era API (see breaking changes); no `Dialog`, no `MeasuredTemplate` document, no bare `mergeObject`
- Player-permission behavior considered
- Chat output attributed via `speaker` where it represents an actor's act
