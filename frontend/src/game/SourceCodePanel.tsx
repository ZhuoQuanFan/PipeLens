import { useEffect, useRef } from "react";

import type { PipeNode } from "../cases/nanogpt";
import { nanoGptSourceUrl, parseAnchorLines, sourceLinesFor } from "../cases/nanogptSource";

export function SourceCodePanel({ node }: { node: PipeNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lines = sourceLinesFor(node.anchor);
  const range = parseAnchorLines(node.anchor);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const activeIndex = lines.findIndex((line) => line.number === range.start);
    const lineHeight = 19;
    scroller.scrollTop = Math.max(0, activeIndex * lineHeight - scroller.clientHeight / 2 + lineHeight / 2);
  }, [lines, node.id, range.start]);

  return (
    <section className="source-code-panel" aria-label="Source code">
      <header>
        <div>
          <span>SOURCE CODE</span>
          <strong>{node.anchor?.file ?? "model.py"}</strong>
        </div>
        <a href={nanoGptSourceUrl(node.anchor)} target="_blank" rel="noreferrer">GitHub ↗</a>
      </header>
      <div className="source-location" aria-live="polite">
        <span>{node.label}</span>
        <code>L{range.start}{range.end > range.start ? `–${range.end}` : ""}</code>
      </div>
      <div className="source-code-scroll" data-testid="source-code-scroll" ref={scrollRef}>
        {lines.map((line) => {
          const active = line.number >= range.start && line.number <= range.end;
          return (
            <div
              className={`source-code-line ${active ? "active" : ""}`}
              key={line.number}
              data-line={line.number}
            >
              <span>{line.number}</span>
              <code>{line.text || " "}</code>
            </div>
          );
        })}
      </div>
    </section>
  );
}
