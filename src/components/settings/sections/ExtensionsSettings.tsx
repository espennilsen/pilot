import ExtensionManager from '../../extensions/ExtensionManager';
import ZipImporter from '../../extensions/ZipImporter';

export function ExtensionsSettings() {
  return (
    <div className="flex flex-col h-full">
      <ExtensionManager />
      <div className="border-t border-border">
        <ZipImporter type="extension" scope="global" />
      </div>
    </div>
  );
}
