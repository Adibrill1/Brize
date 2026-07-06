# Brize Platform Architecture

**Date:** 2026-07-06
**Supersedes:** the travel-app framing of [`ARCHITECTURE_REVIEW.md`](ARCHITECTURE_REVIEW.md) (its local-first conclusions still stand)

Brize is no longer a travel application. It is a **generic platform where every
user owns independent worlds** — travel is simply the first application shipped
on it, as the *Travel* workspace template.

## Core principle: everything belongs to a Workspace

A workspace is an independent universe: *My Europe Trip*, *Family*, *Company*,
*Home*, *Research Project*. Every row in the database except device-global
settings carries a `workspaceId`, and the app always operates inside exactly
one active workspace.

```
Workspace
├── config            entity types, enabled modules, views, rules, AI policy, defaults, theme
├── Entities          the data — arbitrary, typed, field-bag records
├── Events            append-only log of every mutation (undo, audit, future sync)
├── Proposals         AI/automation change requests awaiting human approval
└── Settings          workspace-scoped key/value (budget target, sync state…)
```

## Layers

```
src/
├── core/            the engine — knows no domain
│   ├── db.js        Dexie schema (single source of truth) + v1→v2 migration
│   ├── entities.js  generic entity CRUD, always workspace-scoped, event-logged
│   ├── events.js    append-only event log + revert
│   ├── proposals.js AI proposal lifecycle: propose → approve/reject → revert
│   ├── workspaces.js workspace CRUD, active workspace, config helpers
│   ├── registry.js  capability registry
│   └── settings.js  global vs. workspace-scoped settings
├── templates/       domain knowledge as *data* (travel, blank, …)
├── modules/         installable capabilities (map, calendar, budget, ai, backup)
├── ui/              schema-driven editor + workspace switcher
└── main.js          the shell: boots core, mounts enabled capabilities
```

### 1. Domain-agnostic entities

An entity is `{ id, workspaceId, type, name, status, fields, meta, createdBy,
createdAt, updatedAt, rev }`. The engine never interprets `fields`; what an
entity *is* comes from the workspace configuration's **entity types** — id,
label, icon, statuses (with colors), and a field schema (`text`, `textarea`,
`number`, `date`, `select`). Accommodation, Vehicle, Task, Animal, Sensor,
Book — all just entity type definitions. The editor form is generated from
this schema at runtime; adding an entity type requires zero engine changes.

`meta` is reserved for module bookkeeping (e.g. the Google Calendar event id).
Writing it never bumps `rev`/`updatedAt` and is never logged as an edit, so
sync bookkeeping can never win a merge against a human edit.

### 2. Modular capabilities

Features are installable modules, not application code. Each capability calls
`registerCapability({ id, mount, render, onEntityDelete })` on import; the
shell mounts only the ones listed in `workspace.config.modules`. Capabilities
never see domain types — they read **capability bindings** that entity types
declare:

| Capability | Binding declared by an entity type                                  |
|-----------|----------------------------------------------------------------------|
| `map`     | `{ lat, lng }` — which fields hold coordinates                       |
| `calendar`| `{ start, end, statuses, subtitle }` — which fields make an event    |
| `budget`  | `{ amountPerDay, start, end, excludeStatuses }`                      |
| `ai`      | `{ actions: [{ id, label, system, instruction }] }` — prompts as config |
| `backup`  | none — exports/imports the whole workspace universe                  |

So the budget module can price hotel nights today and feed costs or server
hours tomorrow — it only ever sees field keys.

### 3. Templates: travel is just the first application

A template is pure data: entity types + default modules + defaults
(`src/templates/travel.js`, `src/templates/blank.js`). Creating a workspace
copies the template into `workspace.config`, which the user can then evolve
independently — enabled modules, entity types, statuses, AI prompts, defaults
and theme are all *configuration, not code*.

### 4. Projection architecture

IndexedDB (Dexie) is the single source of truth. Everything else — map
markers, calendar events, the budget chip, exports — is a projection that
renders from a read-only snapshot (`{ entities, visible, draft, filter }`)
and owns no data. Google Calendar in particular is one-way: the app only
touches events it created, and calendar-side edits are overwritten on the
next push.

### 5. AI never owns state

- AI **proposes**: `core/proposals.js` stores structured operations
  (`create`/`update`/`delete`) as a pending proposal.
- Users **approve**: only `approveProposal()` applies the operations, as
  ordinary events tagged `actor: 'ai'`.
- Every AI action is **reversible**: `revertProposal()` replays the recorded
  events backwards from their before-images.
- Text-only AI actions (like the travel template's outreach draft) never touch
  the store at all — the user copies and sends the result personally.
- AI prompts live in templates/config; the engine ships no domain prompts, and
  `workspace.config.ai` gates the capability per workspace.

### 6. Event log

Every entity mutation — human, AI or import — appends
`{ workspaceId, actor, action, entityId, before, after, ts }`. This gives
reversibility today and is the change feed a future sync engine will replay.
Conflict rule (already enforced by the import merge): **the latest human edit
wins; bookkeeping and automation never override a human edit.**

### 7. Offline first

Unchanged from V1 and inherited by every workspace: data lives on-device,
the service worker caches the app shell and map tiles, persistent storage is
requested, and backup export/import merges rather than wipes. Synchronization
is a later projection of the event log.

### 8. Collaboration-ready (not implemented)

The data model reserves the seams so no structural redesign is needed later:

- `workspace.owner` and `workspace.members[]` (today always `'local'` / empty)
  can become user ids with roles — single user, family, team, organization,
  public community are all membership policies on the same shape.
- `entity.createdBy` and `event.actor` already attribute every change.
- All queries are workspace-scoped, so per-workspace access control has a
  single choke point.

Nothing else about collaboration exists yet, by design.

## Migration

Dexie schema v2 upgrades existing installs in place: the v1 `stops` table
becomes entities of an auto-created *My Trip* travel workspace, trip-scoped
settings (budget target, about-me, calendar sync state) move to workspace
settings, and `googleEventId` moves to `entity.meta`. Legacy v1 backup files
are still importable and are folded into the active workspace.
