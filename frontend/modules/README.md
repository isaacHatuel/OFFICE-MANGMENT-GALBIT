# Frontend Modules

- projectTable.js: Handles project table DOM creation, editing, saving to localStorage, negStatuses extraction, and syncing markers.
- journalStorage.js: Safe merging and writing of journalTasks without overwriting existing entries.
- unsynced.js: Highlights rows that haven't been synced to the server.
- productionTracking.js: Builds production tracking table and propagates negative statuses into project rows (now updates unified negStatuses as well as legacy neg1..3).
- journalUI.js: Initialization of journal tab (dynamic worker tabs, approval button, initial sync from projects -> journalTasks).

## negStatuses Migration
Legacy fields neg1/neg2/neg3 were replaced by unified array `negStatuses` (capped at 10 for safety). For backward compatibility the first three entries are mirrored back to neg1..neg2..neg3.

Updated behaviors:
- projectTable.js detects any header starting with "סטטוס שלילי" and stores collected non-empty cell values into `negStatuses`.
- productionTracking.js when a select changes recalculates negatives and sets both legacy neg1..3 and `negStatuses`.
- main.js creation, editing, API sync (manual + initial) populate `negStatuses` array and keep neg1..3 in sync; CSV export now includes a pipe-joined `negStatuses` column.

Next steps (optional future work):
1. Replace three fixed negative status inputs with a tag/multi-select component bound directly to `negStatuses`.
2. Remove direct references to neg1/neg2/neg3 in new code once backend supports flexible cardinality.
3. Server schema evolution: move from three nullable columns to a join table (project_board_negative_statuses) for unlimited negatives.

Future candidates for further extraction/refactor:
- Project dialog (form) logic into its own module.
- Journal table rendering to ES module with virtual DOM batching.
- Generic escaping/sanitization utilities.
