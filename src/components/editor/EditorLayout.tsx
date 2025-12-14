"use client";

import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import type { ReactNode } from "react";

interface EditorLayoutProps {
  chatPanel: ReactNode;
  previewPanel: ReactNode;
}

/**
 * EditorLayout - Resizable split pane layout for the editor interface
 * 
 * Left panel: ChatPanel (minSize: 20%, defaultSize: 40%)
 * Right panel: PreviewPanel (minSize: 30%, defaultSize: 60%)
 * 
 * Requirements: 4.1
 */
export function EditorLayout({ chatPanel, previewPanel }: EditorLayoutProps) {
  return (
    <div className="h-full w-full bg-background animate-fade-in">
      <PanelGroup direction="horizontal" className="h-full">
        {/* Chat Panel - Left side */}
        <Panel
          defaultSize={40}
          minSize={20}
          className="flex flex-col"
        >
          <div className="h-full overflow-hidden animate-slide-in-left">
            {chatPanel}
          </div>
        </Panel>

        {/* Resize Handle */}
        <PanelResizeHandle className="w-1 bg-border hover:bg-accent hover:w-1.5 transition-all duration-200 cursor-col-resize group relative">
          <div className="absolute inset-y-0 -left-1 -right-1 group-hover:bg-accent/10 transition-colors duration-200" />
        </PanelResizeHandle>

        {/* Preview Panel - Right side */}
        <Panel
          defaultSize={60}
          minSize={30}
          className="flex flex-col"
        >
          <div className="h-full overflow-hidden animate-slide-in-right">
            {previewPanel}
          </div>
        </Panel>
      </PanelGroup>
    </div>
  );
}

export default EditorLayout;
