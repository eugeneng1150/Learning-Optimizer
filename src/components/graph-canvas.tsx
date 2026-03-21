"use client";

import { PointerEvent, WheelEvent, useEffect, useRef, useState } from "react";

import { ConceptEdge, ConceptNode } from "@/lib/types";

interface GraphCanvasProps {
  nodes: ConceptNode[];
  edges: ConceptEdge[];
  selectedConceptId?: string;
  onSelectConcept: (conceptId: string) => void;
}

interface GraphPoint {
  x: number;
  y: number;
}

interface PositionedGraphNode extends ConceptNode {
  x: number;
  y: number;
  role: "focus" | "primary" | "secondary";
}

interface RelatedConcept {
  node: ConceptNode;
  edge: ConceptEdge;
}

interface ViewportState {
  x: number;
  y: number;
  scale: number;
}

interface RelationCluster {
  type: ConceptEdge["type"];
  count: number;
}

interface DragAnchorState {
  nodeId: string;
  position: GraphPoint;
}

type GraphInteraction =
  | {
      type: "pan";
      pointerId: number;
      start: GraphPoint;
      origin: ViewportState;
    }
  | {
      type: "drag";
      pointerId: number;
      nodeId: string;
      start: GraphPoint;
      originPosition: GraphPoint;
      hasMoved: boolean;
    }
  | null;

const WIDTH = 1040;
const HEIGHT = 660;
const MIN_SCALE = 0.72;
const MAX_SCALE = 1.8;
const WORLD_CENTER = { x: WIDTH / 2, y: HEIGHT / 2 };
const WORLD_SOFT_LIMIT_X = WIDTH * 1.9;
const WORLD_SOFT_LIMIT_Y = HEIGHT * 1.9;
const DEFAULT_VIEWPORT: ViewportState = { x: 0, y: 0, scale: 1 };

export function GraphCanvas({
  nodes,
  edges,
  selectedConceptId,
  onSelectConcept
}: GraphCanvasProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const interactionRef = useRef<GraphInteraction>(null);
  const dragAnchorRef = useRef<DragAnchorState | null>(null);
  const simulationFrameRef = useRef<number | null>(null);
  const positionsRef = useRef<Record<string, GraphPoint>>({});
  const velocitiesRef = useRef<Record<string, GraphPoint>>({});
  const [viewport, setViewport] = useState<ViewportState>(DEFAULT_VIEWPORT);
  const [dragAnchor, setDragAnchor] = useState<DragAnchorState | null>(null);
  const [simulationPositions, setSimulationPositions] = useState<Record<string, GraphPoint>>({});
  const [simulationPulse, setSimulationPulse] = useState(0);
  const [focusMode, setFocusMode] = useState(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState(true);
  const [focusedConceptId, setFocusedConceptId] = useState<string | undefined>(selectedConceptId);
  const [activeEdgeTypes, setActiveEdgeTypes] = useState<ConceptEdge["type"][]>([]);
  const [expandedNodeIds, setExpandedNodeIds] = useState<string[]>([]);

  const safeNodes = nodes.slice(0, 28);
  const selectedId = selectedConceptId ?? safeNodes[0]?.id;
  const focusId = focusedConceptId && safeNodes.some((node) => node.id === focusedConceptId)
    ? focusedConceptId
    : safeNodes[0]?.id;
  const edgeIdsByNode = buildEdgeMap(safeNodes, edges);
  const focusClusters = focusId ? buildRelationClusters(focusId, edgeIdsByNode) : [];
  const enabledEdgeTypes = activeEdgeTypes.length
    ? activeEdgeTypes
    : focusClusters.map((cluster) => cluster.type);
  const expandedNodeSet = new Set(expandedNodeIds);
  const visibleNodeIds = focusId
    ? buildVisibleNodeIds(focusId, safeNodes, edgeIdsByNode, focusMode, enabledEdgeTypes, expandedNodeSet)
    : new Set<string>();
  const visibleNodes = safeNodes.filter((node) => visibleNodeIds.has(node.id));
  const visibleNodeKey = visibleNodes.map((node) => node.id).join("|");
  const visibleEdges = edges.filter(
    (edge) =>
      visibleNodeIds.has(edge.source_concept_id) &&
      visibleNodeIds.has(edge.target_concept_id) &&
      enabledEdgeTypes.includes(edge.type)
  );
  const visibleEdgeKey = visibleEdges.map((edge) => edge.id).join("|");
  const basePositions = buildMindMapPositions(visibleNodes, visibleEdges, focusId);
  const positionedNodes = visibleNodes.map((node) => {
    const basePosition = basePositions.get(node.id) ?? {
      x: WIDTH / 2,
      y: HEIGHT / 2,
      role: "secondary" as PositionedGraphNode["role"]
    };
    const simulatedPosition = simulationPositions[node.id] ?? { x: basePosition.x, y: basePosition.y };
    const position = dragAnchor?.nodeId === node.id ? dragAnchor.position : simulatedPosition;

    return {
      ...node,
      x: position.x,
      y: position.y,
      role: basePosition.role
    };
  });
  const positionedNodeById = new Map(positionedNodes.map((node) => [node.id, node]));
  const selectedNode = selectedId ? safeNodes.find((node) => node.id === selectedId) : undefined;
  const drawerConceptId = selectedNode?.id ?? focusId;
  const drawerClusters = drawerConceptId ? buildRelationClusters(drawerConceptId, edgeIdsByNode) : [];
  const drawerRelatedConcepts = drawerConceptId
    ? listRelatedConcepts(
        drawerConceptId,
        edgeIdsByNode,
        drawerConceptId === focusId ? enabledEdgeTypes : drawerClusters.map((cluster) => cluster.type)
      )
    : [];
  const hiddenNeighborCounts = buildHiddenNeighborCounts(visibleNodeIds, edgeIdsByNode, enabledEdgeTypes);

  useEffect(() => {
    const seeded = seedSimulationPositions(visibleNodes, basePositions);
    positionsRef.current = seeded;
    velocitiesRef.current = Object.fromEntries(Object.keys(seeded).map((nodeId) => [nodeId, { x: 0, y: 0 }]));
    setSimulationPositions(seeded);
  }, [visibleNodeKey, visibleEdgeKey, focusId, focusMode, enabledEdgeTypes.join("|")]);

  useEffect(() => {
    if (!visibleNodes.length) {
      return;
    }

    let frame = 0;
    const visibleNodeList = visibleNodes.map((node) => node.id);

    const step = () => {
      const nextPositions = runForceStep({
        currentPositions: positionsRef.current,
        velocities: velocitiesRef.current,
        visibleNodeIds: visibleNodeList,
        visibleEdges,
        basePositions,
        dragAnchor: dragAnchorRef.current
      });

      positionsRef.current = nextPositions.positions;
      velocitiesRef.current = nextPositions.velocities;
      setSimulationPositions(nextPositions.positions);
      frame += 1;

      if (frame < 90 || nextPositions.totalVelocity > 0.6 || dragAnchorRef.current) {
        simulationFrameRef.current = window.requestAnimationFrame(step);
      } else {
        simulationFrameRef.current = null;
      }
    };

    simulationFrameRef.current = window.requestAnimationFrame(step);

    return () => {
      if (simulationFrameRef.current !== null) {
        window.cancelAnimationFrame(simulationFrameRef.current);
        simulationFrameRef.current = null;
      }
    };
  }, [visibleNodeKey, visibleEdgeKey, focusId, simulationPulse]);

  useEffect(() => {
    if (!safeNodes.length) {
      setFocusedConceptId(undefined);
      return;
    }

    if (!focusedConceptId || !safeNodes.some((node) => node.id === focusedConceptId)) {
      setFocusedConceptId(selectedConceptId ?? safeNodes[0].id);
    }
  }, [focusedConceptId, safeNodes, selectedConceptId]);

  useEffect(() => {
    if (!focusId) {
      setExpandedNodeIds([]);
      return;
    }

    setExpandedNodeIds([]);
  }, [focusId]);

  useEffect(() => {
    if (!selectedConceptId) {
      return;
    }

    setIsDrawerOpen(true);
  }, [selectedConceptId]);

  useEffect(() => {
    setActiveEdgeTypes((current) => {
      const available = new Set(focusClusters.map((cluster) => cluster.type));
      const filtered = current.filter((type) => available.has(type));
      return filtered.length === current.length ? current : filtered;
    });
  }, [focusId]);

  function toCanvasPoint(clientX: number, clientY: number): GraphPoint {
    const svg = svgRef.current;
    if (!svg) {
      return { x: 0, y: 0 };
    }

    const rect = svg.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * WIDTH,
      y: ((clientY - rect.top) / rect.height) * HEIGHT
    };
  }

  function toWorldPoint(clientX: number, clientY: number): GraphPoint {
    const point = toCanvasPoint(clientX, clientY);
    return {
      x: (point.x - viewport.x) / viewport.scale,
      y: (point.y - viewport.y) / viewport.scale
    };
  }

  function wakeSimulation() {
    if (simulationFrameRef.current !== null) {
      return;
    }

    setSimulationPulse((current) => current + 1);
  }

  function handleCanvasPointerDown(event: PointerEvent<SVGRectElement>) {
    if (event.button !== 0) {
      return;
    }

    const point = toCanvasPoint(event.clientX, event.clientY);
    interactionRef.current = {
      type: "pan",
      pointerId: event.pointerId,
      start: point,
      origin: viewport
    };

    svgRef.current?.setPointerCapture(event.pointerId);
  }

  function handleNodePointerDown(nodeId: string, event: PointerEvent<SVGGElement>) {
    if (event.button !== 0) {
      return;
    }

    event.stopPropagation();

    interactionRef.current = {
      type: "drag",
      pointerId: event.pointerId,
      nodeId,
      start: toWorldPoint(event.clientX, event.clientY),
      originPosition: positionedNodeById.get(nodeId)
        ? {
            x: positionedNodeById.get(nodeId)!.x,
            y: positionedNodeById.get(nodeId)!.y
          }
        : {
            x: WIDTH / 2,
            y: HEIGHT / 2
          },
      hasMoved: false
    };

    wakeSimulation();
    svgRef.current?.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) {
      return;
    }

    if (interaction.type === "pan") {
      const point = toCanvasPoint(event.clientX, event.clientY);
      setViewport({
        ...interaction.origin,
        x: interaction.origin.x + point.x - interaction.start.x,
        y: interaction.origin.y + point.y - interaction.start.y
      });
      return;
    }

    const point = toWorldPoint(event.clientX, event.clientY);
    const nextPosition = {
      x: interaction.originPosition.x + point.x - interaction.start.x,
      y: interaction.originPosition.y + point.y - interaction.start.y
    };

    const distance = Math.hypot(
      nextPosition.x - interaction.originPosition.x,
      nextPosition.y - interaction.originPosition.y
    );
    interactionRef.current = {
      ...interaction,
      hasMoved: interaction.hasMoved || distance > 6
    };

    const nextAnchor = {
      nodeId: interaction.nodeId,
      position: nextPosition
    };
    dragAnchorRef.current = nextAnchor;
    setDragAnchor(nextAnchor);
    wakeSimulation();
  }

  function clearInteraction(pointerId?: number) {
    const interaction = interactionRef.current;

    if (interaction?.type === "drag" && !interaction.hasMoved) {
      onSelectConcept(interaction.nodeId);
      setIsDrawerOpen(true);
    }

    if (pointerId !== undefined) {
      svgRef.current?.releasePointerCapture(pointerId);
    }
    dragAnchorRef.current = null;
    setDragAnchor(null);
    interactionRef.current = null;
    wakeSimulation();
  }

  function handleWheel(event: WheelEvent<SVGSVGElement>) {
    event.preventDefault();

    const point = toCanvasPoint(event.clientX, event.clientY);
    const delta = event.deltaY < 0 ? 1.08 : 0.92;
    const nextScale = clamp(viewport.scale * delta, MIN_SCALE, MAX_SCALE);

    if (nextScale === viewport.scale) {
      return;
    }

    const worldX = (point.x - viewport.x) / viewport.scale;
    const worldY = (point.y - viewport.y) / viewport.scale;

    setViewport({
      scale: nextScale,
      x: point.x - worldX * nextScale,
      y: point.y - worldY * nextScale
    });
  }

  return (
    <div className="panel graph-panel">
      <div className="panel-header graph-panel-header">
        <div>
          <p className="eyebrow">Stage 2</p>
          <h2>Generated mindmap</h2>
        </div>
        <div className="graph-controls">
          <button
            className="nav-button"
            type="button"
            disabled={!selectedNode || selectedNode.id === focusId}
            onClick={() => {
              if (!selectedNode) {
                return;
              }

              setFocusedConceptId(selectedNode.id);
              setViewport(DEFAULT_VIEWPORT);
              setIsDrawerOpen(true);
            }}
          >
            Center selected
          </button>
          <button className="nav-button" type="button" onClick={() => setFocusMode((current) => !current)}>
            {focusMode ? "Show all" : "Mind map mode"}
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={() => setActiveEdgeTypes([])}
            disabled={!activeEdgeTypes.length}
          >
            Show all links
          </button>
          <button className="ghost-button" type="button" onClick={() => setViewport(DEFAULT_VIEWPORT)}>
            Reset view
          </button>
          <button className="ghost-button" type="button" onClick={() => setIsDrawerOpen((current) => !current)}>
            {isDrawerOpen ? "Hide details" : "Show details"}
          </button>
        </div>
      </div>

      <div className={`graph-stage ${isDrawerOpen && selectedNode ? "graph-stage-drawer-open" : ""}`}>
        <svg
          ref={svgRef}
          className="graph-svg graph-svg-interactive"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label="Concept graph"
          onPointerMove={handlePointerMove}
          onPointerUp={(event) => clearInteraction(event.pointerId)}
          onPointerLeave={() => clearInteraction()}
          onWheel={handleWheel}
        >
          <defs>
            <linearGradient id="graphBg" x1="0%" x2="100%" y1="0%" y2="100%">
              <stop offset="0%" stopColor="#08131f" />
              <stop offset="58%" stopColor="#0f3043" />
              <stop offset="100%" stopColor="#18445c" />
            </linearGradient>
            <pattern id="graphGrid" width="56" height="56" patternUnits="userSpaceOnUse">
              <path d="M 56 0 L 0 0 0 56" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
            </pattern>
          </defs>

          <rect width={WIDTH} height={HEIGHT} rx="30" fill="url(#graphBg)" />
          <rect width={WIDTH} height={HEIGHT} rx="30" fill="url(#graphGrid)" opacity="0.48" />

          <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`}>
            <rect
              className="graph-hit-area"
              width={WIDTH}
              height={HEIGHT}
              fill="transparent"
              onPointerDown={handleCanvasPointerDown}
            />

            {visibleEdges.map((edge) => {
              const source = positionedNodeById.get(edge.source_concept_id);
              const target = positionedNodeById.get(edge.target_concept_id);

              if (!source || !target) {
                return null;
              }

              const touchesFocus = edge.source_concept_id === focusId || edge.target_concept_id === focusId;
              const softEdge = source.role === "secondary" && target.role === "secondary";

              return (
                <g key={edge.id} className={`graph-edge ${touchesFocus ? "graph-edge-focus" : ""}`}>
                  <line
                    x1={source.x}
                    y1={source.y}
                    x2={target.x}
                    y2={target.y}
                    stroke={touchesFocus ? "#f6d365" : "rgba(205,232,246,0.32)"}
                    strokeWidth={touchesFocus ? 3.4 : Math.max(1.25, edge.weight * 3.5)}
                    strokeOpacity={softEdge ? 0.38 : 0.76}
                    strokeLinecap="round"
                  />
                </g>
              );
            })}

            {positionedNodes.map((node) => {
              const active = node.id === selectedId;
              const focused = node.id === focusId;
              const isNeighbor = node.role === "primary";
              const radius = focused ? 34 : active ? 26 : isNeighbor ? 23 : 18;
              const labelY = node.y + radius + 20;
              const hiddenCount = hiddenNeighborCounts.get(node.id) ?? 0;
              const isExpanded = expandedNodeSet.has(node.id);
              const canToggle = focusMode && (hiddenCount > 0 || isExpanded);
              const expansionLabel = isExpanded ? "−" : `+${hiddenCount}`;

              return (
                <g
                  key={node.id}
                  className={`graph-node graph-node-${node.role} ${active ? "graph-node-active" : ""} ${
                    focused ? "graph-node-focused" : ""
                  }`}
                  onPointerDown={(event) => handleNodePointerDown(node.id, event)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      onSelectConcept(node.id);
                    }
                  }}
                >
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={radius}
                    fill={focused ? "#f6d365" : active ? "#f2a48f" : isNeighbor ? "#97dffc" : "#65b5cb"}
                    fillOpacity={focused ? 1 : active ? 0.96 : isNeighbor ? 0.94 : 0.82}
                    stroke={focused ? "#fff8e4" : active ? "#ffd7cb" : "rgba(223,246,255,0.9)"}
                    strokeWidth={focused ? 4.5 : active ? 3 : 2}
                  />
                  <text x={node.x} y={labelY} textAnchor="middle" className={`graph-label graph-label-${node.role}`}>
                    {node.title}
                  </text>
                  {canToggle ? (
                    <g
                      className="graph-expander"
                      transform={`translate(${node.x + radius - 2} ${node.y - radius + 4})`}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                        setExpandedNodeIds((current) => toggleExpandedNode(current, node.id));
                      }}
                    >
                      <circle r="12" />
                      <text textAnchor="middle" y="4">
                        {expansionLabel}
                      </text>
                    </g>
                  ) : null}
                </g>
              );
            })}
          </g>
        </svg>

        {selectedNode && isDrawerOpen ? (
          <aside className="graph-drawer">
            <div className="graph-drawer-header">
              <div>
                <p className="eyebrow">{selectedNode.id === focusId ? "Focused concept" : "Selected concept"}</p>
                <h3>{selectedNode.title}</h3>
              </div>
              <span className="panel-badge">{drawerRelatedConcepts.length} links</span>
            </div>

            <p className="muted graph-drawer-copy">{selectedNode.summary}</p>

            <ul className="fact-row graph-drawer-facts">
              <li>
                <strong>{selectedNode.module_ids.length}</strong>
                <span>subjects</span>
              </li>
              <li>
                <strong>{selectedNode.evidence_refs.length}</strong>
                <span>evidence refs</span>
              </li>
              <li>
                <strong>{Math.round(selectedNode.mastery_score * 100)}%</strong>
                <span>mastery</span>
              </li>
            </ul>

            <div className="graph-drawer-section">
              <h4>Relation clusters</h4>
              <div className="graph-cluster-row">
                {drawerClusters.length ? (
                  drawerClusters.map((cluster) => {
                    const active = !activeEdgeTypes.length || activeEdgeTypes.includes(cluster.type);
                    const canFilterMap = drawerConceptId === focusId;

                    return (
                      <button
                        key={cluster.type}
                        className={`graph-cluster-chip ${active ? "graph-cluster-chip-active" : ""}`}
                        type="button"
                        disabled={!canFilterMap}
                        onClick={() => {
                          setActiveEdgeTypes((current) => toggleEdgeType(current, cluster.type, focusClusters));
                        }}
                      >
                        {describeEdge(cluster.type)} · {cluster.count}
                      </button>
                    );
                  })
                ) : (
                  <span className="muted">No relation clusters for this concept yet.</span>
                )}
              </div>
              {drawerConceptId !== focusId ? (
                <p className="muted graph-cluster-note">Center the selected concept to filter the map by its link types.</p>
              ) : null}
            </div>

            <div className="graph-drawer-section">
              <h4>Connected concepts</h4>
              <ul className="compact-list graph-related-list">
                {drawerRelatedConcepts.length ? (
                  drawerRelatedConcepts.map((item) => (
                    <li key={item.node.id}>
                      <button
                        className="graph-related-button"
                        type="button"
                        onClick={() => {
                          onSelectConcept(item.node.id);
                          setIsDrawerOpen(true);
                        }}
                      >
                        <strong>{item.node.title}</strong>
                        <span>
                          {describeEdge(item.edge.type)} · {Math.round(item.edge.weight * 100)}%
                        </span>
                      </button>
                    </li>
                  ))
                ) : (
                  <li>No connected concepts shown yet.</li>
                )}
              </ul>
            </div>

            <div className="graph-drawer-section">
              <h4>How to use it</h4>
              <ul className="compact-list">
                <li>
                  <strong>Drag nodes</strong>
                  <span>Pull ideas around until the map feels natural.</span>
                </li>
                <li>
                  <strong>Select without recentering</strong>
                  <span>Click a node to inspect it, then use Center selected only when you want to rebuild the map.</span>
                </li>
                <li>
                  <strong>Expand branches deliberately</strong>
                  <span>Use the small `+` chips on nodes to reveal more connected ideas one branch at a time.</span>
                </li>
              </ul>
            </div>
          </aside>
        ) : null}
      </div>

      <p className="graph-caption">
        Drag concepts into place, zoom to inspect clusters, and keep the selected idea in the center when you want a
        simpler mind-map view.
      </p>
    </div>
  );
}

function buildEdgeMap(nodes: ConceptNode[], edges: ConceptEdge[]) {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const map = new Map<string, RelatedConcept[]>();

  edges.forEach((edge) => {
    if (!nodeIds.has(edge.source_concept_id) || !nodeIds.has(edge.target_concept_id)) {
      return;
    }

    const source = nodeById.get(edge.source_concept_id);
    const target = nodeById.get(edge.target_concept_id);

    if (!source || !target) {
      return;
    }

    map.set(source.id, [...(map.get(source.id) ?? []), { node: target, edge }]);
    map.set(target.id, [...(map.get(target.id) ?? []), { node: source, edge }]);
  });

  return map;
}

function listRelatedConcepts(
  focusId: string,
  edgeMap: Map<string, RelatedConcept[]>,
  enabledEdgeTypes: ConceptEdge["type"][]
) {
  return (edgeMap.get(focusId) ?? [])
    .filter((item) => enabledEdgeTypes.includes(item.edge.type))
    .sort((left, right) => right.edge.weight - left.edge.weight || left.node.title.localeCompare(right.node.title))
    .slice(0, 8);
}

function buildVisibleNodeIds(
  focusId: string,
  nodes: ConceptNode[],
  edgeMap: Map<string, RelatedConcept[]>,
  focusMode: boolean,
  enabledEdgeTypes: ConceptEdge["type"][],
  expandedNodeIds: Set<string>
) {
  const nodeIds = new Set(nodes.map((node) => node.id));

  if (!focusMode) {
    return nodeIds;
  }

  const visible = new Set<string>([focusId]);
  const queue = [focusId];
  const visited = new Set<string>();

  while (queue.length) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) {
      continue;
    }

    visited.add(currentId);
    const canExpand = expandedNodeIds.has(currentId);
    if (!canExpand) {
      continue;
    }

    (edgeMap.get(currentId) ?? [])
      .filter((item) => enabledEdgeTypes.includes(item.edge.type))
      .forEach((item) => {
        if (!nodeIds.has(item.node.id)) {
          return;
        }

        if (!visible.has(item.node.id)) {
          visible.add(item.node.id);
        }

        if (!visited.has(item.node.id)) {
          queue.push(item.node.id);
        }
      });
  }

  return new Set(Array.from(visible).filter((nodeId) => nodeIds.has(nodeId)));
}

function buildMindMapPositions(nodes: ConceptNode[], edges: ConceptEdge[], focusId?: string) {
  const positions = new Map<string, Pick<PositionedGraphNode, "x" | "y" | "role">>();

  if (!nodes.length) {
    return positions;
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const resolvedFocusId = focusId && nodeById.has(focusId) ? focusId : nodes[0].id;
  const center = { x: WIDTH / 2, y: HEIGHT / 2 };
  const primaryIds = new Set<string>();

  edges.forEach((edge) => {
    if (edge.source_concept_id === resolvedFocusId) {
      primaryIds.add(edge.target_concept_id);
    }
    if (edge.target_concept_id === resolvedFocusId) {
      primaryIds.add(edge.source_concept_id);
    }
  });

  positions.set(resolvedFocusId, { ...center, role: "focus" });

  const primaryNodes = nodes.filter((node) => primaryIds.has(node.id));
  const secondaryNodes = nodes.filter((node) => node.id !== resolvedFocusId && !primaryIds.has(node.id));

  placeOnRing(primaryNodes, center, 180, "primary", positions);
  placeOnRing(secondaryNodes, center, 310, "secondary", positions, Math.PI / 10);

  return positions;
}

function placeOnRing(
  nodes: ConceptNode[],
  center: GraphPoint,
  radius: number,
  role: PositionedGraphNode["role"],
  positions: Map<string, Pick<PositionedGraphNode, "x" | "y" | "role">>,
  angleOffset = 0
) {
  const count = Math.max(nodes.length, 1);

  nodes.forEach((node, index) => {
    const angle = angleOffset + (index / count) * Math.PI * 2;
    positions.set(node.id, {
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius * (role === "secondary" ? 0.72 : 0.84),
      role
    });
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function describeEdge(type: ConceptEdge["type"]) {
  switch (type) {
    case "similar_to":
      return "Similar";
    case "prerequisite_of":
      return "Prerequisite";
    case "part_of":
      return "Part of";
    case "applies_to":
      return "Applies to";
    case "contrasts_with":
      return "Contrasts";
    default:
      return type;
  }
}

function buildRelationClusters(focusId: string, edgeMap: Map<string, RelatedConcept[]>): RelationCluster[] {
  const counts = new Map<ConceptEdge["type"], number>();

  (edgeMap.get(focusId) ?? []).forEach((item) => {
    counts.set(item.edge.type, (counts.get(item.edge.type) ?? 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((left, right) => right.count - left.count || left.type.localeCompare(right.type));
}

function toggleEdgeType(
  current: ConceptEdge["type"][],
  type: ConceptEdge["type"],
  availableClusters: RelationCluster[]
) {
  const allTypes = availableClusters.map((cluster) => cluster.type);
  const base = current.length ? current : allTypes;

  if (base.includes(type)) {
    const next = base.filter((value) => value !== type);
    return next.length ? next : allTypes;
  }

  return [...base, type];
}

function buildHiddenNeighborCounts(
  visibleNodeIds: Set<string>,
  edgeMap: Map<string, RelatedConcept[]>,
  enabledEdgeTypes: ConceptEdge["type"][]
) {
  const counts = new Map<string, number>();

  visibleNodeIds.forEach((nodeId) => {
    const hidden = (edgeMap.get(nodeId) ?? []).filter(
      (item) => enabledEdgeTypes.includes(item.edge.type) && !visibleNodeIds.has(item.node.id)
    ).length;
    counts.set(nodeId, hidden);
  });

  return counts;
}

function toggleExpandedNode(current: string[], nodeId: string) {
  return current.includes(nodeId) ? current.filter((value) => value !== nodeId) : [...current, nodeId];
}


function seedSimulationPositions(
  nodes: ConceptNode[],
  basePositions: Map<string, Pick<PositionedGraphNode, "x" | "y" | "role">>
) {
  return Object.fromEntries(
    nodes.map((node, index) => {
      const base = basePositions.get(node.id) ?? { x: WIDTH / 2, y: HEIGHT / 2 };
      const angle = (index / Math.max(nodes.length, 1)) * Math.PI * 2;
      const jitter = node.id === nodes[0]?.id ? 0 : 18;

      return [
        node.id,
        {
          x: base.x + Math.cos(angle) * jitter,
          y: base.y + Math.sin(angle) * jitter
        }
      ];
    })
  );
}

function runForceStep(input: {
  currentPositions: Record<string, GraphPoint>;
  velocities: Record<string, GraphPoint>;
  visibleNodeIds: string[];
  visibleEdges: ConceptEdge[];
  basePositions: Map<string, Pick<PositionedGraphNode, "x" | "y" | "role">>;
  dragAnchor: DragAnchorState | null;
}) {
  const { currentPositions, velocities, visibleNodeIds, visibleEdges, basePositions, dragAnchor } = input;
  const forces = Object.fromEntries(visibleNodeIds.map((nodeId) => [nodeId, { x: 0, y: 0 }])) as Record<string, GraphPoint>;

  const resolvePosition = (nodeId: string) => {
    if (dragAnchor?.nodeId === nodeId) {
      return dragAnchor.position;
    }

    return currentPositions[nodeId] ?? basePositions.get(nodeId) ?? { x: WIDTH / 2, y: HEIGHT / 2 };
  };

  visibleNodeIds.forEach((nodeId) => {
    const current = resolvePosition(nodeId);

    if (nodeId === dragAnchor?.nodeId) {
      return;
    }

    const minX = WORLD_CENTER.x - WORLD_SOFT_LIMIT_X;
    const maxX = WORLD_CENTER.x + WORLD_SOFT_LIMIT_X;
    const minY = WORLD_CENTER.y - WORLD_SOFT_LIMIT_Y;
    const maxY = WORLD_CENTER.y + WORLD_SOFT_LIMIT_Y;
    const boundaryStrength = 0.012;

    if (current.x < minX) {
      forces[nodeId].x += (minX - current.x) * boundaryStrength;
    } else if (current.x > maxX) {
      forces[nodeId].x -= (current.x - maxX) * boundaryStrength;
    }

    if (current.y < minY) {
      forces[nodeId].y += (minY - current.y) * boundaryStrength;
    } else if (current.y > maxY) {
      forces[nodeId].y -= (current.y - maxY) * boundaryStrength;
    }
  });

  for (let index = 0; index < visibleNodeIds.length; index += 1) {
    const sourceId = visibleNodeIds[index];
    const source = resolvePosition(sourceId);

    for (let comparison = index + 1; comparison < visibleNodeIds.length; comparison += 1) {
      const targetId = visibleNodeIds[comparison];
      const target = resolvePosition(targetId);
      const dx = source.x - target.x;
      const dy = source.y - target.y;
      const distance = Math.max(28, Math.hypot(dx, dy));
      const repulsion = 2200 / (distance * distance);
      const forceX = (dx / distance) * repulsion;
      const forceY = (dy / distance) * repulsion;

      if (sourceId !== dragAnchor?.nodeId) {
        forces[sourceId].x += forceX;
        forces[sourceId].y += forceY;
      }

      if (targetId !== dragAnchor?.nodeId) {
        forces[targetId].x -= forceX;
        forces[targetId].y -= forceY;
      }
    }
  }

  visibleEdges.forEach((edge) => {
    const source = resolvePosition(edge.source_concept_id);
    const target = resolvePosition(edge.target_concept_id);

    if (!source || !target) {
      return;
    }

    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const desiredDistance = 150;
    const spring = (distance - desiredDistance) * 0.016 * Math.max(0.72, edge.weight);
    const forceX = (dx / distance) * spring;
    const forceY = (dy / distance) * spring;

    if (edge.source_concept_id !== dragAnchor?.nodeId) {
      forces[edge.source_concept_id].x += forceX;
      forces[edge.source_concept_id].y += forceY;
    }

    if (edge.target_concept_id !== dragAnchor?.nodeId) {
      forces[edge.target_concept_id].x -= forceX;
      forces[edge.target_concept_id].y -= forceY;
    }
  });

  let totalVelocity = 0;
  const nextPositions: Record<string, GraphPoint> = {};
  const nextVelocities: Record<string, GraphPoint> = {};

  visibleNodeIds.forEach((nodeId) => {
    const current = resolvePosition(nodeId);
    const previousVelocity = velocities[nodeId] ?? { x: 0, y: 0 };

    if (nodeId === dragAnchor?.nodeId) {
      nextPositions[nodeId] = dragAnchor.position;
      nextVelocities[nodeId] = { x: 0, y: 0 };
      return;
    }

    const nextVelocity = {
      x: (previousVelocity.x + forces[nodeId].x) * 0.86,
      y: (previousVelocity.y + forces[nodeId].y) * 0.86
    };
    const nextPosition = {
      x: current.x + nextVelocity.x,
      y: current.y + nextVelocity.y
    };

    totalVelocity += Math.abs(nextVelocity.x) + Math.abs(nextVelocity.y);
    nextPositions[nodeId] = nextPosition;
    nextVelocities[nodeId] = nextVelocity;
  });

  return {
    positions: nextPositions,
    velocities: nextVelocities,
    totalVelocity
  };
}
