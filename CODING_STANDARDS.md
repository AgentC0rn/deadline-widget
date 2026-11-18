# Coding Standards

1. **Domain Vocabulary**: Use canonical terms from `GLOSSARY.md` (`Job`, `SheetJob`, `LocalJob`, `SourceSheet`, `Deadline`, `Overdue`, `MiniPill`, `ChecklistPanel`, `DeadlineAlert`, `AlertMode`, `Snooze`) in exported types, module interfaces, and UI labels. Do not introduce banned synonyms (`Task`, `Todo`, `DueDate`, `Alarm`) in domain modules.
2. **Deep Modules & Pure Core**: Keep business rules (`DeadlineTracker`, `SourceSheetSync`, settings validation) in `src/core/` completely free of Electron, DOM, or React imports. Inject external inputs (current timestamp `nowMs`, fetched CSV text) via parameters so behaviour is deterministic and testable at module seams.
3. **Strict TypeScript**: Avoid `any` and unsafe non-null assertions (`!`). Validate untrusted external data (persisted JSON on disk, CSV cells from Google Sheets, IPC payloads) defensively with safe fallbacks.
4. **Electron Security**: Keep `contextIsolation: true` and `nodeIntegration: false` on every `BrowserWindow`. Expose only typed, minimal operations via `contextBridge` in `electron/preload.ts`.
