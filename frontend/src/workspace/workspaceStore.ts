import { sourceForDebugCase, type DebugCase } from "../cases/debugCases";
import type { PersonalWorkspace, WorkspaceFile } from "./types";

const DATABASE = "pipelens-personal-workspaces";
const STORE = "workspaces";
const ACTIVE_KEY = "pipelens.active-workspace";
const TEXT_EXTENSIONS = new Set(["py", "ts", "tsx", "js", "jsx", "json", "md", "css", "html", "yml", "yaml", "toml", "txt", "sh", "go", "rs", "java", "c", "cc", "cpp", "h", "hpp"]);
const MAX_FILE_SIZE = 750_000;

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) {
  const database = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(STORE, mode);
    const request = run(transaction.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

export function demoWorkspace(debugCase: DebugCase): PersonalWorkspace {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name: `${debugCase.title} workspace`,
    createdAt: now,
    updatedAt: now,
    kind: "demo",
    caseId: debugCase.id,
    files: [{ path: "model.py", content: sourceForDebugCase(debugCase), language: "python", updatedAt: now }],
  };
}

export async function loadCaseWorkspace(debugCase: DebugCase) {
  const workspace = demoWorkspace(debugCase);
  await saveWorkspace(workspace);
  return workspace;
}

export async function saveWorkspace(workspace: PersonalWorkspace) {
  await transact<IDBValidKey>("readwrite", (store) => store.put(workspace));
  localStorage.setItem(ACTIVE_KEY, workspace.id);
  return workspace;
}

function languageFor(path: string) {
  const extension = path.split(".").at(-1)?.toLowerCase();
  return extension === "py" ? "python" : extension === "ts" || extension === "tsx" ? "typescript" : extension ?? "text";
}

export async function workspaceFromUpload(fileList: FileList) {
  const selected = [...fileList].filter((file) => {
    const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
    return file.size <= MAX_FILE_SIZE && TEXT_EXTENSIONS.has(extension);
  });
  if (!selected.length) throw new Error("No supported text source files were selected.");
  const now = Date.now();
  const files: WorkspaceFile[] = await Promise.all(selected.map(async (file) => ({
    path: file.webkitRelativePath || file.name,
    content: await file.text(),
    language: languageFor(file.name),
    updatedAt: now,
  })));
  const firstPath = files[0].path;
  const rootName = firstPath.includes("/") ? firstPath.split("/")[0] : firstPath.replace(/\.[^.]+$/, "");
  return saveWorkspace({ id: crypto.randomUUID(), name: rootName || "Uploaded workspace", createdAt: now, updatedAt: now, kind: "uploaded", files });
}

export function findWorkspaceFile(workspace: PersonalWorkspace | null, requestedPath = "model.py") {
  if (!workspace) return undefined;
  return workspace.files.find((file) => file.path === requestedPath)
    ?? workspace.files.find((file) => file.path.endsWith(`/${requestedPath}`))
    ?? workspace.files.find((file) => file.path.endsWith(requestedPath));
}

export async function updateWorkspaceFile(workspace: PersonalWorkspace, path: string, content: string) {
  const now = Date.now();
  const next = {
    ...workspace,
    updatedAt: now,
    files: workspace.files.map((file) => file.path === path ? { ...file, content, updatedAt: now } : file),
  };
  await saveWorkspace(next);
  return next;
}
