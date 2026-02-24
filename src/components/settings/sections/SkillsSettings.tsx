import SkillManager from '../../extensions/SkillManager';
import ZipImporter from '../../extensions/ZipImporter';

export function SkillsSettings() {
  return (
    <div className="flex flex-col h-full">
      <SkillManager />
      <div className="border-t border-border">
        <ZipImporter type="skill" scope="global" />
      </div>
    </div>
  );
}
