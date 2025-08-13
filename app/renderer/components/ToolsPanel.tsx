import React, { useState } from 'react';

export interface Tool {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'inactive' | 'error';
  lastUsed?: number;
}

export interface ToolsPanelProps {
  tools: Tool[];
  onToolToggle?: (toolId: string) => void;
  onToolConfigure?: (toolId: string) => void;
  className?: string;
}

const ToolsPanel: React.FC<ToolsPanelProps> = ({
  tools,
  onToolToggle,
  onToolConfigure,
  className = ''
}) => {
  const [expandedTool, setExpandedTool] = useState<string | null>(null);

  const handleToolClick = (toolId: string) => {
    if (expandedTool === toolId) {
      setExpandedTool(null);
    } else {
      setExpandedTool(toolId);
    }
  };

  const getStatusIcon = (status: Tool['status']) => {
    switch (status) {
      case 'active':
        return '✅';
      case 'inactive':
        return '⏸️';
      case 'error':
        return '❌';
      default:
        return '❓';
    }
  };

  const formatLastUsed = (timestamp?: number) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className={`tools-panel ${className}`}>
      <div className="panel-header">
        <h3>Tools</h3>
        <span className="tool-count">{tools.length}</span>
      </div>
      
      <div className="tools-list">
        {tools.map((tool) => (
          <div key={tool.id} className={`tool-item ${tool.status}`}>
            <div
              className="tool-header"
              onClick={() => handleToolClick(tool.id)}
            >
              <div className="tool-info">
                <span className="tool-status">{getStatusIcon(tool.status)}</span>
                <span className="tool-name">{tool.name}</span>
              </div>
              <div className="tool-actions">
                <span className="expand-icon">
                  {expandedTool === tool.id ? '▼' : '▶'}
                </span>
              </div>
            </div>
            
            {expandedTool === tool.id && (
              <div className="tool-details">
                <p className="tool-description">{tool.description}</p>
                <div className="tool-metadata">
                  <span className="last-used">
                    Last used: {formatLastUsed(tool.lastUsed)}
                  </span>
                </div>
                <div className="tool-controls">
                  <button
                    onClick={() => onToolToggle?.(tool.id)}
                    className="toggle-button"
                  >
                    {tool.status === 'active' ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    onClick={() => onToolConfigure?.(tool.id)}
                    className="configure-button"
                  >
                    Configure
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      
      {tools.length === 0 && (
        <div className="empty-state">
          <p>No tools available</p>
        </div>
      )}
    </div>
  );
};

export default ToolsPanel;