// SAVE PANEL — export/import JSON buttons behind ?debug (task t12 #5). The
// whole versioned SaveGame downloads as a blob; import validates + migrates via
// zod and refuses corrupt/newer documents without clobbering the live save.
// DOM only — the storage logic lives in core/save.ts.

import { getSave, exportSave, importSave, defaultBackend, loadSave } from '../core/save';

let built = false;

export function initSavePanel(): void {
  if (built || typeof document === 'undefined') return;
  built = true;

  const host = document.createElement('div');
  host.id = 'save-panel';
  document.body.appendChild(host);
  const style = document.createElement('style');
  style.textContent = `
    #save-panel {
      position: fixed; bottom: 8px; left: 8px; z-index: 30;
      display: flex; gap: 6px;
    }
    #save-panel button {
      font: 10px/1.4 ui-monospace, monospace; letter-spacing: 0.08em;
      background: #12242b; color: #9fe8ae; border: 1px solid #2a4a44; cursor: pointer;
      padding: 4px 8px;
    }
  `;
  document.head.appendChild(style);

  const exportBtn = document.createElement('button');
  exportBtn.textContent = 'EXPORT SAVE';
  exportBtn.addEventListener('click', () => {
    const save = getSave();
    if (!save) return;
    const blob = new Blob([exportSave(save)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'undertow-save.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });
  host.appendChild(exportBtn);

  const importBtn = document.createElement('button');
  importBtn.textContent = 'IMPORT SAVE';
  const file = document.createElement('input');
  file.type = 'file';
  file.accept = '.json,application/json';
  file.style.display = 'none';
  file.addEventListener('change', () => {
    const f = file.files?.[0];
    if (!f) return;
    void f.text().then((text) => {
      try {
        const save = importSave(text);
        const backend = defaultBackend();
        void backend.write(save).then(() => {
          void loadSave(backend).then(() => {
            // currentSave refreshes on the next load; show the new totals
            const note = document.createElement('div');
            note.textContent = `IMPORTED v${save.version} · ${save.meta.memoriesTotal} memories`;
            note.style.cssText = 'position:fixed;bottom:40px;left:8px;z-index:30;color:#9fe8ae;font:10px/1.4 monospace;';
            document.body.appendChild(note);
            setTimeout(() => note.remove(), 4000);
          });
        });
      } catch (err) {
        const note = document.createElement('div');
        note.textContent = `IMPORT REJECTED: ${err instanceof Error ? err.message : 'corrupt save'}`;
        note.style.cssText = 'position:fixed;bottom:40px;left:8px;z-index:30;color:#e8968a;font:10px/1.4 monospace;';
        document.body.appendChild(note);
        setTimeout(() => note.remove(), 5000);
      }
    });
  });
  host.appendChild(file);
  importBtn.addEventListener('click', () => file.click());
  host.appendChild(importBtn);
}