import type { PipeEdge, PipeNode } from "../cases/nanogpt";

export type WorldPoint = { x: number; y: number };

export type WorldNode = {
  node: PipeNode;
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PipeWorldLayout = {
  nodes: WorldNode[];
  path: WorldPoint[];
  bypassPaths: BypassWorldPath[];
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
  const rowWidth = columns * NODE_WIDTH + Math.max(0, columns - 1) * X_GAP;
  const worldWidth = WORLD_PADDING_X * 2 + rowWidth;
  const worldHeight = WORLD_PADDING_Y * 2 + stages.length * NODE_HEIGHT + Math.max(0, stages.length - 1) * Y_GAP;
  const worldNodes: WorldNode[] = [];
  let nodeIndex = 0;

  stages.forEach((items, row) => {
    const stageWidth = items.length * NODE_WIDTH + Math.max(0, items.length - 1) * X_GAP;
    const centeredOffset = (rowWidth - stageWidth) / 2;
    items.forEach((node, column) => {
      worldNodes.push({
        node,
        index: nodeIndex,
        x: WORLD_PADDING_X + centeredOffset + column * (NODE_WIDTH + X_GAP),
        y: WORLD_PADDING_Y + row * (NODE_HEIGHT + Y_GAP),
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
  const path = buildOrthogonalPath(worldNodes, start, end);
  const bypassPaths = bypassEdges.flatMap((edge) => {
    const fromNode = edge.from === "$input" ? undefined : worldNodes.find((item) => item.node.id === edge.from);
    const toNode = edge.to === "$output" ? undefined : worldNodes.find((item) => item.node.id === edge.to);
    if (!toNode) return [];
    const from = fromNode
      ? { x: fromNode.x + fromNode.width / 2, y: fromNode.y + fromNode.height / 2 }
      : start;
    const to = { x: toNode.x + toNode.width / 2, y: toNode.y + toNode.height / 2 };
    const sameRow = Math.abs(from.y - to.y) < 1;
    const bypassPath = sameRow
      ? dedupePoints([
        from,
        { x: from.x, y: from.y - 100 },
        { x: to.x, y: to.y - 100 },
        to,
      ])
      : dedupePoints([
        from,
        { x: Math.max(from.x, to.x) + 150, y: from.y },
        { x: Math.max(from.x, to.x) + 150, y: to.y },
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

  return {
    nodes: worldNodes,
    path,
    bypassPaths,
    start,
    end,
    width: worldWidth,
    height: worldHeight,
    faultIndex: nodes.findIndex((node) => node.status === "fault"),
  };
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
