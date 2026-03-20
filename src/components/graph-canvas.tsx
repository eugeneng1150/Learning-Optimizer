"use client";

import { ConceptEdge, ConceptNode } from "@/lib/types";

interface GraphCanvasProps {
  nodes: ConceptNode[];
  edges: ConceptEdge[];
  selectedConceptId?: string;
  onSelectConcept: (conceptId: string) => void;
}

export function GraphCanvas({
  nodes,
  edges,
  selectedConceptId,
  onSelectConcept
}: GraphCanvasProps) {
  const safeNodes = nodes.slice(0, 18);
  const width = 760;
  const height = 420;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.34;

  const positionedNodes = safeNodes.map((node, index) => {
    const angle = (index / Math.max(safeNodes.length, 1)) * Math.PI * 2;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;
    return { ...node, x, y };
  });

  const nodeById = new Map(positionedNodes.map((node) => [node.id, node]));

  return (
    <div className="panel graph-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Graph explorer</p>
          <h2>AI concept network</h2>
        </div>
        <span className="panel-badge">{safeNodes.length} nodes</span>
      </div>

      <svg className="graph-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Concept graph">
        <defs>
          <linearGradient id="graphBg" x1="0%" x2="100%" y1="0%" y2="100%">
            <stop offset="0%" stopColor="#0c2432" />
            <stop offset="100%" stopColor="#173f52" />
          </linearGradient>
        </defs>
        <rect width={width} height={height} rx="28" fill="url(#graphBg)" />

        {edges
          .filter((edge) => nodeById.has(edge.source_concept_id) && nodeById.has(edge.target_concept_id))
          .map((edge) => {
            const source = nodeById.get(edge.source_concept_id)!;
            const target = nodeById.get(edge.target_concept_id)!;
            const highlighted =
              selectedConceptId === edge.source_concept_id || selectedConceptId === edge.target_concept_id;

            return (
              <g key={edge.id}>
                <line
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  stroke={highlighted ? "#f6d365" : "rgba(220,240,255,0.22)"}
                  strokeWidth={highlighted ? 3 : Math.max(1, edge.weight * 3)}
                  strokeLinecap="round"
                />
              </g>
            );
          })}

        {positionedNodes.map((node) => {
          const active = node.id === selectedConceptId;

          return (
            <g
              key={node.id}
              className="graph-node"
              onClick={() => onSelectConcept(node.id)}
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
                r={active ? 26 : 22}
                fill={active ? "#f6d365" : "#97dffc"}
                stroke={active ? "#fff9e6" : "#dff6ff"}
                strokeWidth={active ? 4 : 2}
              />
              <text x={node.x} y={node.y + 48} textAnchor="middle" className="graph-label">
                {node.title}
              </text>
            </g>
          );
        })}
      </svg>

      <p className="graph-caption">
        Edges are evidence-backed links such as similarity, prerequisites, and applications. Click a node to inspect
        sources, mastery, and review timing.
      </p>
    </div>
  );
}
