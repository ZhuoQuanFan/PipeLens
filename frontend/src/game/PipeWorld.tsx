import { useEffect, useRef, useState } from "react";
import { Application, Container, Graphics, Text } from "pixi.js";

import type { PipeNode, ScriptedAgentStep } from "../cases/nanogpt";
import { renderPipePiece } from "./pipePieces";
import { layoutPipeWorld, pathMetrics, pointAtDistance, type PipeWorldLayout, type WorldNode, type WorldPoint } from "./pipeWorldModel";

type Props = {
  focus: PipeNode;
  selectedId: string;
  agentSteps: ScriptedAgentStep[];
  activeAgentStep: number;
  onSelect: (node: PipeNode) => void;
  onOpen: (node: PipeNode) => void;
};

type Runtime = { distance: number; playing: boolean; speed: number; follow: boolean; blocked: boolean };

const BLUE = 0x35a7ff;
const BLUE_DARK = 0x1767ca;
const RED = 0xf05252;
const PURPLE = 0x8b5cf6;
const PIPE_BODY = 0xf7fafc;
const PIPE_BORDER = 0x91a2ad;
const PIPE_INNER = 0xd6e0e6;
const BASE_FLOW_SPEED = 190;

export function PipeWorld({ focus, selectedId, agentSteps, activeAgentStep, onSelect, onOpen }: Props) {
  const hostRef = useRef<HTMLDivElement>(null!);
  const selectedRef = useRef(selectedId);
  const agentNodeRef = useRef(agentSteps[activeAgentStep]?.nodeId);
  const runtimeRef = useRef<Runtime>({ distance: 0, playing: true, speed: 1, follow: true, blocked: false });
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [follow, setFollow] = useState(true);
  const [blockedLabel, setBlockedLabel] = useState<string | null>(null);

  selectedRef.current = selectedId;
  agentNodeRef.current = agentSteps[activeAgentStep]?.nodeId;
  runtimeRef.current.playing = playing;
  runtimeRef.current.speed = speed;
  runtimeRef.current.follow = follow;

  useEffect(() => {
    const hostElement = hostRef.current;
    let disposed = false;
    let app: Application | null = null;
    const timeoutIds: number[] = [];

    async function initialize() {
      const visible = focus.children?.length ? focus.children : [focus];
      const layout = layoutPipeWorld(visible, focus.edges);
      const pixi = new Application();
      await pixi.init({ resizeTo: hostElement, antialias: true, backgroundAlpha: 0, autoDensity: true, resolution: Math.min(window.devicePixelRatio || 1, 2) });
      if (disposed) { pixi.destroy(true); return; }
      app = pixi;
      pixi.canvas.className = "pipe-world-canvas";
      hostElement.appendChild(pixi.canvas);

      const camera = new Container();
      pixi.stage.addChild(camera);
      drawGrid(camera, layout);
      drawPipe(camera, layout.path);
      layout.bypassPaths.forEach((bypass) => drawPipe(camera, bypass.path, true));
      layout.branchPaths.forEach((branch) => drawPipe(camera, branch.path, true));

      const flow = new Graphics();
      camera.addChild(flow);
      const particles = createParticles(9);
      particles.forEach((particle) => camera.addChild(particle));
      const fills = new Map<string, Graphics>();
      layout.nodes.forEach((worldNode) => {
        const { container, fill } = renderPipePiece(worldNode, () => {
          onSelect(worldNode.node);
          focusCamera(camera, pixi, worldNode);
          if (worldNode.node.children?.length) timeoutIds.push(window.setTimeout(() => onOpen(worldNode.node), 320));
        });
        fills.set(worldNode.node.id, fill);
        camera.addChild(container);
      });

      const selection = new Graphics();
      camera.addChild(selection);
      const agentProbe = createAgentProbe();
      camera.addChild(agentProbe);
      const impact = new Graphics();
      camera.addChild(impact);

      const metrics = pathMetrics(layout.path);
      const faultDistance = computeFaultDistance(layout);
      const endDistance = faultDistance ?? metrics.totalLength;
      runtimeRef.current = { distance: 0, playing: true, speed, follow: true, blocked: false };
      setPlaying(true);
      setFollow(true);
      setBlockedLabel(null);
      fitCamera(camera, pixi, layout);

      let dragging = false;
      let lastPointer = { x: 0, y: 0 };
      const canvas = pixi.canvas;
      const onWheel = (event: WheelEvent) => {
        event.preventDefault();
        const next = clamp(camera.scale.x * (event.deltaY > 0 ? 0.9 : 1.1), 0.35, 2.2);
        const rect = canvas.getBoundingClientRect();
        const pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        const world = { x: (pointer.x - camera.x) / camera.scale.x, y: (pointer.y - camera.y) / camera.scale.y };
        camera.scale.set(next);
        camera.position.set(pointer.x - world.x * next, pointer.y - world.y * next);
        runtimeRef.current.follow = false;
        setFollow(false);
      };
      const onPointerDown = (event: PointerEvent) => { dragging = true; lastPointer = { x: event.clientX, y: event.clientY }; };
      const onPointerMove = (event: PointerEvent) => {
        if (!dragging) return;
        camera.x += event.clientX - lastPointer.x;
        camera.y += event.clientY - lastPointer.y;
        lastPointer = { x: event.clientX, y: event.clientY };
        runtimeRef.current.follow = false;
        setFollow(false);
      };
      const onPointerUp = () => { dragging = false; };
      canvas.addEventListener("wheel", onWheel, { passive: false });
      canvas.addEventListener("pointerdown", onPointerDown);
      canvas.addEventListener("pointermove", onPointerMove);
      canvas.addEventListener("pointerup", onPointerUp);
      canvas.addEventListener("pointercancel", onPointerUp);

      pixi.ticker.add((ticker) => {
        const runtime = runtimeRef.current;
        if (runtime.playing && !runtime.blocked) {
          runtime.distance = Math.min(endDistance, runtime.distance + BASE_FLOW_SPEED * runtime.speed * (ticker.deltaMS / 1000));
          if (runtime.distance >= endDistance - 0.5) {
            runtime.playing = false;
            setPlaying(false);
            if (faultDistance != null) {
              runtime.blocked = true;
              const faultNode = layout.nodes[layout.faultIndex];
              setBlockedLabel(faultNode?.node.label ?? "fault");
              if (faultNode) impact.position.set(faultNode.x + faultNode.width / 2, faultNode.y + faultNode.height / 2);
            }
          }
        }
        redrawFlow(flow, layout, runtime.distance);
        updateParticles(particles, layout.path, runtime.distance, metrics.totalLength, runtime.blocked, ticker.lastTime / 1000);
        updateFills(fills, layout, runtime.distance);
        updateSelection(selection, layout, selectedRef.current, ticker.lastTime / 1000);
        updateAgentProbe(agentProbe, layout, agentNodeRef.current, ticker.lastTime / 1000);
        updateImpact(impact, runtime.blocked, ticker.lastTime / 1000);
        if (runtime.follow) {
          const point = pointAtDistance(layout.path, runtime.distance);
          const desiredScale = clamp(Math.max(camera.scale.x, Math.min(pixi.screen.width / 1120, pixi.screen.height / 660)), 0.7, 1.12);
          camera.scale.x += (desiredScale - camera.scale.x) * 0.035;
          camera.scale.y = camera.scale.x;
          camera.x += (pixi.screen.width * 0.48 - point.x * camera.scale.x - camera.x) * 0.06;
          camera.y += (pixi.screen.height * 0.5 - point.y * camera.scale.y - camera.y) * 0.06;
        }
      });

      const resizeObserver = new ResizeObserver(() => { if (runtimeRef.current.follow) fitCamera(camera, pixi, layout); });
      resizeObserver.observe(hostElement);
      (pixi as Application & { __cleanup?: () => void }).__cleanup = () => {
        resizeObserver.disconnect();
        canvas.removeEventListener("wheel", onWheel);
        canvas.removeEventListener("pointerdown", onPointerDown);
        canvas.removeEventListener("pointermove", onPointerMove);
        canvas.removeEventListener("pointerup", onPointerUp);
        canvas.removeEventListener("pointercancel", onPointerUp);
      };
    }

    void initialize();
    return () => {
      disposed = true;
      timeoutIds.forEach((id) => window.clearTimeout(id));
      (app as (Application & { __cleanup?: () => void }) | null)?.__cleanup?.();
      app?.destroy(true);
      hostElement.innerHTML = "";
    };
  }, [focus.id, onOpen, onSelect]);

  function restart() {
    runtimeRef.current.distance = 0;
    runtimeRef.current.blocked = false;
    runtimeRef.current.playing = true;
    setBlockedLabel(null);
    setPlaying(true);
  }

  return <section className="game-world-shell">
    <div className="game-world-hud top-left"><span className="hud-kicker">PIPEWORLD · PIXIJS</span><strong>{blockedLabel ? `FLOW BLOCKED · ${blockedLabel}` : playing ? "EXECUTION RUNNING" : "EXECUTION PAUSED"}</strong></div>
    <div className="game-world-hud controls">
      <button type="button" onClick={() => blockedLabel ? restart() : setPlaying((value) => !value)}>{blockedLabel ? "Replay" : playing ? "Pause" : "Play"}</button>
      <button type="button" onClick={restart}>Restart</button>
      <button type="button" className={follow ? "active" : ""} onClick={() => setFollow((value) => !value)}>Follow</button>
      <label><span>speed</span><select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}><option value={0.6}>0.6×</option><option value={1}>1×</option><option value={1.8}>1.8×</option><option value={3}>3×</option></select></label>
    </div>
    <div className="game-world-hud bottom-left"><span>drag to pan</span><span>wheel to zoom</span><span>click component to enter</span></div>
    <div ref={hostRef} className={`pipe-world-host ${blockedLabel ? "blocked" : ""}`} />
  </section>;
}

function drawGrid(camera: Container, layout: PipeWorldLayout) {
  const grid = new Graphics();
  grid.rect(0, 0, layout.width, layout.height).fill({ color: 0xe4ebf0 });
  for (let x = 0; x <= layout.width; x += 80) grid.moveTo(x, 0).lineTo(x, layout.height).stroke({ color: 0x9fb1be, width: 1, alpha: 0.13 });
  for (let y = 0; y <= layout.height; y += 80) grid.moveTo(0, y).lineTo(layout.width, y).stroke({ color: 0x9fb1be, width: 1, alpha: 0.13 });
  camera.addChild(grid);
}

function drawPipe(camera: Container, path: WorldPoint[], secondary = false) {
  const pipe = new Graphics();
  const widths = secondary ? [25, 19, 11, 3] : [30, 24, 14, 3];
  strokePath(pipe, path, PIPE_BORDER, widths[0], secondary ? 0.82 : 0.96);
  strokePath(pipe, path, PIPE_BODY, widths[1], 1);
  strokePath(pipe, path, PIPE_INNER, widths[2], 1);
  strokePath(pipe, path, 0xffffff, widths[3], secondary ? 0.48 : 0.68);
  camera.addChild(pipe);
}

function redrawFlow(graphics: Graphics, layout: PipeWorldLayout, distance: number) {
  graphics.clear();
  const partial = partialPath(layout.path, distance);
  if (partial.length >= 2) {
    strokePath(graphics, partial, BLUE_DARK, 11, 1);
    strokePath(graphics, partial, BLUE, 6, 1);
  }
  layout.bypassPaths.forEach((bypass) => {
    if (distance <= bypass.startDistance) return;
    const span = Math.max(1, bypass.endDistance - bypass.startDistance);
    const progress = clamp((distance - bypass.startDistance) / span, 0, 1);
    const bypassDistance = pathMetrics(bypass.path).totalLength * progress;
    const bypassPartial = partialPath(bypass.path, bypassDistance);
    if (bypassPartial.length < 2) return;
    strokePath(graphics, bypassPartial, BLUE_DARK, 7, 0.9);
    strokePath(graphics, bypassPartial, BLUE, 4, 0.92);
  });
  layout.branchPaths.forEach((branch) => {
    if (distance <= branch.startDistance) return;
    const span = Math.max(1, branch.endDistance - branch.startDistance);
    const progress = clamp((distance - branch.startDistance) / span, 0, 1);
    const branchDistance = pathMetrics(branch.path).totalLength * progress;
    const branchPartial = partialPath(branch.path, branchDistance);
    if (branchPartial.length < 2) return;
    strokePath(graphics, branchPartial, BLUE_DARK, 7, 0.9);
    strokePath(graphics, branchPartial, BLUE, 4, 0.92);
  });
}

function createParticles(count: number) {
  return Array.from({ length: count }, (_, index) => new Graphics().circle(0, 0, 1.6 + (index % 3) * 0.35).fill({ color: index % 3 === 0 ? 0xd9f2ff : BLUE, alpha: 0.42 }));
}

function updateParticles(particles: Graphics[], path: WorldPoint[], head: number, total: number, blocked: boolean, time: number) {
  particles.forEach((particle, index) => {
    const distance = head - index * 42;
    particle.visible = distance >= 0 && distance <= total;
    if (!particle.visible) return;
    const point = pointAtDistance(path, distance);
    particle.position.set(point.x, point.y);
    particle.scale.set(blocked ? 0.7 + Math.sin(time * 5 + index) * 0.08 : 1);
    particle.alpha = blocked ? 0.2 : 0.3 + (index % 3) * 0.08;
  });
}

function updateFills(fills: Map<string, Graphics>, layout: PipeWorldLayout, distance: number) {
  layout.nodes.forEach((worldNode) => {
    const fill = fills.get(worldNode.node.id);
    if (!fill) return;
    const center = worldNode.flowDistance ?? distanceTo(layout.path, { x: worldNode.x + worldNode.width / 2, y: worldNode.y + worldNode.height / 2 });
    const progress = clamp((distance - center + 65) / 130, 0, 1);
    if (worldNode.ports?.length) {
      fill.scale.x = 1;
      fill.alpha = progress;
    } else {
      fill.scale.x = progress;
    }
    fill.tint = worldNode.node.status === "fault" && progress > 0.45 ? RED : BLUE;
  });
}

function updateSelection(graphics: Graphics, layout: PipeWorldLayout, selectedId: string, time: number) {
  graphics.clear();
  const node = layout.nodes.find((item) => item.node.id === selectedId);
  if (!node) return;
  const pad = 6 + Math.sin(time * 3.5) * 2;
  const compact = node.node.piece === "junction" || node.node.piece === "valve" || node.node.piece === "straight";
  const selectionY = compact ? node.y + 18 : node.y;
  const selectionHeight = compact ? node.height - 22 : node.height;
  graphics.roundRect(node.x - pad, selectionY - pad, node.width + pad * 2, selectionHeight + pad * 2, compact ? 20 : 28).stroke({ color: PURPLE, width: 3, alpha: 0.55 });
}

function createAgentProbe() {
  const probe = new Container();
  const ring = new Graphics().circle(0, 0, 18).stroke({ color: PURPLE, width: 4 }).circle(0, 0, 7).fill({ color: PURPLE });
  const label = new Text({ text: "AI", style: { fontFamily: "Inter, Arial", fontSize: 9, fontWeight: "900", fill: 0xffffff } });
  label.anchor.set(0.5);
  probe.addChild(ring, label);
  probe.visible = false;
  return probe;
}

function updateAgentProbe(probe: Container, layout: PipeWorldLayout, nodeId: string | undefined, time: number) {
  const target = nodeId ? layout.nodes.find((item) => item.node.id === nodeId) : undefined;
  probe.visible = Boolean(target);
  if (target) probe.position.set(target.x + target.width - 5, target.y - 18 + Math.sin(time * 4) * 5);
}

function updateImpact(impact: Graphics, blocked: boolean, time: number) {
  impact.visible = blocked;
  impact.clear();
  if (!blocked) return;
  const pulse = 28 + Math.sin(time * 7) * 8;
  impact.circle(0, 0, pulse).stroke({ color: RED, width: 7, alpha: 0.55 });
  for (let index = 0; index < 10; index += 1) {
    const angle = Math.PI * 2 * index / 10 + time * (index % 2 ? 0.6 : -0.6);
    const radius = 34 + (index % 3) * 12;
    impact.circle(Math.cos(angle) * radius, Math.sin(angle) * radius, 3).fill({ color: RED, alpha: 0.75 });
  }
}

function computeFaultDistance(layout: PipeWorldLayout) {
  if (layout.faultIndex < 0) return null;
  const fault = layout.nodes[layout.faultIndex];
  return distanceTo(layout.path, { x: fault.x + fault.width / 2, y: fault.y + fault.height / 2 });
}

function distanceTo(path: WorldPoint[], target: WorldPoint) {
  let distance = 0;
  for (let index = 1; index < path.length; index += 1) {
    const start = path[index - 1];
    const end = path[index];
    const segment = Math.hypot(end.x - start.x, end.y - start.y);
    if (Math.abs(end.x - target.x) < 0.5 && Math.abs(end.y - target.y) < 0.5) return distance + segment;
    distance += segment;
  }
  return distance;
}

function partialPath(path: WorldPoint[], distance: number) {
  if (!path.length) return [];
  const result: WorldPoint[] = [path[0]];
  let remaining = Math.max(0, distance);
  for (let index = 1; index < path.length; index += 1) {
    const start = path[index - 1];
    const end = path[index];
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    if (remaining >= length) {
      result.push(end);
      remaining -= length;
      continue;
    }
    if (remaining > 0) {
      const ratio = length === 0 ? 0 : remaining / length;
      result.push({ x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio });
    }
    break;
  }
  return result;
}

function strokePath(graphics: Graphics, path: WorldPoint[], color: number, width: number, alpha: number) {
  if (path.length < 2) return;
  graphics.moveTo(path[0].x, path[0].y);
  for (let index = 1; index < path.length; index += 1) graphics.lineTo(path[index].x, path[index].y);
  graphics.stroke({ color, width, alpha, cap: "round", join: "round" });
}

function fitCamera(camera: Container, app: Application, layout: PipeWorldLayout) {
  const scale = clamp(Math.min(app.screen.width / layout.width, app.screen.height / layout.height) * 0.93, 0.42, 1.25);
  camera.scale.set(scale);
  camera.position.set((app.screen.width - layout.width * scale) / 2, (app.screen.height - layout.height * scale) / 2);
}

function focusCamera(camera: Container, app: Application, node: WorldNode) {
  const scale = clamp(Math.max(camera.scale.x, 1.12), 0.5, 1.8);
  camera.scale.set(scale);
  camera.position.set(app.screen.width / 2 - (node.x + node.width / 2) * scale, app.screen.height / 2 - (node.y + node.height / 2) * scale);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
