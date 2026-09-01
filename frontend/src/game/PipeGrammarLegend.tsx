const ITEMS = [
  { kind: "machine", label: "Function", note: "computation" },
  { kind: "valve", label: "Valve", note: "transform / gate" },
  { kind: "splitter", label: "Splitter", note: "branch / multi-output" },
  { kind: "junction", label: "Junction", note: "merge / combine" },
  { kind: "bypass", label: "Bypass", note: "residual path" },
  { kind: "blocked", label: "Blocked", note: "fault boundary" },
] as const;

export function PipeGrammarLegend() {
  return (
    <section className="pipe-grammar" aria-label="Code-to-pipe visual grammar">
      <div className="pipe-grammar-heading">
        <span>CODE → PIPE GRAMMAR</span>
        <strong>Structure determines the game piece</strong>
      </div>
      <div className="pipe-grammar-items">
        {ITEMS.map((item) => (
          <div className="pipe-grammar-item" key={item.kind}>
            <i className={`pipe-grammar-icon ${item.kind}`} aria-hidden="true">
              <b />
            </i>
            <div>
              <strong>{item.label}</strong>
              <span>{item.note}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
