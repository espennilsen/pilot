/**
 * @file noVNC iframe wrapper — displays the sandbox virtual display.
 */

interface SandboxViewerProps {
  wsPort: number;
}

export default function SandboxViewer({ wsPort }: SandboxViewerProps) {
  const noVncUrl = `http://localhost:${wsPort}/vnc.html?autoconnect=true&resize=scale&toolbar=0&view_only=false`;

  return (
    <div className="h-full w-full bg-black">
      <iframe
        src={noVncUrl}
        className="w-full h-full border-0"
        title="Sandbox Virtual Display"
        sandbox="allow-scripts allow-same-origin allow-forms"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}
