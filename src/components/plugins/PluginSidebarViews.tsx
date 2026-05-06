import { useState, useEffect } from 'react';
import { usePluginStore } from '../../stores/plugin-store';
import { Icon } from '../shared/Icon';
import type { PluginTreeView } from '../../../shared/types';

export default function PluginSidebarViews() {
  const { activeViews, getViewChildren } = usePluginStore();
  const sidebarViews = activeViews.filter(v => v.location === 'sidebar');

  if (sidebarViews.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-secondary text-sm p-4">
        No plugin views installed
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {sidebarViews.map(view => (
        <PluginTreeViewPanel key={view.viewId} view={view} getChildren={getViewChildren} />
      ))}
    </div>
  );
}

function PluginTreeViewPanel({
  view,
  getChildren,
}: {
  view: PluginTreeView;
  getChildren: (viewId: string, elementId: string | null) => Promise<unknown[]>;
}) {
  const [items, setItems] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadRoot();
  }, []);

  async function loadRoot() {
    setLoading(true);
    try {
      const children = await getChildren(view.viewId, null);
      setItems(children || []);
    } catch (err) {
      console.error(`Failed to load view ${view.viewId}:`, err);
    } finally {
      setLoading(false);
    }
  }

  async function toggleExpand(item: any) {
    const key = item.id;
    if (expanded.has(key)) {
      setExpanded(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    } else {
      if (!item.children && item.collapsible !== false) {
        const children = await getChildren(view.viewId, item.id);
        item.children = children || [];
      }
      setExpanded(prev => new Set(prev).add(key));
    }
  }

  function renderItem(item: any, depth: number = 0): React.ReactNode {
    const isExpanded = expanded.has(item.id);
    const hasChildren = item.collapsible !== false;

    return (
      <div key={item.id}>
        <button
          className="w-full flex items-center gap-1.5 px-2 py-1 hover:bg-bg-elevated text-left text-sm"
          style={{ paddingLeft: `${8 + depth * 16}px` }}
          onClick={() => {
            if (hasChildren) toggleExpand(item);
            if (item.command) {
              usePluginStore.getState().executeCommand(
                item.command.id,
                item.command.args || []
              );
            }
          }}
        >
          {hasChildren && (
            <Icon
              name={isExpanded ? 'ChevronDown' : 'ChevronRight'}
              className="w-3 h-3 text-text-secondary flex-shrink-0"
            />
          )}
          {item.icon && (
            <Icon
              name={item.icon as any}
              className="w-3.5 h-3.5 text-text-secondary flex-shrink-0"
            />
          )}
          <span className="text-text-primary truncate flex-1">{item.label}</span>
          {item.description && (
            <span className="text-text-secondary text-xs truncate">{item.description}</span>
          )}
        </button>
        {isExpanded && item.children?.map((child: any) => renderItem(child, depth + 1))}
      </div>
    );
  }

  return (
    <div className="border-b border-border">
      <div className="px-3 py-1.5 text-xs font-semibold text-text-secondary uppercase tracking-wider">
        {view.title}
      </div>
      {loading ? (
        <div className="px-3 py-2 text-text-secondary text-xs">Loading...</div>
      ) : (
        items.map((item: any) => renderItem(item))
      )}
    </div>
  );
}
