import type { PipeEdge, PipeNode } from "../cases/nanogpt";

export type WorldPoint = { x: number; y: number };
export type PipePortDirection = "left" | "right" | "top" | "bottom";

export type WorldNode = {
  node: PipeNode;
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  flowDistance?: number;
  ports?: PipePortDirection[];
};

export type PipeWorldLayout = {
  nodes: WorldNode[];
  path: WorldPoint[];
  bypassPaths: BypassWorldPath[];
  branchPaths: BranchWorldPath[];
  start: WorldPoint;
  end: WorldPoint;
  width: number;
  height: number;
  faultIndex: number;
};

export type BypassWorldPath = {
  id: string;
  from: PipeEdge["from"];
  to: PipeEdge["to"];
  path: WorldPoint[];
  startDistance: number;
  endDistance: number;
};

export type BranchWorldPath = {
  id: string;
  path: WorldPoint[];
  startDistance: number;
  endDistance: number;
};

const NODE_WIDTH = 190;
const NODE_HEIGHT = 112;
const X_GAP = 150;
const Y_GAP = 190;
const WORLD_PADDING_X = 180;
const WORLD_PADDING_Y = 170;

/**
 * Lay code components into a serpentine game world instead of a screen grid.
 * The viewport/camera decides how much of this world is visible.
 */
export function layoutPipeWorld(nodes: PipeNode[], edges: PipeEdge[] = []): PipeWorldLayout {
  const bypassEdges = edges.filter((edge) => edge.kind === "bypass");
  if (bypassEdges.length) return layoutResidualWorld(nodes, bypassEdges);
  const branchEdges = edges.filter((edge) => edge.kind === "branch");
  if (isQkvBranchGraph(nodes, branchEdges)) return layoutQkvWorld(nodes);
  if (branchEdges.length) return layoutBranchWorld(nodes, branchEdges);

  const perRow = chooseWorldRowSize(nodes.length);
  const rows = Math.max(1, Math.ceil(nodes.length / perRow));
  const rowWidth = perRow * NODE_WIDTH + Math.max(0, perRow - 1) * X_GAP;
  const worldWidth = WORLD_PADDING_X * 2 + rowWidth;
  const worldHeight = WORLD_PADDING_Y * 2 + rows * NODE_HEIGHT + Math.max(0, rows - 1) * Y_GAP;

  const worldNodes: WorldNode[] = nodes.map((node, index) => {
    const row = Math.floor(index / perRow);
    const colInRow = index % perRow;
    const rowStart = row * perRow;
    const rowCount = Math.min(perRow, nodes.length - rowStart);
    const reverse = row % 2 === 1;
    const visualCol = reverse ? rowCount - 1 - colInRow : colInRow;
    const effectiveRowWidth = rowCount * NODE_WIDTH + Math.max(0, rowCount - 1) * X_GAP;
    const centeredOffset = (rowWidth - effectiveRowWidth) / 2;

    return {
      node,
      index,
      x: WORLD_PADDING_X + centeredOffset + visualCol * (NODE_WIDTH + X_GAP),
      y: WORLD_PADDING_Y + row * (NODE_HEIGHT + Y_GAP),
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    };
  });

  const start = worldNodes.length
    ? { x: worldNodes[0].x - 130, y: worldNodes[0].y + NODE_HEIGHT / 2 }
    : { x: WORLD_PADDING_X, y: WORLD_PADDING_Y };
  const end = worldNodes.length
    ? { x: worldNodes.at(-1)!.x + NODE_WIDTH + 130, y: worldNodes.at(-1)!.y + NODE_HEIGHT / 2 }
    : { x: WORLD_PADDING_X + 300, y: WORLD_PADDING_Y };

  const path = buildOrthogonalPath(worldNodes, start, end);

  return {
    nodes: worldNodes,
    path,
    bypassPaths: [],
    branchPaths: [],
    start,
    end,
    width: worldWidth,
    height: worldHeight,
    faultIndex: nodes.findIndex((node) => node.status === "fault"),
  };
}

function layoutResidualWorld(nodes: PipeNode[], bypassEdges: PipeEdge[]): PipeWorldLayout {
  const targetIndexes = new Set(
    bypassEdges
      .map((edge) => nodes.findIndex((node) => node.id === edge.to))
      .filter((index) => index >= 0),
  );
  const stages: PipeNode[][] = [];
  let stage: PipeNode[] = [];
  nodes.forEach((node, index) => {
    stage.push(node);
    if (targetIndexes.has(index)) {
      stages.push(stage);
      stage = [];
    }
  });
  if (stage.length) stages.push(stage);

  const columns = Math.max(1, ...stages.map((items) => items.length));
  const residualXGap = 122;
  const residualYGap = 152;
  const rowWidth = columns * NODE_WIDTH + Math.max(0, columns - 1) * residualXGap;
  const worldWidth = WORLD_PADDING_X * 2 + rowWidth;
  const worldHeight = 126 * 2 + stages.length * NODE_HEIGHT + Math.max(0, stages.length - 1) * residualYGap;
  const worldNodes: WorldNode[] = [];
  let nodeIndex = 0;

  stages.forEach((items, row) => {
    const stageWidth = items.length * NODE_WIDTH + Math.max(0, items.length - 1) * X_GAP;
    const centeredOffset = (rowWidth - stageWidth) / 2;
    items.forEach((node, column) => {
      worldNodes.push({
        node,
        index: nodeIndex,
        x: WORLD_PADDING_X + centeredOffset + column * (NODE_WIDTH + residualXGap),
        y: 126 + row * (NODE_HEIGHT + residualYGap),
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      });
      nodeIndex += 1;
    });
  });

  const start = worldNodes.length
    ? { x: worldNodes[0].x - 130, y: worldNodes[0].y + NODE_HEIGHT / 2 }
    : { x: WORLD_PADDING_X, y: WORLD_PADDING_Y };
  const end = worldNodes.length
    ? { x: worldNodes.at(-1)!.x + NODE_WIDTH + 130, y: worldNodes.at(-1)!.y + NODE_HEIGHT / 2 }
    : { x: WORLD_PADDING_X + 300, y: WORLD_PADDING_Y };
  const stageWorldNodes = stages.map((items) => items.map((item) => worldNodes.find((node) => node.node.id === item.id)!));
  const path = buildResidualMainPath(stageWorldNodes, start, end);
  const bypassPaths = bypassEdges.flatMap((edge) => {
    const fromNode = edge.from === "$input" ? undefined : worldNodes.find((item) => item.node.id === edge.from);
    const toNode = edge.to === "$output" ? undefined : worldNodes.find((item) => item.node.id === edge.to);
    if (!toNode) return [];
    const from = fromNode
      ? { x: fromNode.x + fromNode.width / 2, y: fromNode.y + fromNode.height / 2 }
      : start;
    const to = { x: toNode.x + toNode.width / 2, y: toNode.y + toNode.height / 2 };
    const inputBypass = edge.from === "$input";
    const bypassPath = inputBypass
      ? dedupePoints([
        from,
        { x: from.x, y: from.y - 78 },
        { x: to.x, y: to.y - 78 },
        to,
      ])
      : dedupePoints([
        from,
        to,
      ]);
    return [{
      id: edge.id,
      from: edge.from,
      to: edge.to,
      path: bypassPath,
      startDistance: distanceAlongPath(path, from),
      endDistance: distanceAlongPath(path, to),
    }];
  });
  assignJunctionPorts(worldNodes, [path, ...bypassPaths.map((bypass) => bypass.path)]);

  return {
    nodes: worldNodes,
    path,
    bypassPaths,
    branchPaths: [],
    start,
    end,
    width: worldWidth,
    height: worldHeight,
    faultIndex: nodes.findIndex((node) => node.status === "fault"),
  };
}

function buildResidualMainPath(stages: WorldNode[][], start: WorldPoint, end: WorldPoint): WorldPoint[] {
  if (!stages.length) return [start, end];
  const points: WorldPoint[] = [start];

  stages.forEach((stage, stageIndex) => {
    if (!stage.length) return;
    const centers = stage.map(centerOf);
    if (stageIndex > 0) {
      const previousMergeNode = stages[stageIndex - 1].at(-1)!;
      const previousMerge = centerOf(previousMergeNode);
      const stageStart = centers[0];
      const gutterY = (previousMerge.y + stageStart.y) / 2;
      const transitionX = previousMergeNode.x + previousMergeNode.width + 72;
      points.push(
        { x: transitionX, y: previousMerge.y },
        { x: transitionX, y: gutterY },
        { x: stageStart.x, y: gutterY },
        stageStart,
      );
    } else {
      points.push(centers[0]);
    }
    centers.slice(1).forEach((center) => points.push(center));
  });

  points.push(end);
  return dedupePoints(points);
}

function assignJunctionPorts(worldNodes: WorldNode[], paths: WorldPoint[][]) {
  worldNodes.forEach((worldNode) => {
    if (worldNode.node.piece !== "junction") return;
    const center = centerOf(worldNode);
    const ports = new Set<PipePortDirection>();
    paths.forEach((path) => {
      path.forEach((point, index) => {
        if (!samePoint(point, center)) return;
        const previous = path[index - 1];
        const next = path[index + 1];
        if (previous) ports.add(portDirection(center, previous));
        if (next) ports.add(portDirection(center, next));
      });
    });
    worldNode.ports = [...ports];
  });
}

function samePoint(left: WorldPoint, right: WorldPoint) {
  return Math.abs(left.x - right.x) < 0.5 && Math.abs(left.y - right.y) < 0.5;
}

function portDirection(center: WorldPoint, adjacent: WorldPoint): PipePortDirection {
  const dx = adjacent.x - center.x;
  const dy = adjacent.y - center.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? "left" : "right";
  return dy < 0 ? "top" : "bottom";
}

function layoutBranchWorld(nodes: PipeNode[], branchEdges: PipeEdge[]): PipeWorldLayout {
  const incomingCounts = new Map<string, number>();
  branchEdges.forEach((edge) => {
    if (edge.to !== "$output") incomingCounts.set(edge.to, (incomingCounts.get(edge.to) ?? 0) + 1);
  });
  const mergeId = [...incomingCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
  const mergeNode = nodes.find((node) => node.id === mergeId) ?? nodes.at(-1);
  const branchNodes = nodes.filter((node) => node.id !== mergeNode?.id);
  if (!mergeNode || !branchNodes.length) return layoutPipeWorld(nodes);

  const branchGap = 90;
  const worldWidth = 1_300;
  const worldHeight = WORLD_PADDING_Y * 2 + branchNodes.length * NODE_HEIGHT + Math.max(0, branchNodes.length - 1) * branchGap;
  const branchX = WORLD_PADDING_X + 210;
  const branchWorldNodes: WorldNode[] = branchNodes.map((node, index) => ({
    node,
    index,
    x: branchX,
    y: WORLD_PADDING_Y + index * (NODE_HEIGHT + branchGap),
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  }));
  const firstCenter = centerOf(branchWorldNodes[0]);
  const lastCenter = centerOf(branchWorldNodes.at(-1)!);
  const mergeWorldNode: WorldNode = {
    node: mergeNode,
    index: branchNodes.length,
    x: branchX + NODE_WIDTH + 270,
    y: (firstCenter.y + lastCenter.y) / 2 - NODE_HEIGHT / 2,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  };
  const mergeCenter = centerOf(mergeWorldNode);
  const start = { x: WORLD_PADDING_X, y: mergeCenter.y };
  const end = { x: mergeWorldNode.x + NODE_WIDTH + 150, y: mergeCenter.y };
  const path = dedupePoints([
    start,
    { x: branchX - 90, y: start.y },
    { x: branchX - 90, y: firstCenter.y },
    firstCenter,
    { x: mergeWorldNode.x - 90, y: firstCenter.y },
    { x: mergeWorldNode.x - 90, y: mergeCenter.y },
    mergeCenter,
    end,
  ]);
  const branchDistance = distanceAlongPath(path, firstCenter);
  const mergeDistance = distanceAlongPath(path, mergeCenter);
  branchWorldNodes.forEach((node) => { node.flowDistance = branchDistance; });
  mergeWorldNode.flowDistance = mergeDistance;

  const branchPaths: BranchWorldPath[] = branchWorldNodes.slice(1).map((worldNode) => {
    const center = centerOf(worldNode);
    return {
      id: `branch:${worldNode.node.id}`,
      path: dedupePoints([
        start,
        { x: branchX - 90, y: start.y },
        { x: branchX - 90, y: center.y },
        center,
        { x: mergeWorldNode.x - 90, y: center.y },
        { x: mergeWorldNode.x - 90, y: mergeCenter.y },
        mergeCenter,
      ]),
      startDistance: 0,
      endDistance: mergeDistance,
    };
  });
  const worldNodes = [...branchWorldNodes, mergeWorldNode];

  return {
    nodes: worldNodes,
    path,
    bypassPaths: [],
    branchPaths,
    start,
    end,
    width: worldWidth,
    height: worldHeight,
    faultIndex: worldNodes.findIndex((item) => item.node.status === "fault"),
  };
}

function isQkvBranchGraph(nodes: PipeNode[], branchEdges: PipeEdge[]) {
  const ids = new Set(nodes.map((node) => node.id));
  return ["qkv", "q-heads", "k-heads", "v-heads", "attention-score", "weighted-value", "output-proj"]
    .every((id) => ids.has(id))
    && branchEdges.filter((edge) => edge.from === "qkv").length === 3;
}

/**
 * Q, K and V are real dataflow branches: Q/K merge at score computation while
 * V stays independent until the weighted-value junction.
 */
function layoutQkvWorld(nodes: PipeNode[]): PipeWorldLayout {
  const positions: Record<string, { x: number; y: number }> = {
    qkv: { x: 220, y: 330 },
    "q-heads": { x: 650, y: 100 },
    "k-heads": { x: 560, y: 330 },
    "v-heads": { x: 650, y: 560 },
    "attention-score": { x: 860, y: 330 },
    "weighted-value": { x: 1180, y: 450 },
    "output-proj": { x: 1480, y: 450 },
  };
  const worldNodes: WorldNode[] = nodes.map((node, index) => ({
    node,
    index,
    ...(positions[node.id] ?? { x: 220 + index * (NODE_WIDTH + X_GAP), y: 330 }),
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  }));
  const byId = (id: string) => worldNodes.find((item) => item.node.id === id)!;
  const splitter = byId("qkv");
  const qHeads = byId("q-heads");
  const kHeads = byId("k-heads");
  const vHeads = byId("v-heads");
  const score = byId("attention-score");
  const values = byId("weighted-value");
  const output = byId("output-proj");
  const splitterCenter = centerOf(splitter);
  const qCenter = centerOf(qHeads);
  const kCenter = centerOf(kHeads);
  const vCenter = centerOf(vHeads);
  const scoreCenter = centerOf(score);
  const valuesCenter = centerOf(values);
  const outputCenter = centerOf(output);
  const splitterRight = splitter.x + splitter.width;
  const qOutlet = { x: splitterRight, y: splitterCenter.y - 28 };
  const kOutlet = { x: splitterRight, y: splitterCenter.y };
  const vOutlet = { x: splitterRight, y: splitterCenter.y + 28 };
  const start = { x: 80, y: splitterCenter.y };
  const end = { x: output.x + output.width + 150, y: outputCenter.y };
  const path = dedupePoints([
    start,
    splitterCenter,
    qOutlet,
    { x: 520, y: qOutlet.y },
    { x: 520, y: qCenter.y },
    qCenter,
    { x: scoreCenter.x, y: qCenter.y },
    scoreCenter,
    { x: 1080, y: scoreCenter.y },
    { x: 1080, y: valuesCenter.y },
    valuesCenter,
    outputCenter,
    end,
  ]);
  const splitDistance = distanceAlongPath(path, splitterCenter);
  const scoreDistance = distanceAlongPath(path, scoreCenter);
  const valuesDistance = distanceAlongPath(path, valuesCenter);
  const kPath = dedupePoints([kOutlet, kCenter, scoreCenter]);
  const vPath = dedupePoints([
    vOutlet,
    { x: 520, y: vOutlet.y },
    { x: 520, y: vCenter.y },
    vCenter,
    { x: valuesCenter.x, y: vCenter.y },
    valuesCenter,
  ]);
  const branchPaths: BranchWorldPath[] = [
    { id: "branch:k", path: kPath, startDistance: splitDistance, endDistance: scoreDistance },
    { id: "branch:v", path: vPath, startDistance: splitDistance, endDistance: valuesDistance },
  ];

  splitter.flowDistance = splitDistance;
  qHeads.flowDistance = distanceAlongPath(path, qCenter);
  kHeads.flowDistance = splitDistance + (scoreDistance - splitDistance) * 0.55;
  vHeads.flowDistance = splitDistance + (valuesDistance - splitDistance) * 0.55;
  score.flowDistance = scoreDistance;
  values.flowDistance = valuesDistance;
  output.flowDistance = distanceAlongPath(path, outputCenter);
  assignJunctionPorts(worldNodes, [path, kPath, vPath]);

  return {
    nodes: worldNodes,
    path,
    bypassPaths: [],
    branchPaths,
    start,
    end,
    width: 1_900,
    height: 850,
    faultIndex: worldNodes.findIndex((item) => item.node.status === "fault"),
  };
}

function centerOf(node: WorldNode): WorldPoint {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
}

function distanceAlongPath(path: WorldPoint[], target: WorldPoint) {
  let distance = 0;
  let closestDistance = 0;
  let closestOffset = Number.POSITIVE_INFINITY;
  for (let index = 1; index < path.length; index += 1) {
    const start = path[index - 1];
    const end = path[index];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    const ratio = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((target.x - start.x) * dx + (target.y - start.y) * dy) / lengthSquared));
    const projection = { x: start.x + dx * ratio, y: start.y + dy * ratio };
    const offset = Math.hypot(target.x - projection.x, target.y - projection.y);
    if (offset < closestOffset) {
      closestOffset = offset;
      closestDistance = distance + Math.sqrt(lengthSquared) * ratio;
    }
    distance += Math.sqrt(lengthSquared);
  }
  return closestDistance;
}

function chooseWorldRowSize(count: number): number {
  if (count <= 4) return Math.max(1, count);
  if (count <= 8) return 4;
  if (count <= 15) return 5;
  if (count <= 30) return 6;
  return 7;
}

function buildOrthogonalPath(nodes: WorldNode[], start: WorldPoint, end: WorldPoint): WorldPoint[] {
  if (!nodes.length) return [start, end];
  const points: WorldPoint[] = [start];

  nodes.forEach((worldNode, index) => {
    const center = {
      x: worldNode.x + worldNode.width / 2,
      y: worldNode.y + worldNode.height / 2,
    };

    if (index === 0) {
      points.push({ x: worldNode.x, y: center.y }, center);
      return;
    }

    const previous = nodes[index - 1];
    const previousCenter = {
      x: previous.x + previous.width / 2,
      y: previous.y + previous.height / 2,
    };
    const sameRow = Math.abs(previousCenter.y - center.y) < 1;

    if (sameRow) {
      const direction = center.x > previousCenter.x ? 1 : -1;
      points.push(
        { x: previousCenter.x + direction * previous.width / 2, y: previousCenter.y },
        { x: center.x - direction * worldNode.width / 2, y: center.y },
        center,
      );
      return;
    }

    const turnX = previousCenter.x;
    points.push(
      { x: turnX, y: previous.y + previous.height / 2 },
      { x: turnX, y: center.y },
      center,
    );
  });

  const last = nodes.at(-1)!;
  const lastCenter = { x: last.x + last.width / 2, y: last.y + last.height / 2 };
  const direction = end.x >= lastCenter.x ? 1 : -1;
  points.push(
    { x: lastCenter.x + direction * last.width / 2, y: lastCenter.y },
    end,
  );

  return dedupePoints(points);
}

function dedupePoints(points: WorldPoint[]): WorldPoint[] {
  return points.filter((point, index) => {
    if (index === 0) return true;
    const previous = points[index - 1];
    return previous.x !== point.x || previous.y !== point.y;
  });
}

export function pathMetrics(path: WorldPoint[]) {
  const segmentLengths: number[] = [];
  let totalLength = 0;
  for (let index = 1; index < path.length; index += 1) {
    const dx = path[index].x - path[index - 1].x;
    const dy = path[index].y - path[index - 1].y;
    const length = Math.hypot(dx, dy);
    segmentLengths.push(length);
    totalLength += length;
  }
  return { segmentLengths, totalLength };
}

export function pointAtDistance(path: WorldPoint[], distance: number): WorldPoint {
  if (!path.length) return { x: 0, y: 0 };
  if (path.length === 1) return path[0];

  const { segmentLengths, totalLength } = pathMetrics(path);
  let remaining = Math.max(0, Math.min(totalLength, distance));

  for (let index = 0; index < segmentLengths.length; index += 1) {
    const length = segmentLengths[index];
    if (remaining <= length || index === segmentLengths.length - 1) {
      const start = path[index];
      const end = path[index + 1];
      const ratio = length === 0 ? 0 : remaining / length;
      return {
        x: start.x + (end.x - start.x) * ratio,
        y: start.y + (end.y - start.y) * ratio,
      };
    }
    remaining -= length;
  }

  return path.at(-1)!;
}
