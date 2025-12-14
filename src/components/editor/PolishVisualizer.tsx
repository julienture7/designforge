"use client";

import { useState, useEffect } from "react";

interface PolishPhase {
  id: string;
  name: string;
  description: string;
  icon: string;
}

interface PhaseState {
  status: "pending" | "running" | "complete" | "error" | "skipped";
  appliedFixes: number;
  failedFixes: number;
  duration: number;
  error?: string;
}

interface PolishVisualizerProps {
  isActive: boolean;
  phases: PolishPhase[];
  phaseStates: Record<string, PhaseState>;
  currentPhaseId: string | null;
  totalFixes: number;
  totalDuration: number;
}

/**
 * PolishVisualizer - Beautiful design polishing progress visualization
 * Updated for Light Mode to match new Sidebar
 */
export function PolishVisualizer({
  isActive,
  phases,
  phaseStates,
  currentPhaseId,
  totalFixes,
  totalDuration,
}: PolishVisualizerProps) {
  const [showDetails, setShowDetails] = useState(false);

  // Calculate progress
  const completedPhases = phases.filter(p =>
    phaseStates[p.id]?.status === "complete" || phaseStates[p.id]?.status === "skipped"
  ).length;
  const progressPercent = phases.length > 0 ? (completedPhases / phases.length) * 100 : 0;
  const isAllComplete = completedPhases === phases.length && phases.length > 0;

  if (!isActive && Object.keys(phaseStates).length === 0) {
    return null;
  }

  return (
    <div className="polish-visualizer">
      {/* Header */}
      <div className="polish-header">
        <div className="polish-header-top">
          <div className="polish-title">
            <span className="polish-icon">{isAllComplete ? "✅" : "🔧"}</span>
            <span>{isAllComplete ? "Refinement Complete" : "Refining Design"}</span>
          </div>
          <div className="polish-stats">
            {totalFixes > 0 && (
              <span className="fixes-badge">
                <span className="fix-icon">🔨</span>
                {totalFixes} fix{totalFixes !== 1 ? "es" : ""}
              </span>
            )}
            {isAllComplete && (
              <span className="duration-badge">{(totalDuration / 1000).toFixed(1)}s</span>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="progress-container">
          <div
            className={`progress-fill ${isAllComplete ? "complete" : ""}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Phases */}
      <div className="polish-phases">
        {phases.map((phase, index) => {
          const state = phaseStates[phase.id] || {
            status: "pending",
            appliedFixes: 0,
            failedFixes: 0,
            duration: 0
          };
          const isCurrent = currentPhaseId === phase.id;

          return (
            <div
              key={phase.id}
              className={`polish-phase ${state.status} ${isCurrent ? "current" : ""}`}
            >
              {/* Phase indicator */}
              <div className="phase-indicator">
                {state.status === "running" ? (
                  <div className="phase-spinner" />
                ) : state.status === "complete" ? (
                  <div className="phase-check">
                    {state.appliedFixes > 0 ? (
                      <span className="fix-count">{state.appliedFixes}</span>
                    ) : (
                      <span>✓</span>
                    )}
                  </div>
                ) : state.status === "error" ? (
                  <div className="phase-error-icon">!</div>
                ) : state.status === "skipped" ? (
                  <div className="phase-skip">—</div>
                ) : (
                  <span className="phase-icon-emoji">{phase.icon}</span>
                )}
              </div>

              {/* Phase info */}
              <div className="phase-info">
                <div className="phase-name">{phase.name}</div>
                <div className="phase-description">
                  {state.status === "running"
                    ? "Analyzing..."
                    : state.status === "complete" && state.appliedFixes > 0
                      ? `Fixed ${state.appliedFixes} issue${state.appliedFixes !== 1 ? "s" : ""}`
                      : state.status === "complete"
                        ? "No issues found"
                        : phase.description}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <style jsx>{`
        .polish-visualizer {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 14px;
          margin-top: 12px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
          animation: slideInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @keyframes slideInUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .polish-header {
          margin-bottom: 12px;
        }

        .polish-header-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 10px;
        }

        .polish-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 600;
          color: #111827;
        }

        .polish-icon {
          font-size: 15px;
        }

        .polish-stats {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .fixes-badge {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          color: #16a34a;
          background: #dcfce7;
          padding: 3px 8px;
          border-radius: 10px;
          font-weight: 500;
        }

        .fix-icon {
          font-size: 10px;
        }

        .duration-badge {
          font-size: 11px;
          color: #6b7280;
        }

        .progress-container {
          height: 4px;
          background: #f3f4f6;
          border-radius: 2px;
          overflow: hidden;
          position: relative;
        }

        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #22c55e 0%, #3b82f6 100%);
          border-radius: 2px;
          transition: width 0.4s ease-out;
          position: relative;
        }

        .progress-fill.complete {
          background: linear-gradient(90deg, #22c55e 0%, #16a34a 100%);
        }

        .polish-phases {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .polish-phase {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 10px;
          background: #f9fafb;
          border-radius: 8px;
          border: 1px solid transparent;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          animation: phaseSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          opacity: 0;
        }

        .polish-phase:nth-child(1) { animation-delay: 0.05s; }
        .polish-phase:nth-child(2) { animation-delay: 0.1s; }
        .polish-phase:nth-child(3) { animation-delay: 0.15s; }
        .polish-phase:nth-child(4) { animation-delay: 0.2s; }
        .polish-phase:nth-child(5) { animation-delay: 0.25s; }

        @keyframes phaseSlideIn {
          from {
            opacity: 0;
            transform: translateX(-10px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        .polish-phase:hover {
          transform: translateX(2px);
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }

        .polish-phase.current {
          border-color: #bfdbfe;
          background: #eff6ff;
        }

        .polish-phase.running {
          border-color: #93c5fd;
        }

        .polish-phase.complete {
          background: white;
          border-color: #f3f4f6;
        }

        .phase-indicator {
          width: 26px;
          height: 26px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          background: white;
          border: 1px solid #e5e7eb;
          font-size: 12px;
        }

        .polish-phase.running .phase-indicator {
          background: white;
          border-color: #3b82f6;
        }

        .polish-phase.complete .phase-indicator {
          background: #f0fdf4;
          border-color: #86efac;
        }

        .phase-spinner {
          width: 12px;
          height: 12px;
          border: 2px solid #e5e7eb;
          border-top-color: #3b82f6;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .phase-check {
          color: #16a34a;
          font-size: 11px;
          font-weight: 600;
        }

        .fix-count {
          background: #22c55e;
          color: white;
          border-radius: 50%;
          width: 16px;
          height: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 9px;
          font-weight: bold;
        }

        .phase-error-icon {
          color: #ef4444;
          font-weight: bold;
        }

        .phase-skip {
          color: #9ca3af;
        }

        .phase-icon-emoji {
          font-size: 13px;
        }

        .phase-info {
          flex: 1;
          min-width: 0;
        }

        .phase-name {
          font-size: 12px;
          font-weight: 600;
          color: #374151;
        }

        .phase-description {
          font-size: 10px;
          color: #6b7280;
          margin-top: 1px;
        }

        .polish-phase.complete .phase-description {
          color: #16a34a;
        }

        .phase-meta {
          flex-shrink: 0;
        }

        .phase-duration {
          font-size: 10px;
          color: #9ca3af;
        }

        .phase-running {
          color: #3b82f6;
        }

        .dot-pulse {
          animation: dot-pulse 1s ease-in-out infinite;
        }

        @keyframes dot-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

export default PolishVisualizer;
