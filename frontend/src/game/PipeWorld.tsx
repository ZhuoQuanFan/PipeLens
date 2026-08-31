import { useEffect, useRef, useState } from "react";
import { Application, Container, Graphics, Text } from "pixi.js";

import type { PipeNode, ScriptedAgentStep } from "../cases/nanogpt";
import {
  layoutPipeWorld,
  pathMetrics,
  pointAtDistance,
  type PipeWorldLayout,
  type WorldNode,
  type WorldPoint,
} from "./pipeWorldModel";

type Props = {
  focus: PipeNode;
  selectedId: string;
  agentSteps: ScriptedAgentStep[];
  activeAgentStep: number;
  onSelect: (node: PipeNode) => void;
  onOpen: (node: PipeNode) => void;
};

type RuntimeState = {
  distance: number;
  playing: boolean;
  speed: number;
  follow: boolean;
  blocked: boolean;
};

const BLUE = 0x36a6ff;
const BLUE_DARK = 0x1767ca;
const RED = 0xf05252;
const PURPLE = 0x8b5cf6;
const COPPER = 0xb97942;
const COPPER_DARK = 0x68472f;
const PIPE_INNER = 0x273947;
const PANEL = 0xf8fbfd;
const INK = 0x162330;
const MUTED = 0x72808c;
const BASE_FLOW_SPEED = 190;

export function PipeWorld({
  focus,
  selectedId,
  agentSteps,
  activeAgentStep,
  onSelect,
  onOpen,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const selectedRef = useRef(selectedId);
  const activeAgentNodeRef = useRef(agentSteps[activeAgentStep]?.nodeId);
  const runtimeRef = useRef<RuntimeState>({ distance: 0, playing: true, speed: 1, follow: true, blocked: false });
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [follow, setFollow] = useState(true);
  const [blockedLabel, setBlockedLabel] = useState<string | null>(null);

  selectedRef.current = selectedId;
  activeAgentNodeRef.current = agentSteps[activeAgentStep]?.nodeId;
  runtimeRef.current.playing = playing;
  runtimeRef.current.speed = speed;
  runtimeRef.current.follow = follow;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let app: Application | null = null;
    const timeoutIds: number[] = [];

    async function mountWorld() {
      const visible = focus.children?.length ? focus.children : [focus];
      const layout = layoutPipeWorld(visible);
      const pixi = new Application();
      await pixi.init({
        resizeTo: host,
        antialias: true,
        backgroundAlpha: 0,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
      });
      if (disposed) {
        pixi.destroy(true);
        return;
      }
      app = pixi;
      pixi.canvas.className = "pipe-world-canvas";
      host.appendChild(pixi.canvas);

      const scene = new Container();
      const camera = new Container();
      scene.addChild(camera);
      pixi.stage.addChild(scene);

      drawWorldGrid(camera, layout);
      drawPipeNetwork(camera, layout.path);

      const flowGraphics = new Graphics();
      camera.addChild(flowGraphics);

      const nodeContainers = new Map<string, Container>();
      const channelFills = new Map<string, Graphics>();
      layout.nodes.forEach((worldNode) => {
        const { container, channelFill } = createComponent(worldNode, () => {
          onSelect(worldNode.node);
          focusCameraOnNode(camera, pixi, worldNode, 1.12);
          if (worldNode.node.children?.length) {
            const timeout = window.setTimeout(() => onOpen(worldNode.node), 360);
            timeoutIds.push(timeout);
          }
        });
        nodeContainers.set(worldNode.node.id, container);
        channelFills.set(worldNode.node.id, channelFill);
        camera.addChild(container);
      });

      const selectedHalo = new Graphics();
      camera.addChild(selectedHalo);
      const agentProbe = createAgentProbe();
      camera.addChild(agentProbe);

      const particles = createFlowParticles(20);
      particles.forEach((particle) => camera.addChild(particle));
      const impact = createImpactEffect();
      camera.addChild(impact.container);

      const metrics = pathMetrics(layout.path);
      const faultStopDistance = computeFaultStopDistance(layout);
      const maxDistance = faultStopDistance ?? metrics.totalLength;
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
        setFollow(false);
        runtimeRef.current.follow = false;
        const nextScale = clamp(camera.scale.x * (event.deltaY > 0 ? 0.9 : 1.1), 0.35, 2.15);
        const rect = canvas.getBoundingClientRect();
        const pointerX = event.clientX - rect.left;
        const pointerY = event.clientY - rect.top;
        const worldBefore = {
          x: (pointerX - camera.x) / camera.scale.x,
          y: (pointerY - camera.y) / camera.scale.y,
        };
        camera.scale.set(nextScale);
        camera.x = pointerX - worldBefore.x * nextScale;
        camera.y = pointerY - worldBefore.y * nextScale;
      };
      const onPointerDown = (event: PointerEvent) => {
        dragging = true;
        lastPointer = { x: event.clientX, y: event.clientY };
        canvas.setPointerCapture?.(event.pointerId);
      };
      const onPointerMove = (event: PointerEvent) => {
        if (!dragging) return;
        const dx = event.clientX - lastPointer.x;
        const dy = event.clientY - lastPointer.y;
        lastPointer = { x: event.clientX, y: event.clientY };
        camera.x += dx;
        camera.y += dy;
        setFollow(false);
        runtimeRef.current.follow = false;
      };
      const onPointerUp = () => { dragging = false; };
      canvas.addEventListener("wheel", onWheel, { passive: false });
      canvas.addEventListener("pointerdown", onPointerDown);
      canvas.addEventListener("pointermove", onPointerMove);
      canvas.addEventListener("pointerup", onPointerUp);
      canvas.addEventListener("pointercancel", onPointerUp);

      pixi.ticker.add((ticker) => {
        const runtime = runtimeRef.current;
        const deltaSeconds = ticker.deltaMS / 1000;
        if (runtime.playing && !runtime.blocked) {
          runtime.distance = Math.min(maxDistance, runtime.distance + BASE_FLOW_SPEED * runtime.speed * deltaSeconds);
          if (runtime.distance >= maxDistance - 0.5) {
            if (faultStopDistance != null) {
              runtime.blocked = true;
              runtime.playing = false;
              setPlaying(false);
              const faultNode = layout.nodes[layout.faultIndex];
              setBlockedLabel(faultNode?.node.label ?? "fault");
              if (faultNode) impact.trigger(faultNode.x + faultNode.width / 2, faultNode.y + faultNode.height / 2);
            } else {
              runtime.playing = false;
              setPlaying(false);
            }
          }
        }

        redrawFlow(flowGraphics, layout.path, runtime.distance);
        updateParticles(particles, layout.path, runtime.distance, metrics.totalLength, runtime.blocked);
        updateComponentChannels(channelFills, layout, runtime.distance);
        updateSelectionHalo(selectedHalo, layout, selectedRef.current, ticker.lastTime / 1000);
        updateAgentProbe(agentProbe, layout, activeAgentNodeRef.current, ticker.lastTime / 1000);
        impact.update(deltaSeconds);

        if (runtime.follow) {
          const point = pointAtDistance(layout.path, runtime.distance);
          const desiredScale = Math.max(camera.scale.x, clamp(Math.min(pixi.screen.width / 1120, pixi.screen.height / 660), 0.72, 1.08));
          camera.scale.x += (desiredScale - camera.scale.x) * 0.035;
          camera.scale.y = camera.scale.x;
          const targetX = pixi.screen.width * 0.48 - point.x * camera.scale.x;
          const targetY = pixi.screen.height * 0.5 - point.y * camera.scale.y;
          camera.x += (targetX - camera.x) * 0.055;
          camera.y += (targetY - camera.y) * 0.055;
        }
      });

      const resizeObserver = new ResizeObserver(() => {
        if (!runtimeRef.current.follow) return;
        fitCamera(camera, pixi, layout);
      });
      resizeObserver.observe(host);

      const cleanup = () => {
        resizeObserver.disconnect();
        canvas.removeEventListener("wheel", onWheel);
        canvas.removeEventListener("pointerdown", onPointerDown);
        canvas.removeEventListener("pointermove", onPointerMove);
        canvas.removeEventListener("pointerup", onPointerUp);
        canvas.removeEventListener("pointercancel", onPointerUp);
      };
      (pixi as Application & { __pipeCleanup?: () => void }).__pipeCleanup = cleanup;
    }

    void mountWorld();

    return () => {
      disposed = true;
      timeoutIds.forEach((id) => window.clearTimeout(id));
      const extended = app as (Application & { __pipeCleanup?: () => void }) | null;
      extended?.__pipeCleanup?.();
      app?.destroy(true);
      host.innerHTML = "";
    };
  }, [focus.id, onOpen, onSelect]);

  function restart() {
    runtimeRef.current.distance = 0;
    runtimeRef.current.blocked = false;
    runtimeRef.current.playing = true;
    setBlockedLabel(null);
    setPlaying(true);
  }

  function togglePlaying() {
    if (runtimeRef.current.blocked) {
      restart();
      return;
    }
    setPlaying((value) => !value);
  }

  return (
    <section className="game-world-shell">
      <div className="game-world-hud top-left">
        <span className="hud-kicker">PIPEWORLD · PIXIJS</span>
        <strong>{blockedLabel ? `FLOW BLOCKED · ${blockedLabel}` : playing ? "EXECUTION RUNNING" : "EXECUTION PAUSED"}</strong>
      </div>
      <div className="game-world-hud controls">
        <button type="button" onClick={togglePlaying}>{blockedLabel ? "Replay" : playing ? "Pause" : "Play"}</button>
        <button type="button" onClick={restart}>Restart</button>
        <button type="button" className={follow ? "active" : ""} onClick={() => setFollow((value) => !value)}>Follow</button>
        <label>
          <span>speed</span>
          <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
            <option value={0.6}>0.6×</option>
            <option value={1}>1×</option>
            <option value={1.8}>1.8×</option>
            <option value={3}>3×</option>
          </select>
        </label>
      </div>
      <div className="game-world-hud bottom-left">
        <span>drag to pan</span><span>wheel to zoom</span><span>click component to enter</span>
      </div>
      <div ref={hostRef} className={`pipe-world-host ${blockedLabel ? "blocked" : ""}`} />
    </section>
  );
}

function drawWorldGrid(camera: Container, layout: PipeWorldLayout) {
  const background = new Graphics();
  background.rect(0, 0, layout.width, layout.height).fill({ color: 0xdbe5ec });
  for (let x = 0; x <= layout.width; x += 80) {
    background.moveTo(x, 0).lineTo(x, layout.height).stroke({ color: 0xa9bac7, width: 1, alpha: 0.23 });
  }
  for (let y = 0; y <= layout.height; y += 80) {
    background.moveTo(0, y).lineTo(layout.width, y).stroke({ color: 0xa9bac7, width: 1, alpha: 0.23 });
  }
  camera.addChild(background);
}

function drawPipeNetwork(camera: Container, path: WorldPoint[]) {
  const outer = new Graphics();
  drawPolyline(outer, path, { color: COPPER_DARK, width: 34, alpha: 1 });
  drawPolyline(outer, path, { color: COPPER, width: 27, alpha: 1 });
  drawPolyline(outer, path, { color: 0xe8b47c, width: 5, alpha: 0.65 });
  camera.addChild(outer);

  const inner = new Graphics();
  drawPolyline(inner, path, { color: PIPE_INNER, width: 15, alpha: 1 });
  drawPolyline(inner, path, { color: 0x425767, width: 4, alpha: 0.72 });
  camera.addChild(inner);
}

function redrawFlow(graphics: Graphics, path: WorldPoint[], distance: number) {
  graphics.clear();
  const partial = partialPath(path, distance);
  if (partial.length < 2) return;
  drawPolyline(graphics, partial, { color: BLUE_DARK, width: 11, alpha: 0.95 });
  drawPolyline(graphics, partial, { color: BLUE, width: 6, alpha: 1 });
}

function createComponent(worldNode: WorldNode, onOpen: () => void) {
  const container = new Container();
  container.x = worldNode.x;
  container.y = worldNode.y;
  container.eventMode = "static";
  container.cursor = "pointer";
  container.on("pointertap", onOpen);

  const shadow = new Graphics();
  shadow.roundRect(8, 10, worldNode.width, worldNode.height, 22).fill({ color: 0x253746, alpha: 0.16 });
  container.addChild(shadow);

  const body = new Graphics();
  body.roundRect(0, 0, worldNode.width, worldNode.height, 22).fill({ color: PANEL });
  body.roundRect(0, 0, worldNode.width, worldNode.height, 22).stroke({
    color: worldNode.node.status === "fault" ? RED : 0x9babb8,
    width: worldNode.node.status === "fault" ? 4 : 2,
  });
  body.roundRect(8, 8, worldNode.width - 16, 18, 9).fill({ color: worldNode.node.status === "fault" ? 0xffe4e4 : 0xe7eef3 });
  container.addChild(body);

  const bolts = [[14, 14], [worldNode.width - 14, 14], [14, worldNode.height - 14], [worldNode.width - 14, worldNode.height - 14]];
  bolts.forEach(([x, y]) => {
    const bolt = new Graphics();
    bolt.circle(x, y, 4).fill({ color: 0x8998a4 });
    bolt.circle(x - 1, y - 1, 1.5).fill({ color: 0xffffff, alpha: 0.8 });
    container.addChild(bolt);
  });

  const level = new Text({ text: worldNode.node.level.toUpperCase(), style: { fontFamily: "Inter, Arial", fontSize: 10, fontWeight: "700", fill: MUTED, letterSpacing: 1.2 } });
  level.x = 18;
  level.y = 12;
  container.addChild(level);

  const title = new Text({
    text: worldNode.node.label,
    style: { fontFamily: "Inter, Arial", fontSize: 16, fontWeight: "700", fill: INK, align: "center", wordWrap: true, wordWrapWidth: worldNode.width - 30 },
  });
  title.anchor.set(0.5, 0);
  title.x = worldNode.width / 2;
  title.y = 37;
  container.addChild(title);

  const channel = new Graphics();
  channel.roundRect(24, worldNode.height - 31, worldNode.width - 48, 12, 6).fill({ color: PIPE_INNER });
  channel.roundRect(24, worldNode.height - 31, worldNode.width - 48, 12, 6).stroke({ color: 0x8c9ba6, width: 1 });
  container.addChild(channel);

  const channelFill = new Graphics();
  channelFill.roundRect(27, worldNode.height - 28, worldNode.width - 54, 6, 3).fill({ color: BLUE });
  channelFill.scale.x = 0;
  container.addChild(channelFill);

  if (worldNode.node.children?.length) {
    const open = new Text({ text: `ENTER ×${worldNode.node.children.length}`, style: { fontFamily: "Inter, Arial", fontSize: 9, fontWeight: "700", fill: BLUE_DARK } });
    open.anchor.set(0.5, 1);
    open.x = worldNode.width / 2;
    open.y = worldNode.height - 37;
    container.addChild(open);
  }

  if (worldNode.node.status === "fault") {
    const warning = new Graphics();
    warning.circle(worldNode.width - 8, 8, 15).fill({ color: RED });
    warning.circle(worldNode.width - 8, 8, 15).stroke({ color: 0xffffff, width: 4 });
    container.addChild(warning);
    const mark = new Text({ text: "!", style: { fontFamily: "Arial", fontSize: 18, fontWeight: "900", fill: 0xffffff } });
    mark.anchor.set(0.5);
    mark.x = worldNode.width - 8;
    mark.y = 8;
    container.addChild(mark);
  }

  return { container, channelFill };
}

function createFlowParticles(count: number): Graphics[] {
  return Array.from({ length: count }, (_, index) => {
    const particle = new Graphics();
    const radius = 3 + (index % 4) * 0.55;
    particle.circle(0, 0, radius).fill({ color: index % 3 === 0 ? 0xb9e6ff : BLUE, alpha: 0.55 + (index % 5) * 0.08 });
    particle.visible = false;
    return particle;
  });
}

function updateParticles(particles: Graphics[], path: WorldPoint[], headDistance: number, totalLength: number, blocked: boolean) {
  particles.forEach((particle, index) => {
    const trailingDistance = headDistance - index * 20;
    if (trailingDistance < 0 || trailingDistance > totalLength) {
      particle.visible = false;
      return;
    }
    particle.visible = true;
    const point = pointAtDistance(path, trailingDistance);
    particle.position.set(point.x, point.y);
    particle.alpha = blocked ? 0.3 + (index % 3) * 0.12 : 0.55 + (index % 4) * 0.1;
  });
}

function updateComponentChannels(fills: Map<string, Graphics>, layout: PipeWorldLayout, distance: number) {
  layout.nodes.forEach((worldNode) => {
    const fill = fills.get(worldNode.node.id);
    if (!fill) return;
    const centerDistance = distanceAlongPathToPoint(layout.path, {
      x: worldNode.x + worldNode.width / 2,
      y: worldNode.y + worldNode.height / 2,
    });
    const localProgress = clamp((distance - centerDistance + 70) / 140, 0, 1);
    fill.scale.x = localProgress;
    fill.tint = worldNode.node.status === "fault" && localProgress > 0.45 ? RED : BLUE;
  });
}

function updateSelectionHalo(graphics: Graphics, layout: PipeWorldLayout, selectedId: string, time: number) {
  graphics.clear();
  const selected = layout.nodes.find((item) => item.node.id === selectedId);
  if (!selected) return;
  const pulse = 5 + Math.sin(time * 3.5) * 2;
  graphics.roundRect(selected.x - pulse, selected.y - pulse, selected.width + pulse * 2, selected.height + pulse * 2, 27)
    .stroke({ color: PURPLE, width: 3, alpha: 0.55 });
}

function createAgentProbe() {
  const probe = new Container();
  const ring = new Graphics();
  ring.circle(0, 0, 18).stroke({ color: PURPLE, width: 4, alpha: 0.95 });
  ring.circle(0, 0, 7).fill({ color: PURPLE, alpha: 0.95 });
  probe.addChild(ring);
  const label = new Text({ text: "AI", style: { fontFamily: "Inter, Arial", fontSize: 10, fontWeight: "900", fill: 0xffffff } });
  label.anchor.set(0.5);
  probe.addChild(label);
  probe.visible = false;
  return probe;
}

function updateAgentProbe(probe: Container, layout: PipeWorldLayout, nodeId: string | undefined, time: number) {
  const target = nodeId ? layout.nodes.find((item) => item.node.id === nodeId) : undefined;
  if (!target) {
    probe.visible = false;
    return;
  }
  probe.visible = true;
  probe.x = target.x + target.width - 5;
  probe.y = target.y - 18 + Math.sin(time * 4) * 5;
}

function createImpactEffect() {
  const container = new Container();
  const ring = new Graphics();
  const sparks = Array.from({ length: 12 }, (_, index) => {
    const spark = new Graphics();
    spark.circle(0, 0, 4 - (index % 2)).fill({ color: index % 3 === 0 ? 0xffb0a8 : RED });
    container.addChild(spark);
    return spark;
  });
  container.addChild(ring);
  container.visible = false;
  let age = 0;
  let active = false;

  return {
    container,
    trigger(x: number, y: number) {
      container.position.set(x, y);
      container.visible = true;
      active = true;
      age = 0;
    },
    update(delta: number) {
      if (!active) return;
      age += delta;
      ring.clear();
      const radius = 24 + Math.sin(age * 7) * 7;
      ring.circle(0, 0, radius).stroke({ color: RED, width: 6, alpha: 0.35 + Math.abs(Math.sin(age * 5)) * 0.4 });
      sparks.forEach((spark, index) => {
        const angle = (Math.PI * 2 * index) / sparks.length + age * (index % 2 ? 0.8 : -0.65);
        const distance = 24 + ((index * 11) % 30) + Math.sin(age * 8 + index) * 8;
        spark.position.set(Math.cos(angle) * distance, Math.sin(angle) * distance);
        spark.alpha = 0.45 + Math.abs(Math.sin(age * 6 + index)) * 0.5;
      });
    },
  };
}

function computeFaultStopDistance(layout: PipeWorldLayout): number | null {
  if (layout.faultIndex < 0) return null;
  const fault = layout.nodes[layout.faultIndex];
  return distanceAlongPathToPoint(layout.path, {
    x: fault.x + fault.width / 2,
    y: fault.y + fault.height / 2,
  });
}

function distanceAlongPathToPoint(path: WorldPoint[], target: WorldPoint): number {
  let distance = 0;
  for (let index = 1; index < path.length; index += 1) {
    const start = path[index - 1];
    const end = path[index];
    const segmentLength = Math.hypot(end.x - start.x, end.y - start.y);
    if (Math.abs(end.x - target.x) < 0.5 && Math.abs(end.y - target.y) < 0.5) return distance + segmentLength;
    distance += segmentLength;
  }
  return distance;
}

function partialPath(path: WorldPoint[], distance: number): WorldPoint[] {
  if (!path.length) return [];
  const result = [path[0]];
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

function drawPolyline(graphics: Graphics, path: WorldPoint[], style: { color: number; width: number; alpha: number }) {
  if (path.length < 2) return;
  graphics.moveTo(path[0].x, path[0].y);
  for (let index = 1; index < path.length; index += 1) graphics.lineTo(path[index].x, path[index].y);
  graphics.stroke({ color: style.color, width: style.width, alpha: style.alpha, cap: "round", join: "round" });
}

function fitCamera(camera: Container, app: Application, layout: PipeWorldLayout) {
  const scale = clamp(Math.min(app.screen.width / layout.width, app.screen.height / layout.height) * 0.93, 0.42, 1.25);
  camera.scale.set(scale);
  camera.x = (app.screen.width - layout.width * scale) / 2;
  camera.y = (app.screen.height - layout.height * scale) / 2;
}

function focusCameraOnNode(camera: Container, app: Application, node: WorldNode, targetScale: number) {
  const scale = clamp(Math.max(camera.scale.x, targetScale), 0.5, 1.8);
  camera.scale.set(scale);
  camera.x = app.screen.width / 2 - (node.x + node.width / 2) * scale;
  camera.y = app.screen.height / 2 - (node.y + node.height / 2) * scale;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
