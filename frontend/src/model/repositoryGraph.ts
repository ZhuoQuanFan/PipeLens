import type { PipeNode } from "../cases/nanogpt";

export type RepositoryGraphNodeKind = "repository" | "module" | "class" | "function" | "method" | "external";
export type RepositoryGraphRelation = "contains" | "imports" | "calls";

export type RepositoryGraphNode = {
  id: string;
  label: string;
  kind: RepositoryGraphNodeKind;
  language?: string | null;
  anchor?: {
    file: string;
    start_line: number;
    end_line?: number | null;
    symbol?: string | null;
  } | null;
  tags: string[];
};

export type RepositoryGraphEdge = {
  id: string;
  source: string;
  target: string;
  relation: RepositoryGraphRelation;
  confidence: "extracted" | "inferred" | "ambiguous";
  anchor?: {
    file: string;
    start_line: number;
    end_line?: number | null;
    symbol?: string | null;
  } | null;
};

export type RepositoryGraph = {
  schema_version: number;
  root_id: string;
  nodes: RepositoryGraphNode[];
  edges: RepositoryGraphEdge[];
  summary: {
    files: number;
    symbols: number;
    imports: number;
    calls: number;
    external_dependencies: number;
  };
  warnings: string[];
};

export type ArchitectureView =
  | { kind: "overview" }
  | { kind: "upstream" | "downstream"; nodeId: string }
  | { kind: "route"; nodeId: string; targetId: string };

export function buildArchitecturePipe(graph: RepositoryGraph, view: ArchitectureView): PipeNode {
  const relationCounts = buildRelationCounts(graph);
  if (view.kind === "overview") return buildHierarchy(graph, relationCounts);

  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const start = byId.get(view.nodeId);
  if (!start) return buildHierarchy(graph, relationCounts);
  const routeIds = view.kind === "route"
    ? shortestRoute(graph, view.nodeId, view.targetId)
    : null;
  const nodeIds = routeIds ?? relatedReach(graph, view.nodeId, view.kind as "upstream" | "downstream");
  const visibleNodeIds = nodeIds.length ? nodeIds : [view.nodeId];
  const nodes = visibleNodeIds.map((id) => byId.get(id)).filter((node): node is RepositoryGraphNode => Boolean(node));
  const relationCount = graph.edges.filter((edge) => edge.relation !== "contains").length;
  const label = view.kind === "route"
    ? `Route · ${start.label}`
    : `${view.kind === "upstream" ? "Upstream" : "Downstream"} · ${start.label}`;

  return {
    id: `architecture:${view.kind}:${view.nodeId}:${view.kind === "route" ? view.targetId : "reach"}`,
    label,
    subtitle: view.kind === "route"
      ? routeIds?.length
        ? `${Math.max(0, nodes.length - 1)} authored hops`
        : `No authored directed route to ${byId.get(view.targetId)?.label ?? "target"}`
      : `${Math.max(0, nodes.length - 1)} reachable nodes · ${relationCount} repository relations`,
    level: "behavior",
    status: "neutral",
    piece: "machine",
    children: nodes.map((node) => graphNodeToPipe(node, relationCounts, false)),
  };
}

export function searchRepositoryGraph(graph: RepositoryGraph, query: string, limit = 8) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  return graph.nodes
    .filter((node) => node.kind !== "repository")
    .map((node) => {
      const haystack = [node.label, node.kind, node.language, node.anchor?.file, node.anchor?.symbol].filter(Boolean).join(" ").toLowerCase();
      const starts = node.label.toLowerCase().startsWith(normalized) || node.anchor?.symbol?.toLowerCase().startsWith(normalized);
      return { node, score: starts ? 0 : haystack.indexOf(normalized) };
    })
    .filter(({ score }) => score >= 0)
    .sort((left, right) => left.score - right.score || left.node.label.localeCompare(right.node.label))
    .slice(0, limit)
    .map(({ node }) => node);
}

export function relatedReach(graph: RepositoryGraph, startId: string, direction: "upstream" | "downstream", limit = 40) {
  const adjacency = new Map<string, string[]>();
  graph.nodes.forEach((node) => adjacency.set(node.id, []));
  graph.edges.filter((edge) => edge.relation !== "contains").forEach((edge) => {
    const source = direction === "downstream" ? edge.source : edge.target;
    const target = direction === "downstream" ? edge.target : edge.source;
    adjacency.get(source)?.push(target);
  });
  return breadthFirst(adjacency, startId, limit);
}

export function shortestRoute(graph: RepositoryGraph, startId: string, targetId: string) {
  if (startId === targetId) return [startId];
  const adjacency = new Map<string, string[]>();
  graph.nodes.forEach((node) => adjacency.set(node.id, []));
  graph.edges.filter((edge) => edge.relation !== "contains").forEach((edge) => adjacency.get(edge.source)?.push(edge.target));
  const queue = [startId];
  const previous = new Map<string, string | null>([[startId, null]]);
  while (queue.length) {
    const current = queue.shift()!;
    for (const next of adjacency.get(current) ?? []) {
      if (previous.has(next)) continue;
      previous.set(next, current);
      if (next === targetId) {
        const path = [targetId];
        let cursor: string | null = current;
        while (cursor) {
          path.push(cursor);
          cursor = previous.get(cursor) ?? null;
        }
        return path.reverse();
      }
      queue.push(next);
    }
  }
  return [];
}

function buildHierarchy(graph: RepositoryGraph, relationCounts: RelationCounts): PipeNode {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const children = new Map<string, string[]>();
  graph.edges.filter((edge) => edge.relation === "contains").forEach((edge) => {
    children.set(edge.source, [...(children.get(edge.source) ?? []), edge.target]);
  });
  const externalIds = graph.nodes.filter((node) => node.kind === "external").map((node) => node.id);

  function convert(nodeId: string, seen = new Set<string>()): PipeNode | null {
    const node = byId.get(nodeId);
    if (!node || seen.has(nodeId)) return null;
    const nextSeen = new Set(seen).add(nodeId);
    const childIds = [...(children.get(nodeId) ?? [])];
    if (nodeId === graph.root_id) childIds.push(...externalIds);
    const pipe = graphNodeToPipe(node, relationCounts, true);
    pipe.children = childIds.map((id) => convert(id, nextSeen)).filter((child): child is PipeNode => Boolean(child));
    return pipe;
  }

  const root = convert(graph.root_id) ?? {
    id: graph.root_id,
    label: "Repository Architecture",
    level: "behavior" as const,
    status: "neutral" as const,
  };
  root.label = "Repository Architecture";
  root.subtitle = `${graph.summary.files} modules · ${graph.summary.symbols} symbols · ${graph.summary.imports} imports · ${graph.summary.calls} calls`;
  return root;
}

function graphNodeToPipe(node: RepositoryGraphNode, relationCounts: RelationCounts, includeRelationSummary: boolean): PipeNode {
  const counts = relationCounts.get(node.id) ?? { outgoing: 0, incoming: 0 };
  const relationSummary = [
    counts.outgoing ? `${counts.outgoing} out` : "",
    counts.incoming ? `${counts.incoming} in` : "",
  ].filter(Boolean).join(" · ");
  return {
    id: node.id,
    label: node.label,
    subtitle: node.kind === "external" ? "external dependency" : includeRelationSummary ? relationSummary || node.language || undefined : node.kind,
    level: node.kind === "repository" ? "behavior" : node.kind === "module" || node.kind === "class" || node.kind === "external" ? "logic" : "function",
    status: "neutral",
    piece: node.kind === "module" || node.kind === "repository" || node.kind === "external" ? "machine" : node.kind === "class" ? "splitter" : "valve",
    anchor: node.anchor ? {
      file: node.anchor.file,
      symbol: node.anchor.symbol ?? undefined,
      line: node.anchor.end_line && node.anchor.end_line !== node.anchor.start_line
        ? `${node.anchor.start_line}-${node.anchor.end_line}`
        : String(node.anchor.start_line),
    } : undefined,
  };
}

type RelationCounts = Map<string, { outgoing: number; incoming: number }>;

function buildRelationCounts(graph: RepositoryGraph): RelationCounts {
  const counts: RelationCounts = new Map();
  graph.edges.forEach((edge) => {
    if (edge.relation === "contains") return;
    const source = counts.get(edge.source) ?? { outgoing: 0, incoming: 0 };
    source.outgoing += 1;
    counts.set(edge.source, source);
    const target = counts.get(edge.target) ?? { outgoing: 0, incoming: 0 };
    target.incoming += 1;
    counts.set(edge.target, target);
  });
  return counts;
}

function breadthFirst(adjacency: Map<string, string[]>, startId: string, limit: number) {
  const ordered = [startId];
  const seen = new Set(ordered);
  for (let index = 0; index < ordered.length && ordered.length < limit; index += 1) {
    const neighbors = [...(adjacency.get(ordered[index]) ?? [])].sort();
    for (const neighbor of neighbors) {
      if (seen.has(neighbor)) continue;
      seen.add(neighbor);
      ordered.push(neighbor);
      if (ordered.length >= limit) break;
    }
  }
  return ordered;
}
