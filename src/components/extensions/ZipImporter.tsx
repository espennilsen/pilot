import { useState } from 'react';
import { Upload, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { useExtensionStore } from '../../stores/extension-store';
import type { ImportResult } from '../../../shared/types';

interface ZipImporterProps {
  type: 'extension' | 'skill';
  scope: 'global' | 'project';
}

export default function ZipImporter({ type, scope }: ZipImporterProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const { importExtensionZip, importSkillZip } = useExtensionStore();

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setImportResult(null);

    const files = Array.from(e.dataTransfer.files);
    const zipFile = files.find((f) => f.name.endsWith('.zip'));

    if (!zipFile) {
      setImportResult({
        success: false,
        id: '',
        name: '',
        type,
        scope,
        error: 'Please drop a .zip file',
      });
      return;
    }

    try {
      const zipPath = window.api.getFilePath?.(zipFile) ?? (zipFile as any).path;
      const result = type === 'extension'
        ? await importExtensionZip(zipPath, scope)
        : await importSkillZip(zipPath, scope);

      setImportResult(result);
    } catch (error) {
      setImportResult({
        success: false,
        id: '',
        name: zipFile.name,
        type,
        scope,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportResult(null);
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const filePath = window.api.getFilePath?.(file) ?? (file as any).path;
      const result = type === 'extension'
        ? await importExtensionZip(filePath, scope)
        : await importSkillZip(filePath, scope);

      setImportResult(result);
    } catch (error) {
      setImportResult({
        success: false,
        id: '',
        name: file.name,
        type,
        scope,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Reset input
    e.target.value = '';
  };

  return (
    <div className="p-4 space-y-4">
      {/* Security Warning */}
      <div className="p-3 bg-error/10 border border-error/30 rounded flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-error flex-shrink-0 mt-0.5" />
        <div className="text-xs text-text-secondary">
          <p className="font-semibold text-error mb-1">Security Warning</p>
          <p>
            {type === 'extension' ? 'Extensions' : 'Skills'} have full access to your system.
            Only import files from trusted sources. Malicious code can compromise your security.
          </p>
        </div>
      </div>

      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-8 transition-colors ${
          isDragging
            ? 'border-accent bg-accent/5'
            : 'border-border hover:border-accent/50 hover:bg-bg-base/50'
        }`}
      >
        <div className="flex flex-col items-center gap-4">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
            isDragging ? 'bg-accent/20' : 'bg-bg-elevated'
          }`}>
            <Upload className={`w-6 h-6 ${isDragging ? 'text-accent' : 'text-text-secondary'}`} />
          </div>
          
          <div className="text-center">
            <p className="text-sm font-medium text-text-primary mb-1">
              Drop a .zip file here
            </p>
            <p className="text-xs text-text-secondary">
              or click to browse
            </p>
          </div>

          <label className="px-4 py-2 bg-accent text-bg-base rounded hover:bg-accent/90 transition-colors text-sm font-medium cursor-pointer">
            Browse Files
            <input
              type="file"
              accept=".zip"
              onChange={handleFileSelect}
              className="hidden"
            />
          </label>

          <div className="text-xs text-text-secondary text-center">
            <p className="font-semibold mb-1">Scope: {scope}</p>
            <p>
              {scope === 'global' 
                ? 'Available across all projects' 
                : 'Available only in this project'}
            </p>
          </div>
        </div>
      </div>

      {/* Import Result */}
      {importResult && (
        <div className={`p-3 rounded flex items-start gap-2 ${
          importResult.success
            ? 'bg-accent/10 border border-accent/30'
            : 'bg-error/10 border border-error/30'
        }`}>
          {importResult.success ? (
            <CheckCircle className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
          ) : (
            <XCircle className="w-4 h-4 text-error flex-shrink-0 mt-0.5" />
          )}
          <div className="text-xs">
            {importResult.success ? (
              <>
                <p className="font-semibold text-accent mb-1">Import Successful</p>
                <p className="text-text-secondary">
                  {importResult.name} has been imported as a {importResult.scope} {importResult.type}.
                </p>
              </>
            ) : (
              <>
                <p className="font-semibold text-error mb-1">Import Failed</p>
                <p className="text-text-secondary">{importResult.error}</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
