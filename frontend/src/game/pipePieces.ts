import { Container, Graphics, Text } from "pixi.js";

import type { PipePiece } from "../cases/nanogpt";
import type { PipePortDirection, WorldNode } from "./pipeWorldModel";

const COPPER = 0xf3f7f9;
const COPPER_LIGHT = 0xffffff;
const COPPER_DARK = 0x91a2ad;
const INNER = 0xd2dde3;
const PANEL = 0xf8fbfd;
const METAL = 0xcbd5dc;
const METAL_DARK = 0x7b8a96;
const FLOW_BASE = 0xffffff;
const RED = 0xf05252;
const INK = 0x162330;
const MUTED = 0x72808c;

export type PieceRender = {
  container: Container;
  fill: Graphics;
};

export function renderPipePiece(worldNode: WorldNode, onOpen: () => void): PieceRender {
  const piece = worldNode.node.piece ?? fallbackPiece(worldNode);
  const container = new Container({ x: worldNode.x, y: worldNode.y });
  container.eventMode = "static";
  container.cursor = "pointer";
  container.on("pointertap", onOpen);

  if (piece === "machine" || piece === "blocked") {
    const shadow = new Graphics();
    shadow.roundRect(7, 9, worldNode.width, worldNode.height, 24).fill({ color: 0x263746, alpha: 0.12 });
    container.addChild(shadow);
  }

  const fill = new Graphics();
  switch (piece) {
    case "valve":
      drawValve(container, fill, worldNode);
      break;
    case "splitter":
      drawSplitter(container, fill, worldNode);
      break;
    case "junction":
      if (worldNode.node.edges?.some((edge) => edge.kind === "branch")) drawInlineMixer(container, fill, worldNode);
      else drawJunction(container, fill, worldNode);
      break;
    case "bypass":
      drawBypass(container, fill, worldNode);
      break;
    case "loop":
      drawLoop(container, fill, worldNode);
      break;
    case "blocked":
      drawBlocked(container, fill, worldNode);
      break;
    case "straight":
      drawStraight(container, fill, worldNode);
      break;
    default:
      drawMachine(container, fill, worldNode);
      break;
  }

  addLabels(container, worldNode, piece);
  if (worldNode.node.status === "fault") {
    if (worldNode.node.runtimeError) addRuntimeError(container, worldNode, worldNode.node.runtimeError);
    addFaultBadge(container, worldNode);
  }
  return { container, fill };
}

function fallbackPiece(worldNode: WorldNode): PipePiece {
  if (worldNode.node.level === "function" || worldNode.node.level === "logic") return "machine";
  if (worldNode.node.level === "dataflow") return "junction";
  return "straight";
}

function drawMachine(container: Container, fill: Graphics, node: WorldNode) {
  const cy = node.height / 2;
  const body = new Graphics();
  body.roundRect(0, 0, node.width, node.height, 24).fill({ color: PANEL });
  body.roundRect(0, 0, node.width, node.height, 24).stroke({ color: borderColor(node), width: borderWidth(node) });
  body.roundRect(10, 10, node.width - 20, 20, 10).fill({ color: node.node.status === "fault" ? 0xffe3e3 : 0xe7eef3 });
  body.roundRect(12, cy - 17, node.width - 24, 34, 12).fill({ color: 0xd9e2e8 });
  body.roundRect(18, cy - 11, node.width - 36, 22, 9).fill({ color: INNER });
  body.roundRect(23, cy - 7, node.width - 46, 14, 7).fill({ color: 0xb5c3cc });
  container.addChild(body);

  const glass = new Graphics();
  glass.roundRect(26, cy - 4, node.width - 52, 8, 4).fill({ color: 0x91a8b6, alpha: 0.5 });
  container.addChild(glass);
  addChannel(container, fill, node, cy - 6, 18, node.width - 36);
}

function drawValve(container: Container, fill: Graphics, node: WorldNode) {
  const body = new Graphics();
  body.roundRect(11, 31, node.width - 22, node.height - 45, 18).fill({ color: METAL });
  body.roundRect(11, 31, node.width - 22, node.height - 45, 18).stroke({ color: borderColor(node), width: borderWidth(node) });
  body.rect(0, node.height / 2 - 16, node.width, 32).fill({ color: COPPER_DARK });
  body.rect(0, node.height / 2 - 11, node.width, 22).fill({ color: COPPER });
  container.addChild(body);

  const wheel = new Graphics();
  const cx = node.width / 2;
  const cy = 29;
  wheel.circle(cx, cy, 23).stroke({ color: node.node.status === "fault" ? RED : METAL_DARK, width: 7 });
  wheel.circle(cx, cy, 7).fill({ color: METAL_DARK });
  for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 3) {
    wheel.moveTo(cx + Math.cos(angle) * 7, cy + Math.sin(angle) * 7);
    wheel.lineTo(cx + Math.cos(angle) * 22, cy + Math.sin(angle) * 22);
  }
  wheel.stroke({ color: METAL_DARK, width: 4 });
  container.addChild(wheel);
  addChannel(container, fill, node, node.height / 2 - 5, 12, node.width - 24);
}

function drawSplitter(container: Container, fill: Graphics, node: WorldNode) {
  const body = new Graphics();
  body.roundRect(9, 20, node.width - 18, node.height - 30, 20).fill({ color: PANEL });
  body.roundRect(9, 20, node.width - 18, node.height - 30, 20).stroke({ color: borderColor(node), width: borderWidth(node) });
  const cx = node.width / 2;
  const cy = node.height / 2;
  drawCopperBranch(body, 0, cy, cx, cy);
  drawCopperBranch(body, cx, cy, node.width - 3, cy - 28);
  drawCopperBranch(body, cx, cy, node.width - 3, cy);
  drawCopperBranch(body, cx, cy, node.width - 3, cy + 28);
  body.circle(cx, cy, 23).fill({ color: COPPER_DARK });
  body.circle(cx, cy, 16).fill({ color: COPPER_LIGHT });
  container.addChild(body);

  fill.moveTo(9, cy).lineTo(cx, cy).lineTo(node.width - 10, cy - 28).stroke({ color: FLOW_BASE, width: 7, alpha: 0.95 });
  fill.moveTo(cx, cy).lineTo(node.width - 10, cy).stroke({ color: FLOW_BASE, width: 7, alpha: 0.75 });
  fill.moveTo(cx, cy).lineTo(node.width - 10, cy + 28).stroke({ color: FLOW_BASE, width: 7, alpha: 0.55 });
  fill.scale.x = 0;
}

function drawJunction(container: Container, fill: Graphics, node: WorldNode) {
  const body = new Graphics();
  const cx = node.width / 2;
  const cy = node.height / 2;
  const ports: PipePortDirection[] = node.ports?.length ? node.ports : ["left", "right"];
  body.circle(cx, cy, 31).fill({ color: 0xffffff, alpha: 0.5 });
  body.circle(cx, cy, 31).stroke({ color: borderColor(node), width: borderWidth(node), alpha: 0.5 });
  ports.forEach((port) => {
    const point = portPoint(node, port);
    drawCopperBranch(body, point.x, point.y, cx, cy);
  });
  body.circle(cx, cy, 24).fill({ color: COPPER_DARK });
  body.circle(cx, cy, 16).fill({ color: COPPER_LIGHT });
  body.circle(cx, cy, 8).fill({ color: INNER });
  container.addChild(body);
  ports.forEach((port) => {
    const point = portPoint(node, port, 9);
    fill.moveTo(point.x, point.y).lineTo(cx, cy).stroke({ color: FLOW_BASE, width: 5, alpha: port === "right" ? 0.9 : 0.72, cap: "round" });
  });
  fill.alpha = 0;
}

function portPoint(node: WorldNode, port: PipePortDirection, inset = 0) {
  const cx = node.width / 2;
  const cy = node.height / 2;
  if (port === "left") return { x: inset, y: cy };
  if (port === "right") return { x: node.width - inset, y: cy };
  if (port === "top") return { x: cx, y: inset };
  return { x: cx, y: node.height - inset };
}

function drawInlineMixer(container: Container, fill: Graphics, node: WorldNode) {
  const body = new Graphics();
  const cx = node.width / 2;
  const cy = node.height / 2;
  drawCopperBranch(body, 0, cy, node.width, cy);
  body.circle(cx, cy, 32).fill({ color: 0xffffff, alpha: 0.58 });
  body.circle(cx, cy, 32).stroke({ color: borderColor(node), width: borderWidth(node), alpha: 0.55 });
  body.circle(cx, cy, 25).fill({ color: COPPER_DARK });
  body.circle(cx, cy, 17).fill({ color: COPPER_LIGHT });
  body.moveTo(cx - 11, cy - 10).quadraticCurveTo(cx - 2, cy, cx + 11, cy).stroke({ color: INNER, width: 5, cap: "round" });
  body.moveTo(cx - 11, cy + 10).quadraticCurveTo(cx - 2, cy, cx + 11, cy).stroke({ color: INNER, width: 5, cap: "round" });
  container.addChild(body);

  fill.moveTo(8, cy).lineTo(cx - 13, cy).stroke({ color: FLOW_BASE, width: 6, cap: "round" });
  fill.moveTo(cx - 10, cy - 9).quadraticCurveTo(cx - 2, cy, cx + 11, cy).lineTo(node.width - 8, cy).stroke({ color: FLOW_BASE, width: 5, cap: "round" });
  fill.moveTo(cx - 10, cy + 9).quadraticCurveTo(cx - 2, cy, cx + 11, cy).stroke({ color: FLOW_BASE, width: 4, alpha: 0.6, cap: "round" });
  fill.scale.x = 0;
}

function drawBypass(container: Container, fill: Graphics, node: WorldNode) {
  const body = new Graphics();
  body.roundRect(8, 18, node.width - 16, node.height - 28, 20).fill({ color: PANEL });
  body.roundRect(8, 18, node.width - 16, node.height - 28, 20).stroke({ color: borderColor(node), width: borderWidth(node) });
  const cy = node.height / 2;
  drawCopperBranch(body, 0, cy, node.width, cy);
  body.moveTo(22, cy).bezierCurveTo(36, cy - 62, node.width - 36, cy - 62, node.width - 22, cy).stroke({ color: COPPER_DARK, width: 24 });
  body.moveTo(22, cy).bezierCurveTo(36, cy - 62, node.width - 36, cy - 62, node.width - 22, cy).stroke({ color: COPPER, width: 16 });
  body.circle(22, cy, 12).fill({ color: COPPER_LIGHT });
  body.circle(node.width - 22, cy, 12).fill({ color: COPPER_LIGHT });
  container.addChild(body);
  fill.moveTo(10, cy).lineTo(node.width - 10, cy).stroke({ color: FLOW_BASE, width: 7 });
  fill.moveTo(22, cy).bezierCurveTo(36, cy - 62, node.width - 36, cy - 62, node.width - 22, cy).stroke({ color: FLOW_BASE, width: 5, alpha: 0.65 });
  fill.scale.x = 0;
}

function drawLoop(container: Container, fill: Graphics, node: WorldNode) {
  const body = new Graphics();
  body.roundRect(8, 15, node.width - 16, node.height - 25, 22).fill({ color: PANEL });
  body.roundRect(8, 15, node.width - 16, node.height - 25, 22).stroke({ color: borderColor(node), width: borderWidth(node) });
  const cx = node.width / 2;
  const cy = node.height / 2;
  body.circle(cx, cy, 38).stroke({ color: COPPER_DARK, width: 25 });
  body.circle(cx, cy, 38).stroke({ color: COPPER, width: 16 });
  body.moveTo(0, cy).lineTo(cx - 38, cy).stroke({ color: COPPER, width: 16 });
  body.moveTo(cx + 38, cy).lineTo(node.width, cy).stroke({ color: COPPER, width: 16 });
  container.addChild(body);
  fill.circle(cx, cy, 38).stroke({ color: FLOW_BASE, width: 6 });
  fill.moveTo(8, cy).lineTo(cx - 38, cy).stroke({ color: FLOW_BASE, width: 6 });
  fill.moveTo(cx + 38, cy).lineTo(node.width - 8, cy).stroke({ color: FLOW_BASE, width: 6 });
  fill.scale.x = 0;
}

function drawBlocked(container: Container, fill: Graphics, node: WorldNode) {
  const body = new Graphics();
  body.roundRect(8, 14, node.width - 16, node.height - 48, 20).fill({ color: 0xfff4f4 });
  body.roundRect(8, 14, node.width - 16, node.height - 48, 20).stroke({ color: RED, width: 4 });
  const cy = node.height / 2;
  body.moveTo(0, cy).lineTo(node.width * 0.43, cy).stroke({ color: COPPER_DARK, width: 28 });
  body.moveTo(0, cy).lineTo(node.width * 0.43, cy).stroke({ color: COPPER, width: 19 });
  body.moveTo(node.width * 0.57, cy).lineTo(node.width, cy).stroke({ color: COPPER_DARK, width: 28 });
  body.moveTo(node.width * 0.57, cy).lineTo(node.width, cy).stroke({ color: COPPER, width: 19 });
  body.circle(node.width / 2, cy, 22).fill({ color: RED, alpha: 0.14 }).stroke({ color: RED, width: 3, alpha: 0.55 });
  body.moveTo(node.width * 0.46, cy - 19).lineTo(node.width * 0.54, cy + 19).stroke({ color: RED, width: 6, cap: "round" });
  body.moveTo(node.width * 0.54, cy - 19).lineTo(node.width * 0.46, cy + 19).stroke({ color: RED, width: 6, cap: "round" });
  container.addChild(body);
  fill.moveTo(8, cy).lineTo(node.width * 0.42, cy).stroke({ color: FLOW_BASE, width: 7 });
  fill.scale.x = 0;
}

function drawStraight(container: Container, fill: Graphics, node: WorldNode) {
  const body = new Graphics();
  body.roundRect(8, 28, node.width - 16, node.height - 40, 18).fill({ color: PANEL });
  body.roundRect(8, 28, node.width - 16, node.height - 40, 18).stroke({ color: borderColor(node), width: borderWidth(node) });
  const cy = node.height / 2;
  drawCopperBranch(body, 0, cy, node.width, cy);
  container.addChild(body);
  fill.moveTo(8, cy).lineTo(node.width - 8, cy).stroke({ color: FLOW_BASE, width: 7 });
  fill.scale.x = 0;
}

function addChannel(container: Container, fill: Graphics, node: WorldNode, y: number, x: number, width: number) {
  const channel = new Graphics();
  channel.roundRect(x, y, width, 12, 6).fill({ color: INNER });
  fill.roundRect(x + 3, y + 3, width - 6, 6, 3).fill({ color: FLOW_BASE });
  fill.scale.x = 0;
  container.addChild(channel, fill);
}

function drawCopperBranch(graphics: Graphics, x1: number, y1: number, x2: number, y2: number) {
  graphics.moveTo(x1, y1).lineTo(x2, y2).stroke({ color: COPPER_DARK, width: 27 });
  graphics.moveTo(x1, y1).lineTo(x2, y2).stroke({ color: COPPER, width: 20 });
  graphics.moveTo(x1, y1 - 4).lineTo(x2, y2 - 4).stroke({ color: COPPER_LIGHT, width: 4, alpha: 0.72 });
}

function addLabels(container: Container, node: WorldNode, piece: PipePiece) {
  const pieceLabel = new Text({
    text: piece.toUpperCase(),
    style: { fontFamily: "Inter, Arial", fontSize: 9, fontWeight: "800", fill: node.node.status === "fault" ? RED : MUTED, letterSpacing: 1.2 },
  });
  pieceLabel.position.set(17, 8);
  container.addChild(pieceLabel);

  const title = new Text({
    text: canvasLabel(node.node.label),
    style: { fontFamily: "Inter, Arial", fontSize: piece === "machine" ? 13 : piece === "blocked" ? 13 : 15, fontWeight: "700", fill: INK, align: "center", wordWrap: true, wordWrapWidth: node.width - 32, lineHeight: piece === "machine" ? 14 : 18 },
  });
  title.anchor.set(0.5, 1);
  title.position.set(node.width / 2, node.height - 6);
  container.addChild(title);
}

function canvasLabel(label: string) {
  return label.replace("√dₖ", "sqrt(d_k)");
}

function addFaultBadge(container: Container, node: WorldNode) {
  const badge = new Graphics();
  badge.circle(node.width - 8, 8, 15).fill({ color: RED });
  badge.circle(node.width - 8, 8, 15).stroke({ color: 0xffffff, width: 4 });
  const mark = new Text({ text: "!", style: { fontFamily: "Arial", fontSize: 18, fontWeight: "900", fill: 0xffffff } });
  mark.anchor.set(0.5);
  mark.position.set(node.width - 8, 8);
  container.addChild(badge, mark);
}

function addRuntimeError(container: Container, node: WorldNode, message: string) {
  const width = Math.min(220, Math.max(132, node.width + 18));
  const height = 34;
  const x = (node.width - width) / 2;
  const y = -43;
  const panel = new Graphics();
  panel.roundRect(x, y, width, height, 10).fill({ color: 0x8f252b, alpha: 0.96 });
  panel.roundRect(x, y, width, height, 10).stroke({ color: 0xffffff, width: 2, alpha: 0.94 });
  panel.moveTo(node.width / 2 - 6, y + height).lineTo(node.width / 2, y + height + 7).lineTo(node.width / 2 + 6, y + height).fill({ color: 0x8f252b });
  const text = new Text({
    text: `ERROR · ${message}`,
    style: { fontFamily: "Inter, Arial", fontSize: 8, fontWeight: "800", fill: 0xffffff, align: "center", wordWrap: true, wordWrapWidth: width - 16, lineHeight: 10 },
  });
  text.anchor.set(0.5);
  text.position.set(node.width / 2, y + height / 2);
  container.addChild(panel, text);
}

function borderColor(node: WorldNode) {
  return node.node.status === "fault" ? RED : 0x93a3af;
}

function borderWidth(node: WorldNode) {
  return node.node.status === "fault" ? 4 : 2;
}
