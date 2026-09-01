import { Container, Graphics, Text } from "pixi.js";

import type { PipePiece } from "../cases/nanogpt";
import type { WorldNode } from "./pipeWorldModel";

const COPPER = 0xb97942;
const COPPER_LIGHT = 0xe5ae74;
const COPPER_DARK = 0x68472f;
const INNER = 0x273947;
const PANEL = 0xf8fbfd;
const METAL = 0xcbd5dc;
const METAL_DARK = 0x7b8a96;
const BLUE = 0x35a7ff;
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

  const shadow = new Graphics();
  shadow.roundRect(8, 11, worldNode.width, worldNode.height, 24).fill({ color: 0x263746, alpha: 0.16 });
  container.addChild(shadow);

  const fill = new Graphics();
  switch (piece) {
    case "valve":
      drawValve(container, fill, worldNode);
      break;
    case "splitter":
      drawSplitter(container, fill, worldNode);
      break;
    case "junction":
      drawJunction(container, fill, worldNode);
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
  if (worldNode.node.status === "fault") addFaultBadge(container, worldNode);
  return { container, fill };
}

function fallbackPiece(worldNode: WorldNode): PipePiece {
  if (worldNode.node.level === "function" || worldNode.node.level === "logic") return "machine";
  if (worldNode.node.level === "dataflow") return "junction";
  return "straight";
}

function drawMachine(container: Container, fill: Graphics, node: WorldNode) {
  const body = new Graphics();
  body.roundRect(0, 0, node.width, node.height, 24).fill({ color: PANEL });
  body.roundRect(0, 0, node.width, node.height, 24).stroke({ color: borderColor(node), width: borderWidth(node) });
  body.roundRect(10, 10, node.width - 20, 20, 10).fill({ color: node.node.status === "fault" ? 0xffe3e3 : 0xe7eef3 });
  body.roundRect(17, 38, node.width - 34, 44, 11).fill({ color: 0xe2e8ed });
  body.roundRect(23, 44, node.width - 46, 32, 8).fill({ color: 0xb9c5cd });
  container.addChild(body);

  for (let index = 0; index < 3; index += 1) {
    const vent = new Graphics();
    vent.roundRect(34 + index * 34, 51, 18, 4, 2).fill({ color: 0x7d8b96 });
    vent.roundRect(34 + index * 34, 61, 18, 4, 2).fill({ color: 0x7d8b96 });
    container.addChild(vent);
  }
  addChannel(container, fill, node, node.height - 27, 24, node.width - 48);
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
  const cy = node.height / 2 + 9;
  drawCopperBranch(body, 0, cy, cx, cy);
  drawCopperBranch(body, cx, cy, node.width - 3, cy - 28);
  drawCopperBranch(body, cx, cy, node.width - 3, cy + 28);
  body.circle(cx, cy, 23).fill({ color: COPPER_DARK });
  body.circle(cx, cy, 16).fill({ color: COPPER_LIGHT });
  container.addChild(body);

  fill.moveTo(9, cy).lineTo(cx, cy).lineTo(node.width - 10, cy - 28).stroke({ color: BLUE, width: 7, alpha: 0.95 });
  fill.moveTo(cx, cy).lineTo(node.width - 10, cy + 28).stroke({ color: BLUE, width: 7, alpha: 0.55 });
  fill.scale.x = 0;
}

function drawJunction(container: Container, fill: Graphics, node: WorldNode) {
  const body = new Graphics();
  body.roundRect(7, 18, node.width - 14, node.height - 28, 28).fill({ color: PANEL });
  body.roundRect(7, 18, node.width - 14, node.height - 28, 28).stroke({ color: borderColor(node), width: borderWidth(node) });
  const cx = node.width / 2;
  const cy = node.height / 2 + 10;
  drawCopperBranch(body, 0, cy - 26, cx - 12, cy);
  drawCopperBranch(body, 0, cy + 26, cx - 12, cy);
  drawCopperBranch(body, cx - 12, cy, node.width, cy);
  body.circle(cx - 4, cy, 29).fill({ color: COPPER_DARK });
  body.circle(cx - 4, cy, 20).fill({ color: COPPER_LIGHT });
  container.addChild(body);
  fill.moveTo(10, cy - 26).lineTo(cx - 4, cy).lineTo(node.width - 10, cy).stroke({ color: BLUE, width: 7 });
  fill.moveTo(10, cy + 26).lineTo(cx - 4, cy).stroke({ color: BLUE, width: 7, alpha: 0.55 });
  fill.scale.x = 0;
}

function drawBypass(container: Container, fill: Graphics, node: WorldNode) {
  const body = new Graphics();
  body.roundRect(8, 18, node.width - 16, node.height - 28, 20).fill({ color: PANEL });
  body.roundRect(8, 18, node.width - 16, node.height - 28, 20).stroke({ color: borderColor(node), width: borderWidth(node) });
  const cy = node.height / 2 + 14;
  drawCopperBranch(body, 0, cy, node.width, cy);
  body.moveTo(22, cy).bezierCurveTo(36, cy - 62, node.width - 36, cy - 62, node.width - 22, cy).stroke({ color: COPPER_DARK, width: 24 });
  body.moveTo(22, cy).bezierCurveTo(36, cy - 62, node.width - 36, cy - 62, node.width - 22, cy).stroke({ color: COPPER, width: 16 });
  body.circle(22, cy, 12).fill({ color: COPPER_LIGHT });
  body.circle(node.width - 22, cy, 12).fill({ color: COPPER_LIGHT });
  container.addChild(body);
  fill.moveTo(10, cy).lineTo(node.width - 10, cy).stroke({ color: BLUE, width: 7 });
  fill.moveTo(22, cy).bezierCurveTo(36, cy - 62, node.width - 36, cy - 62, node.width - 22, cy).stroke({ color: BLUE, width: 5, alpha: 0.65 });
  fill.scale.x = 0;
}

function drawLoop(container: Container, fill: Graphics, node: WorldNode) {
  const body = new Graphics();
  body.roundRect(8, 15, node.width - 16, node.height - 25, 22).fill({ color: PANEL });
  body.roundRect(8, 15, node.width - 16, node.height - 25, 22).stroke({ color: borderColor(node), width: borderWidth(node) });
  const cx = node.width / 2;
  const cy = node.height / 2 + 9;
  body.circle(cx, cy, 38).stroke({ color: COPPER_DARK, width: 25 });
  body.circle(cx, cy, 38).stroke({ color: COPPER, width: 16 });
  body.moveTo(0, cy).lineTo(cx - 38, cy).stroke({ color: COPPER, width: 16 });
  body.moveTo(cx + 38, cy).lineTo(node.width, cy).stroke({ color: COPPER, width: 16 });
  container.addChild(body);
  fill.circle(cx, cy, 38).stroke({ color: BLUE, width: 6 });
  fill.moveTo(8, cy).lineTo(cx - 38, cy).stroke({ color: BLUE, width: 6 });
  fill.moveTo(cx + 38, cy).lineTo(node.width - 8, cy).stroke({ color: BLUE, width: 6 });
  fill.scale.x = 0;
}

function drawBlocked(container: Container, fill: Graphics, node: WorldNode) {
  const body = new Graphics();
  body.roundRect(8, 20, node.width - 16, node.height - 30, 20).fill({ color: 0xfff4f4 });
  body.roundRect(8, 20, node.width - 16, node.height - 30, 20).stroke({ color: RED, width: 4 });
  const cy = node.height / 2 + 12;
  body.moveTo(0, cy).lineTo(node.width * 0.43, cy).stroke({ color: COPPER_DARK, width: 28 });
  body.moveTo(0, cy).lineTo(node.width * 0.43, cy).stroke({ color: COPPER, width: 19 });
  body.moveTo(node.width * 0.57, cy).lineTo(node.width, cy).stroke({ color: COPPER_DARK, width: 28 });
  body.moveTo(node.width * 0.57, cy).lineTo(node.width, cy).stroke({ color: COPPER, width: 19 });
  body.moveTo(node.width * 0.46, cy - 24).lineTo(node.width * 0.54, cy + 24).stroke({ color: RED, width: 7 });
  body.moveTo(node.width * 0.54, cy - 24).lineTo(node.width * 0.46, cy + 24).stroke({ color: RED, width: 7 });
  container.addChild(body);
  fill.moveTo(8, cy).lineTo(node.width * 0.42, cy).stroke({ color: BLUE, width: 7 });
  fill.scale.x = 0;
}

function drawStraight(container: Container, fill: Graphics, node: WorldNode) {
  const body = new Graphics();
  body.roundRect(8, 28, node.width - 16, node.height - 40, 18).fill({ color: PANEL });
  body.roundRect(8, 28, node.width - 16, node.height - 40, 18).stroke({ color: borderColor(node), width: borderWidth(node) });
  const cy = node.height / 2 + 10;
  drawCopperBranch(body, 0, cy, node.width, cy);
  container.addChild(body);
  fill.moveTo(8, cy).lineTo(node.width - 8, cy).stroke({ color: BLUE, width: 7 });
  fill.scale.x = 0;
}

function addChannel(container: Container, fill: Graphics, node: WorldNode, y: number, x: number, width: number) {
  const channel = new Graphics();
  channel.roundRect(x, y, width, 12, 6).fill({ color: INNER });
  fill.roundRect(x + 3, y + 3, width - 6, 6, 3).fill({ color: BLUE });
  fill.scale.x = 0;
  container.addChild(channel, fill);
}

function drawCopperBranch(graphics: Graphics, x1: number, y1: number, x2: number, y2: number) {
  graphics.moveTo(x1, y1).lineTo(x2, y2).stroke({ color: COPPER_DARK, width: 29 });
  graphics.moveTo(x1, y1).lineTo(x2, y2).stroke({ color: COPPER, width: 20 });
  graphics.moveTo(x1, y1 - 4).lineTo(x2, y2 - 4).stroke({ color: COPPER_LIGHT, width: 4, alpha: 0.6 });
}

function addLabels(container: Container, node: WorldNode, piece: PipePiece) {
  const pieceLabel = new Text({
    text: piece.toUpperCase(),
    style: { fontFamily: "Inter, Arial", fontSize: 9, fontWeight: "800", fill: node.node.status === "fault" ? RED : MUTED, letterSpacing: 1.2 },
  });
  pieceLabel.position.set(17, 8);
  container.addChild(pieceLabel);

  const title = new Text({
    text: node.node.label,
    style: { fontFamily: "Inter, Arial", fontSize: 15, fontWeight: "700", fill: INK, align: "center", wordWrap: true, wordWrapWidth: node.width - 32 },
  });
  title.anchor.set(0.5, 1);
  title.position.set(node.width / 2, node.height - 6);
  container.addChild(title);
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

function borderColor(node: WorldNode) {
  return node.node.status === "fault" ? RED : 0x93a3af;
}

function borderWidth(node: WorldNode) {
  return node.node.status === "fault" ? 4 : 2;
}
