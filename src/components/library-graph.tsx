"use client";

import { PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";

import { buildModuleSummaries } from "@/lib/module-summaries";
import { ModuleRecord, SourceDocument } from "@/lib/types";

interface LibraryGraphProps {
  modules: ModuleRecord[];
  sources: SourceDocument[];
  selectedModuleId?: string;
  selectedSourceId?: string;
  onSelectModule: (moduleId: string) => void;
  onOpenSourceQuiz: (source: SourceDocument) => void;
}

interface Point {
  x: number;
  y: number;
}

interface LibraryLayoutBlock {
  subjectPosition: Point;
  notePositions: Map<string, Point>;
  overflowPosition?: Point;
}

interface DragState {
  kind: "subject" | "note";
  id: string;
  moduleId: string;
  pointerOffset: Point;
}

const WIDTH = 1200;
const HEIGHT = 820;
const CENTER = { x: 470, y: HEIGHT / 2 };
const SUBJECT_RADIUS = 46;
const NOTE_MIN_WIDTH = 118;
const NOTE_MAX_WIDTH = 182;
const NOTE_HEIGHT = 42;
const VIEWBOX_PADDING = 42;
const NOTES_PER_RING = 4;
const NOTE_RING_RADIUS = 78;
const NOTE_BASE_DISTANCE = 168;
const MAX_VISIBLE_NOTES_IN_GRAPH = 8;
const SPRING_STIFFNESS = 0.16;
const SPRING_DAMPING = 0.8;
const SPRING_REST = 0.45;

export function LibraryGraph({
  modules,
  sources,
  selectedModuleId,
  selectedSourceId,
  onSelectModule,
  onOpenSourceQuiz
}: LibraryGraphProps) {
  const [expandedModuleIds, setExpandedModuleIds] = useState<string[]>([]);
  const [renderPositions, setRenderPositions] = useState<Record<string, Point>>({});
  const svgRef = useRef<SVGSVGElement | null>(null);
  const positionsRef = useRef<Map<string, Point>>(new Map());
  const velocitiesRef = useRef<Map<string, Point>>(new Map());
  const subjectOffsetsRef = useRef<Map<string, Point>>(new Map());
  const noteOffsetsRef = useRef<Map<string, Point>>(new Map());
  const dragRef = useRef<DragState | null>(null);
  const dragMovedRef = useRef(false);
  const clickSuppressRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);
  const moduleSummaries = useMemo(() => buildModuleSummaries(modules, sources), [modules, sources]);
  const selectedModuleSummary =
    moduleSummaries.find((summary) => summary.module.id === selectedModuleId) ?? moduleSummaries[0];
  const expandedModuleIdSet = new Set(expandedModuleIds);
  const libraryLayout = useMemo(
    () => buildLibraryLayout(moduleSummaries, expandedModuleIdSet),
    [expandedModuleIds, moduleSummaries]
  );

  useEffect(() => {
    if (!selectedModuleSummary?.noteCount) {
      return;
    }

    setExpandedModuleIds((current) =>
      current.includes(selectedModuleSummary.module.id) ? current : [...current, selectedModuleSummary.module.id]
    );
  }, [selectedModuleSummary?.module.id, selectedModuleSummary?.noteCount]);

  useEffect(() => {
    syncRenderNodes();
    startSimulation();

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [libraryLayout, expandedModuleIds]);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const dragState = dragRef.current;
      if (!dragState) {
        return;
      }

      const pointer = toSvgPoint(event.clientX, event.clientY);
      if (!pointer) {
        return;
      }

      const nextPosition = clampPoint({
        x: pointer.x + dragState.pointerOffset.x,
        y: pointer.y + dragState.pointerOffset.y
      });
      const nodeKey = dragState.kind === "subject" ? subjectNodeId(dragState.id) : sourceNodeId(dragState.id);
      const previousPosition = positionsRef.current.get(nodeKey);

      if (
        previousPosition &&
        Math.hypot(nextPosition.x - previousPosition.x, nextPosition.y - previousPosition.y) > 3
      ) {
        dragMovedRef.current = true;
      }

      if (dragState.kind === "subject") {
        const baseSubjectPosition = libraryLayout.blocks.get(dragState.moduleId)?.subjectPosition;
        if (!baseSubjectPosition) {
          return;
        }

        subjectOffsetsRef.current.set(dragState.id, {
          x: nextPosition.x - baseSubjectPosition.x,
          y: nextPosition.y - baseSubjectPosition.y
        });
      } else {
        const baseBlock = libraryLayout.blocks.get(dragState.moduleId);
        const baseNotePosition = baseBlock?.notePositions.get(dragState.id);
        const baseSubjectPosition = baseBlock?.subjectPosition;

        if (!baseBlock || !baseNotePosition || !baseSubjectPosition) {
          return;
        }

        const subjectTarget = getSubjectTarget(dragState.moduleId, libraryLayout, subjectOffsetsRef.current);
        const relativeBasePosition = {
          x: baseNotePosition.x - baseSubjectPosition.x,
          y: baseNotePosition.y - baseSubjectPosition.y
        };

        noteOffsetsRef.current.set(dragState.id, {
          x: nextPosition.x - (subjectTarget.x + relativeBasePosition.x),
          y: nextPosition.y - (subjectTarget.y + relativeBasePosition.y)
        });
      }

      positionsRef.current.set(nodeKey, nextPosition);
      velocitiesRef.current.set(nodeKey, { x: 0, y: 0 });
      syncRenderNodes();
      startSimulation();
    }

    function handlePointerUp() {
      if (!dragRef.current) {
        return;
      }

      clickSuppressRef.current = dragMovedRef.current;
      dragRef.current = null;
      dragMovedRef.current = false;
      startSimulation();
      window.setTimeout(() => {
        clickSuppressRef.current = false;
      }, 0);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [libraryLayout]);

  function syncRenderNodes() {
    const targets = computeNodeTargets(
      libraryLayout,
      moduleSummaries,
      subjectOffsetsRef.current,
      noteOffsetsRef.current
    );
    const currentPositions = positionsRef.current;
    const currentVelocities = velocitiesRef.current;
    const previousKeys = new Set(currentPositions.keys());

    targets.forEach((target, nodeKey) => {
      previousKeys.delete(nodeKey);

      if (!currentPositions.has(nodeKey)) {
        const subjectId = nodeKey.startsWith("source:")
          ? findModuleIdForSource(moduleSummaries, nodeKey.slice("source:".length))
          : nodeKey.slice("subject:".length);
        const subjectTarget = subjectId ? targets.get(subjectNodeId(subjectId)) : undefined;
        const seededPosition =
          nodeKey.startsWith("source:") && subjectTarget
            ? pointOnCircleEdge(subjectTarget, target, SUBJECT_RADIUS)
            : target;

        currentPositions.set(nodeKey, seededPosition);
        currentVelocities.set(nodeKey, { x: 0, y: 0 });
      }
    });

    previousKeys.forEach((nodeKey) => {
      currentPositions.delete(nodeKey);
      currentVelocities.delete(nodeKey);
    });

    setRenderPositions(Object.fromEntries(currentPositions.entries()));
  }

  function startSimulation() {
    if (animationFrameRef.current !== null) {
      return;
    }

    const step = () => {
      animationFrameRef.current = null;
      const targets = computeNodeTargets(
        libraryLayout,
        moduleSummaries,
        subjectOffsetsRef.current,
        noteOffsetsRef.current
      );
      const dragState = dragRef.current;
      let shouldContinue = false;

      targets.forEach((target, nodeKey) => {
        const currentPosition = positionsRef.current.get(nodeKey) ?? target;
        const velocity = velocitiesRef.current.get(nodeKey) ?? { x: 0, y: 0 };
        const isDragged =
          dragState &&
          ((dragState.kind === "subject" && nodeKey === subjectNodeId(dragState.id)) ||
            (dragState.kind === "note" && nodeKey === sourceNodeId(dragState.id)));

        if (isDragged) {
          positionsRef.current.set(nodeKey, currentPosition);
          velocitiesRef.current.set(nodeKey, { x: 0, y: 0 });
          shouldContinue = true;
          return;
        }

        const nextVelocity = {
          x: (velocity.x + (target.x - currentPosition.x) * SPRING_STIFFNESS) * SPRING_DAMPING,
          y: (velocity.y + (target.y - currentPosition.y) * SPRING_STIFFNESS) * SPRING_DAMPING
        };
        const nextPosition = {
          x: currentPosition.x + nextVelocity.x,
          y: currentPosition.y + nextVelocity.y
        };

        positionsRef.current.set(nodeKey, nextPosition);
        velocitiesRef.current.set(nodeKey, nextVelocity);

        if (
          Math.abs(target.x - nextPosition.x) > SPRING_REST ||
          Math.abs(target.y - nextPosition.y) > SPRING_REST ||
          Math.abs(nextVelocity.x) > SPRING_REST ||
          Math.abs(nextVelocity.y) > SPRING_REST
        ) {
          shouldContinue = true;
        }
      });

      setRenderPositions(Object.fromEntries(positionsRef.current.entries()));

      if (shouldContinue || dragRef.current) {
        animationFrameRef.current = window.requestAnimationFrame(step);
      }
    };

    animationFrameRef.current = window.requestAnimationFrame(step);
  }

  function toSvgPoint(clientX: number, clientY: number): Point | null {
    const svg = svgRef.current;
    if (!svg) {
      return null;
    }

    const bounds = svg.getBoundingClientRect();
    if (!bounds.width || !bounds.height) {
      return null;
    }

    return {
      x: ((clientX - bounds.left) / bounds.width) * WIDTH,
      y: ((clientY - bounds.top) / bounds.height) * libraryLayout.height
    };
  }

  function handleNodePointerDown(
    event: ReactPointerEvent<SVGGElement>,
    node: { kind: "subject" | "note"; id: string; moduleId: string }
  ) {
    const pointer = toSvgPoint(event.clientX, event.clientY);
    if (!pointer) {
      return;
    }

    const nodeKey = node.kind === "subject" ? subjectNodeId(node.id) : sourceNodeId(node.id);
    const currentPosition = renderPositions[nodeKey];
    if (!currentPosition) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    dragMovedRef.current = false;
    dragRef.current = {
      ...node,
      pointerOffset: {
        x: currentPosition.x - pointer.x,
        y: currentPosition.y - pointer.y
      }
    };
    startSimulation();
  }

  return (
    <div className="panel graph-panel">
      <div className="panel-header graph-panel-header">
        <div>
          <p className="eyebrow">Stage 2</p>
          <h2>Library map</h2>
        </div>
        <div className="graph-controls">
          <button className="ghost-button" type="button" onClick={() => setExpandedModuleIds([])}>
            Collapse notes
          </button>
        </div>
      </div>

      <div className="graph-stage graph-stage-drawer-open">
        <svg
          ref={svgRef}
          className="graph-svg graph-svg-interactive"
          viewBox={`0 0 ${WIDTH} ${libraryLayout.height}`}
          role="img"
          aria-label="Subject and note map"
        >
          <defs>
            <linearGradient id="libraryBg" x1="0%" x2="100%" y1="0%" y2="100%">
              <stop offset="0%" stopColor="#08131f" />
              <stop offset="58%" stopColor="#0f3043" />
              <stop offset="100%" stopColor="#18445c" />
            </linearGradient>
            <pattern id="libraryGrid" width="56" height="56" patternUnits="userSpaceOnUse">
              <path d="M 56 0 L 0 0 0 56" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
            </pattern>
            <marker id="libraryArrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(205,232,246,0.74)" />
            </marker>
          </defs>

          <rect width={WIDTH} height={libraryLayout.height} rx="30" fill="url(#libraryBg)" />
          <rect width={WIDTH} height={libraryLayout.height} rx="30" fill="url(#libraryGrid)" opacity="0.48" />

          {moduleSummaries.map((summary) => {
            const layoutBlock = libraryLayout.blocks.get(summary.module.id);
            const subjectPosition = layoutBlock?.subjectPosition ?? CENTER;
            const isSelected = summary.module.id === selectedModuleSummary?.module.id;
            const isExpanded = expandedModuleIdSet.has(summary.module.id);
            const notePositions = layoutBlock?.notePositions ?? new Map<string, Point>();
            const visibleSources = summary.sources.slice(0, MAX_VISIBLE_NOTES_IN_GRAPH);
            const hiddenCount = Math.max(0, summary.sources.length - visibleSources.length);
            const overflowLabel = `+${hiddenCount} more`;
            const overflowWidth = getNoteWidth(overflowLabel);
            const overflowPosition = layoutBlock?.overflowPosition
              ? renderPositions[overflowNodeId(summary.module.id)] ?? layoutBlock.overflowPosition
              : undefined;

            return (
              <g key={summary.module.id}>
                {isExpanded
                  ? visibleSources.map((source, sourceIndex) => {
                      const notePosition = renderPositions[sourceNodeId(source.id)] ?? notePositions.get(source.id);
                      if (!notePosition) {
                        return null;
                      }

                      const isSelectedNote = source.id === selectedSourceId;
                      const noteLabel = truncateLabel(source.title, 18);
                      const noteWidth = getNoteWidth(noteLabel);
                      const edgePath = buildLibraryEdgePath(
                        renderPositions[subjectNodeId(summary.module.id)] ?? subjectPosition,
                        notePosition,
                        sourceIndex,
                        visibleSources.length + (hiddenCount ? 1 : 0),
                        noteWidth
                      );

                      return (
                        <g key={source.id} className={`library-note ${isSelectedNote ? "library-note-selected" : ""}`}>
                          <path
                            d={edgePath}
                            stroke="rgba(205,232,246,0.44)"
                            strokeWidth="2.4"
                            strokeLinecap="round"
                            fill="none"
                            markerEnd="url(#libraryArrow)"
                          />
                          <g
                            className="library-note-button"
                            role="button"
                            tabIndex={0}
                            onPointerDown={(event) =>
                              handleNodePointerDown(event, {
                                kind: "note",
                                id: source.id,
                                moduleId: summary.module.id
                              })
                            }
                            onClick={() => {
                              if (clickSuppressRef.current) {
                                return;
                              }

                              onOpenSourceQuiz(source);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                onOpenSourceQuiz(source);
                              }
                            }}
                          >
                            <rect
                              x={notePosition.x - noteWidth / 2}
                              y={notePosition.y - NOTE_HEIGHT / 2}
                              rx="18"
                              width={noteWidth}
                              height={NOTE_HEIGHT}
                            />
                            <text x={notePosition.x} y={notePosition.y + 4} textAnchor="middle">
                              {noteLabel}
                            </text>
                          </g>
                        </g>
                      );
                    })
                  : null}

                {isExpanded && hiddenCount && overflowPosition ? (
                  <g className="library-note library-overflow-note">
                    <path
                      d={buildLibraryEdgePath(
                        renderPositions[subjectNodeId(summary.module.id)] ?? subjectPosition,
                        overflowPosition,
                        visibleSources.length,
                        visibleSources.length + 1,
                        overflowWidth
                      )}
                      stroke="rgba(247, 201, 95, 0.52)"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      fill="none"
                      markerEnd="url(#libraryArrow)"
                    />
                    <g
                      className="library-note-button"
                      role="button"
                      tabIndex={0}
                      onClick={() => onSelectModule(summary.module.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          onSelectModule(summary.module.id);
                        }
                      }}
                    >
                      <rect
                        x={overflowPosition.x - overflowWidth / 2}
                        y={overflowPosition.y - NOTE_HEIGHT / 2}
                        rx="18"
                        width={overflowWidth}
                        height={NOTE_HEIGHT}
                      />
                      <text x={overflowPosition.x} y={overflowPosition.y + 4} textAnchor="middle">
                        {overflowLabel}
                      </text>
                    </g>
                  </g>
                ) : null}

                <g
                  className={`library-subject ${isSelected ? "library-subject-selected" : ""}`}
                  role="button"
                  tabIndex={0}
                  onPointerDown={(event) =>
                    handleNodePointerDown(event, {
                      kind: "subject",
                      id: summary.module.id,
                      moduleId: summary.module.id
                    })
                  }
                  onClick={() => {
                    if (clickSuppressRef.current) {
                      return;
                    }

                    onSelectModule(summary.module.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      onSelectModule(summary.module.id);
                    }
                  }}
                >
                  <circle
                    cx={(renderPositions[subjectNodeId(summary.module.id)] ?? subjectPosition).x}
                    cy={(renderPositions[subjectNodeId(summary.module.id)] ?? subjectPosition).y}
                    r={SUBJECT_RADIUS}
                  />
                  <text
                    x={(renderPositions[subjectNodeId(summary.module.id)] ?? subjectPosition).x}
                    y={(renderPositions[subjectNodeId(summary.module.id)] ?? subjectPosition).y + 4}
                    textAnchor="middle"
                    className="library-subject-code"
                  >
                    {summary.module.code ?? truncateLabel(summary.module.title, 8)}
                  </text>
                  <text
                    x={(renderPositions[subjectNodeId(summary.module.id)] ?? subjectPosition).x}
                    y={(renderPositions[subjectNodeId(summary.module.id)] ?? subjectPosition).y + SUBJECT_RADIUS + 24}
                    textAnchor="middle"
                    className="graph-label"
                  >
                    {summary.module.title}
                  </text>
                </g>

                <g
                  className="library-count-badge"
                  transform={`translate(${
                    (renderPositions[subjectNodeId(summary.module.id)] ?? subjectPosition).x + 30
                  } ${(renderPositions[subjectNodeId(summary.module.id)] ?? subjectPosition).y - 30})`}
                >
                  <circle r="18" />
                  <text textAnchor="middle" y="5">
                    {summary.noteCount}
                  </text>
                </g>

                <g
                  className="graph-expander"
                  transform={`translate(${
                    (renderPositions[subjectNodeId(summary.module.id)] ?? subjectPosition).x - SUBJECT_RADIUS + 8
                  } ${(renderPositions[subjectNodeId(summary.module.id)] ?? subjectPosition).y - SUBJECT_RADIUS + 8})`}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!summary.noteCount) {
                      onSelectModule(summary.module.id);
                      return;
                    }

                    setExpandedModuleIds((current) =>
                      current.includes(summary.module.id)
                        ? current.filter((moduleId) => moduleId !== summary.module.id)
                        : [...current, summary.module.id]
                    );
                    onSelectModule(summary.module.id);
                  }}
                >
                  <circle r="12" />
                  <text textAnchor="middle" y="4">
                    {summary.noteCount ? (isExpanded ? "−" : "+") : "0"}
                  </text>
                </g>
              </g>
            );
          })}
        </svg>

        <aside className="graph-drawer">
          {selectedModuleSummary ? (
            <>
              <div className="graph-drawer-header">
                <div>
                  <p className="eyebrow">Selected subject</p>
                  <h3>{selectedModuleSummary.module.title}</h3>
                </div>
                <span className="panel-badge">{selectedModuleSummary.noteCount} notes</span>
              </div>

              <p className="muted graph-drawer-copy">{selectedModuleSummary.module.description}</p>

              <ul className="fact-row graph-drawer-facts">
                <li>
                  <strong>{selectedModuleSummary.noteCount}</strong>
                  <span>notes</span>
                </li>
                <li>
                  <strong>{selectedModuleSummary.latestSource ? truncateLabel(selectedModuleSummary.latestSource.title, 10) : "None"}</strong>
                  <span>latest</span>
                </li>
                <li>
                  <strong>{selectedModuleSummary.module.code ?? "No code"}</strong>
                  <span>subject code</span>
                </li>
              </ul>

              <div className="graph-drawer-section">
                <h4>Notes in this subject</h4>
                <ul className="compact-list graph-related-list">
                  {selectedModuleSummary.sources.length ? (
                    selectedModuleSummary.sources.map((source) => (
                      <li key={source.id}>
                        <button className="graph-related-button" type="button" onClick={() => onOpenSourceQuiz(source)}>
                          <strong>{source.title}</strong>
                          <span>{formatCreatedAt(source.createdAt)} · Open note quiz</span>
                        </button>
                      </li>
                    ))
                  ) : (
                    <li>
                      <strong>No notes yet</strong>
                      <span>Upload notes for this subject, then expand the node to see them here.</span>
                    </li>
                  )}
                </ul>
              </div>
            </>
          ) : (
            <div className="empty-state">Create a subject in upload to see it here.</div>
          )}
        </aside>
      </div>

      <p className="graph-caption">
        Subjects appear immediately in the library map. Expand a subject to reveal its notes, then click a note to
        open a quiz from that material. Large subjects show the first few notes in-graph and group the rest behind a
        +N node while the drawer keeps the full list.
      </p>
    </div>
  );
}

function buildLibraryLayout(
  moduleSummaries: ReturnType<typeof buildModuleSummaries>,
  expandedModuleIdSet: Set<string>
) {
  const blocks = new Map<string, LibraryLayoutBlock>();
  const count = Math.max(moduleSummaries.length, 1);
  const orbitX = Math.min(260, 170 + count * 18);
  const orbitY = Math.min(220, 130 + count * 15);

  moduleSummaries.forEach((summary, index) => {
    const isExpanded = expandedModuleIdSet.has(summary.module.id);
    const notePositions = new Map<string, Point>();
    let overflowPosition: Point | undefined;
    const angle = count === 1 ? -Math.PI / 2 : -Math.PI / 2 + (index / count) * Math.PI * 2;
    const subjectPosition = clampPoint({
      x: CENTER.x + Math.cos(angle) * orbitX,
      y: CENTER.y + Math.sin(angle) * orbitY
    });

    if (isExpanded && summary.sources.length) {
      const outwardAngle = Math.atan2(subjectPosition.y - CENTER.y, subjectPosition.x - CENTER.x);
      const visibleSources = summary.sources.slice(0, MAX_VISIBLE_NOTES_IN_GRAPH);
      const hiddenCount = Math.max(0, summary.sources.length - visibleSources.length);
      const graphNodes = [
        ...visibleSources.map((source) => ({
          id: source.id,
          width: getNoteWidth(truncateLabel(source.title, 18)),
          kind: "source" as const
        })),
        ...(hiddenCount
          ? [
              {
                id: overflowNodeId(summary.module.id),
                width: getNoteWidth(`+${hiddenCount} more`),
                kind: "overflow" as const
              }
            ]
          : [])
      ];

      for (let ring = 0; ring * NOTES_PER_RING < graphNodes.length; ring += 1) {
        const ringNodes = graphNodes.slice(ring * NOTES_PER_RING, (ring + 1) * NOTES_PER_RING);
        const distance = NOTE_BASE_DISTANCE + ring * NOTE_RING_RADIUS;
        const widestLabel = Math.max(...ringNodes.map((node) => node.width));
        const angleStep = Math.max(0.32, (widestLabel + 28) / distance);
        const angleSpread = Math.min(Math.PI * 0.98, angleStep * Math.max(ringNodes.length - 1, 1));
        const startAngle = outwardAngle - angleSpread / 2;

        ringNodes.forEach((node, indexInRing) => {
          const noteAngle =
            ringNodes.length === 1
              ? outwardAngle
              : startAngle + (indexInRing / Math.max(ringNodes.length - 1, 1)) * angleSpread;

          const resolvedPoint = clampPoint({
            x: subjectPosition.x + Math.cos(noteAngle) * distance,
            y: subjectPosition.y + Math.sin(noteAngle) * distance
          });

          if (node.kind === "overflow") {
            overflowPosition = resolvedPoint;
          } else {
            notePositions.set(node.id, resolvedPoint);
          }
        });
      }
    }

    blocks.set(summary.module.id, { subjectPosition, notePositions, overflowPosition });
  });

  return {
    blocks,
    height: HEIGHT
  };
}

function computeNodeTargets(
  libraryLayout: ReturnType<typeof buildLibraryLayout>,
  moduleSummaries: ReturnType<typeof buildModuleSummaries>,
  subjectOffsets: Map<string, Point>,
  noteOffsets: Map<string, Point>
) {
  const targets = new Map<string, Point>();

  moduleSummaries.forEach((summary) => {
    const baseBlock = libraryLayout.blocks.get(summary.module.id);
    if (!baseBlock) {
      return;
    }

    const subjectTarget = getSubjectTarget(summary.module.id, libraryLayout, subjectOffsets);
    targets.set(subjectNodeId(summary.module.id), subjectTarget);

    baseBlock.notePositions.forEach((baseNotePosition, sourceId) => {
      const noteOffset = noteOffsets.get(sourceId) ?? { x: 0, y: 0 };
      const relativePosition = {
        x: baseNotePosition.x - baseBlock.subjectPosition.x,
        y: baseNotePosition.y - baseBlock.subjectPosition.y
      };

      targets.set(sourceNodeId(sourceId), {
        x: subjectTarget.x + relativePosition.x + noteOffset.x,
        y: subjectTarget.y + relativePosition.y + noteOffset.y
      });
    });

    if (baseBlock.overflowPosition) {
      const relativeOverflowPosition = {
        x: baseBlock.overflowPosition.x - baseBlock.subjectPosition.x,
        y: baseBlock.overflowPosition.y - baseBlock.subjectPosition.y
      };

      targets.set(overflowNodeId(summary.module.id), {
        x: subjectTarget.x + relativeOverflowPosition.x,
        y: subjectTarget.y + relativeOverflowPosition.y
      });
    }
  });

  return targets;
}

function getSubjectTarget(
  moduleId: string,
  libraryLayout: ReturnType<typeof buildLibraryLayout>,
  subjectOffsets: Map<string, Point>
) {
  const baseSubjectPosition = libraryLayout.blocks.get(moduleId)?.subjectPosition ?? CENTER;
  const offset = subjectOffsets.get(moduleId) ?? { x: 0, y: 0 };

  return clampPoint({
    x: baseSubjectPosition.x + offset.x,
    y: baseSubjectPosition.y + offset.y
  });
}

function clampPoint(point: Point): Point {
  return {
    x: Math.max(VIEWBOX_PADDING, Math.min(WIDTH - VIEWBOX_PADDING, point.x)),
    y: Math.max(VIEWBOX_PADDING, Math.min(HEIGHT - VIEWBOX_PADDING, point.y))
  };
}

function pointOnCircleEdge(from: Point, to: Point, radius: number) {
  const direction = normalizeVector({ x: to.x - from.x, y: to.y - from.y });

  return {
    x: from.x + direction.x * radius,
    y: from.y + direction.y * radius
  };
}

function pointOnRectEdge(center: Point, toward: Point) {
  const direction = normalizeVector({ x: toward.x - center.x, y: toward.y - center.y });
  const scale = Math.min(
    NOTE_MAX_WIDTH / 2 / Math.max(Math.abs(direction.x), 0.0001),
    NOTE_HEIGHT / 2 / Math.max(Math.abs(direction.y), 0.0001)
  );

  return {
    x: center.x + direction.x * scale,
    y: center.y + direction.y * scale
  };
}

function normalizeVector(vector: Point) {
  const length = Math.hypot(vector.x, vector.y) || 1;

  return {
    x: vector.x / length,
    y: vector.y / length
  };
}

function buildLibraryEdgePath(from: Point, to: Point, index: number, total: number, noteWidth: number) {
  const start = pointOnCircleEdge(from, to, SUBJECT_RADIUS);
  const end = pointOnRectEdgeWithWidth(to, from, noteWidth);
  const direction = normalizeVector({ x: end.x - start.x, y: end.y - start.y });
  const perpendicular = { x: -direction.y, y: direction.x };
  const fanOffset = (index - (total - 1) / 2) * Math.max(14, Math.min(24, noteWidth * 0.12));
  const midpoint = {
    x: (start.x + end.x) / 2 + perpendicular.x * fanOffset,
    y: (start.y + end.y) / 2 + perpendicular.y * fanOffset
  };

  return `M ${start.x} ${start.y} Q ${midpoint.x} ${midpoint.y} ${end.x} ${end.y}`;
}

function subjectNodeId(moduleId: string) {
  return `subject:${moduleId}`;
}

function sourceNodeId(sourceId: string) {
  return `source:${sourceId}`;
}

function overflowNodeId(moduleId: string) {
  return `overflow:${moduleId}`;
}

function getNoteWidth(label: string) {
  return Math.max(NOTE_MIN_WIDTH, Math.min(NOTE_MAX_WIDTH, 42 + label.length * 7));
}

function pointOnRectEdgeWithWidth(center: Point, toward: Point, width: number) {
  const direction = normalizeVector({ x: toward.x - center.x, y: toward.y - center.y });
  const scale = Math.min(
    width / 2 / Math.max(Math.abs(direction.x), 0.0001),
    NOTE_HEIGHT / 2 / Math.max(Math.abs(direction.y), 0.0001)
  );

  return {
    x: center.x + direction.x * scale,
    y: center.y + direction.y * scale
  };
}

function findModuleIdForSource(
  moduleSummaries: ReturnType<typeof buildModuleSummaries>,
  sourceId: string
) {
  return moduleSummaries.find((summary) => summary.sources.some((source) => source.id === sourceId))?.module.id;
}

function truncateLabel(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, Math.max(1, maxLength - 3))}...` : value;
}

function formatCreatedAt(value: string) {
  try {
    return new Date(value).toISOString().slice(0, 10);
  } catch {
    return value;
  }
}
