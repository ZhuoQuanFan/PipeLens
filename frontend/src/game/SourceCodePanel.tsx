import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

import { requestDeepSeekEdit } from "../api/deepseek";
import type { PipeNode } from "../cases/nanogpt";
import { parseAnchorLines, sourceLinesFromFile } from "../cases/nanogptSource";
import { findWorkspaceFile } from "../workspace/workspaceStore";
import type { AiActivity, AiEditCandidate, PersonalWorkspace } from "../workspace/types";

type Props = {
  node: PipeNode;
  workspace: PersonalWorkspace | null;
  workspaceError: string | null;
  onImport: (files: FileList) => Promise<void>;
  onUpdateFile: (path: string, content: string) => Promise<void>;
  onAiActivity: (activity: AiActivity | null) => void;
};

export function SourceCodePanel({ node, workspace, workspaceError, onImport, onUpdateFile, onAiActivity }: Props) {
  const uploadRef = useRef<HTMLInputElement>(null);
  const requestTokenRef = useRef(0);
  const [instruction, setInstruction] = useState("");
  const [candidate, setCandidate] = useState<AiEditCandidate | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const file = findWorkspaceFile(workspace, node.anchor?.file);
  const previewSource = candidate?.updatedSource ?? file?.content ?? "";
  const lines = useMemo(() => sourceLinesFromFile(previewSource, node.anchor), [previewSource, node.anchor]);
  const range = parseAnchorLines(node.anchor);

  useEffect(() => {
    requestTokenRef.current += 1;
    setCandidate(null);
    setAiError(null);
    setRequesting(false);
    onAiActivity(null);
  }, [node.id, file?.path, onAiActivity]);

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files?.length) await onImport(event.target.files);
    event.target.value = "";
  }

  async function askForEdit() {
    if (!file || !instruction.trim()) return;
    setRequesting(true);
    setCandidate(null);
    setAiError(null);
    onAiActivity({ nodeId: node.id, phase: "inspecting" });
    const requestToken = ++requestTokenRef.current;
    try {
      const result = await requestDeepSeekEdit({
        filePath: file.path,
        source: file.content,
        instruction: instruction.trim(),
        selection: { label: node.label, line: node.anchor?.line },
        diagnostic: node.runtimeError,
      });
      if (requestToken !== requestTokenRef.current) return;
      setCandidate(result);
      onAiActivity({ nodeId: node.id, phase: "editing" });
    } catch (error) {
      if (requestToken !== requestTokenRef.current) return;
      setAiError(error instanceof Error ? error.message : "AI edit failed.");
      onAiActivity(null);
    } finally {
      if (requestToken === requestTokenRef.current) setRequesting(false);
    }
  }

  async function applyCandidate() {
    if (!file || !candidate) return;
    await onUpdateFile(file.path, candidate.updatedSource);
    setCandidate(null);
    setInstruction("");
    onAiActivity(null);
  }

  function discardCandidate() {
    setCandidate(null);
    onAiActivity(null);
  }

  return (
    <section className="source-code-panel" aria-label="Source code">
      <header>
        <div>
          <span>PERSONAL WORKSPACE</span>
          <strong>{workspace?.name ?? "Loading workspace…"}</strong>
        </div>
        <button type="button" className="workspace-upload" onClick={() => uploadRef.current?.click()}>
          Upload code
        </button>
        <input
          ref={uploadRef}
          className="workspace-file-input"
          type="file"
          multiple
          onChange={handleUpload}
          {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        />
      </header>

      <div className="source-location">
        <span>{file?.path ?? node.anchor?.file ?? "No matching uploaded file"}</span>
        <code>{node.anchor?.line ? `L${node.anchor.line.replace("-", "–")}` : "unmapped"}</code>
      </div>

      {workspaceError || !file ? (
        <div className="workspace-message">
          {workspaceError ?? `Upload a workspace containing ${node.anchor?.file ?? "this source file"}.`}
        </div>
      ) : (
        <div className="source-code-scroll" aria-label={`Source code for ${node.label}`}>
          {lines.map((line) => {
            const active = line.number >= range.start && line.number <= range.end;
            return (
              <div className={`source-code-line ${active ? "active" : ""}`} data-line={line.number} key={line.number}>
                <span>{line.number}</span><code>{line.text || " "}</code>
              </div>
            );
          })}
        </div>
      )}

      <div className="ai-edit-console">
        <div className="ai-edit-heading">
          <span className="deepseek-mark">DS</span>
          <div><strong>AI code edit</strong><small>DeepSeek Flash · review before applying</small></div>
        </div>
        <textarea
          aria-label="AI edit instruction"
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          placeholder={`Describe how to change ${node.label}…`}
          disabled={!file || requesting}
        />
        {aiError ? <p className="ai-edit-error">{aiError}</p> : null}
        {candidate ? <p className="ai-edit-summary"><strong>Edit ready</strong>{candidate.summary}</p> : null}
        <div className="ai-edit-actions">
          {candidate ? (
            <>
              <button type="button" className="secondary" onClick={discardCandidate}>Discard</button>
              <button type="button" onClick={applyCandidate}>Apply · Restart to verify</button>
            </>
          ) : (
            <button type="button" disabled={!file || !instruction.trim() || requesting} onClick={askForEdit}>
              {requesting ? "Inspecting…" : "Ask AI to modify"}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
