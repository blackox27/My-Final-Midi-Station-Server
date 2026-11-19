/* Device-local project and binary assets; portable files embed every referenced asset. */
class ProjectStorage {
  constructor() {
    this.memory = new Map();
    this.dbPromise = null;
    this.onWarning = () => {};
  }
  async db() {
    if (!this.dbPromise)
      this.dbPromise = new Promise((resolve, reject) => {
        if (!globalThis.indexedDB)
          return reject(Error("IndexedDB indisponível"));
        const r = indexedDB.open("aurora-midi-v2", 1);
        r.onupgradeneeded = () => {
          r.result.createObjectStore("assets", { keyPath: "id" });
          r.result.createObjectStore("projects");
        };
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    return this.dbPromise;
  }
  async putAsset(asset) {
    this.memory.set(asset.id, asset);
    try {
      const db = await this.db();
      await new Promise((resolve, reject) => {
        const tx = db.transaction("assets", "readwrite");
        tx.objectStore("assets").put(asset);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } catch {
      this.onWarning(
        "O navegador não guardou o áudio. Salve um projeto portátil para preservar os arquivos.",
      );
    }
    return asset.id;
  }
  async getAsset(id) {
    if (this.memory.has(id)) return this.memory.get(id);
    const db = await this.db();
    const result = await new Promise((resolve, reject) => {
      const r = db.transaction("assets").objectStore("assets").get(id);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    if (!result)
      throw Error(
        "Arquivo de áudio ausente. Recarregue-o ou abra o projeto portátil.",
      );
    this.memory.set(id, result);
    return result;
  }
  capture(project) {
    this.lastSavedAt = Math.max(Date.now(), (this.lastSavedAt || 0) + 1);
    return {
      format: "Aurora autosave",
      savedAt: this.lastSavedAt,
      project: structuredClone(project),
    };
  }
  writeCheckpoint(record) {
    let previous;
    try {
      previous = JSON.parse(localStorage.getItem("aurora-midi-v2"));
    } catch {}
    if (
      previous?.format === "Aurora autosave" &&
      previous.savedAt > record.savedAt
    )
      return;
    localStorage.setItem("aurora-midi-v2", JSON.stringify(record));
  }
  checkpoint(project) {
    try {
      this.writeCheckpoint(this.capture(project));
    } catch {
      throw Error(
        "Salvamento automático indisponível. Salve um projeto portátil.",
      );
    }
  }
  async save(project, savedAt) {
    const record =
      savedAt === undefined
        ? this.capture(project)
        : {
            format: "Aurora autosave",
            savedAt,
            project: structuredClone(project),
          };
    let checkpointSaved = false;
    try {
      this.writeCheckpoint(record);
      checkpointSaved = true;
    } catch {}
    try {
      const db = await this.db();
      await new Promise((resolve, reject) => {
        const tx = db.transaction("projects", "readwrite");
        tx.objectStore("projects").put(record, "current");
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } catch {
      if (!checkpointSaved)
        throw Error(
          "Salvamento automático indisponível. Salve um projeto portátil.",
        );
    }
  }
  async load() {
    const candidates = [];
    try {
      const db = await this.db();
      const p = await new Promise((resolve, reject) => {
        const r = db
          .transaction("projects")
          .objectStore("projects")
          .get("current");
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      if (p) candidates.push(p);
    } catch {}
    for (const key of ["aurora-midi-v2", "aurora-midi-v1"]) {
      try {
        const p = JSON.parse(localStorage.getItem(key) || "null");
        if (p) candidates.push(p);
      } catch {}
    }
    const records = candidates.map((p) =>
      p.format === "Aurora autosave" ? p : { savedAt: 0, project: p },
    );
    records.sort((a, b) => b.savedAt - a.savedAt);
    for (const record of records) {
      try {
        const p = Core.validate(record.project);
        this.lastSavedAt = Math.max(this.lastSavedAt || 0, record.savedAt || 0);
        return p;
      } catch {}
    }
    if (records.length)
      throw Error(
        "Os salvamentos encontrados estão inválidos. Abra sua cópia portátil.",
      );
    return null;
  }
  async portable(project) {
    project = Core.validate(project);
    const ids = new Set(project.tracks.map((t) => t.sampleId).filter(Boolean));
    for (const bank of project.soundBanks) ids.add(bank.id);
    const assets = [];
    let total = 0;
    for (const id of ids) {
      const a = await this.getAsset(id);
      total += a.bytes.byteLength;
      if (total > 180 * 1024 * 1024)
        throw Error("Projeto portátil limitado a 180 MB de áudio.");
      const bytes = new Uint8Array(a.bytes);
      let s = "";
      for (let i = 0; i < bytes.length; i += 16384)
        s += String.fromCharCode(...bytes.subarray(i, i + 16384));
      assets.push({ id: a.id, name: a.name, type: a.type, base64: btoa(s) });
    }
    return JSON.stringify({
      format: "Aurora portable project",
      version: 3,
      project,
      assets,
    });
  }
  async importPortable(data) {
    if (
      !data ||
      data.format !== "Aurora portable project" ||
      !Array.isArray(data.assets) ||
      data.assets.length > 32
    )
      throw Error("Projeto portátil inválido.");
    const p = Core.validate(data.project),
      assets = [];
    let total = 0;
    const seen = new Set();
    for (const a of data.assets) {
      if (
        !a ||
        typeof a.id !== "string" ||
        seen.has(a.id) ||
        typeof a.base64 !== "string" ||
        a.base64.length > 250 * 1024 * 1024
      )
        throw Error("Áudio inválido no projeto.");
      seen.add(a.id);
      const raw = atob(a.base64);
      total += raw.length;
      if (total > 180 * 1024 * 1024)
        throw Error("Projeto excede 180 MB de áudio.");
      assets.push({
        id: a.id,
        name: String(a.name || "Áudio"),
        type: String(a.type || ""),
        bytes: Uint8Array.from(raw, (c) => c.charCodeAt(0)).buffer,
      });
    }
    for (const t of p.tracks)
      if (t.sampleId && !seen.has(t.sampleId))
        throw Error("O projeto não contém todos os samples.");
    for (const bank of p.soundBanks)
      if (!seen.has(bank.id))
        throw Error("Banco de sons ausente: " + bank.name);
    // Imported assets get new identities: undo and other saved projects keep their bytes.
    const remap = new Map(assets.map((a) => [a.id, Core.uid()]));
    for (const t of p.tracks) {
      if (t.sampleId) t.sampleId = remap.get(t.sampleId);
      if (t.soundBankId) t.soundBankId = remap.get(t.soundBankId);
    }
    for (const bank of p.soundBanks) bank.id = remap.get(bank.id);
    for (const a of assets) await this.putAsset({ ...a, id: remap.get(a.id) });
    return p;
  }
}
globalThis.ProjectStorage = ProjectStorage;
