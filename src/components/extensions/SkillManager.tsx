import { useEffect } from 'react';
import { BookOpen, Trash2 } from 'lucide-react';
import { useExtensionStore } from '../../stores/extension-store';
import type { InstalledSkill } from '../../../shared/types';

export default function SkillManager() {
  const { skills, loadSkills, removeSkill } = useExtensionStore();

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  const handleRemove = async (skillId: string) => {
    if (confirm('Are you sure you want to remove this skill?')) {
      await removeSkill(skillId);
    }
  };

  const globalSkills = skills.filter((s) => s.scope === 'global');
  const projectSkills = skills.filter((s) => s.scope === 'project');
  const builtInSkills = skills.filter((s) => s.scope === 'built-in');

  const getScopeBadgeColor = (scope: string) => {
    switch (scope) {
      case 'built-in':
        return 'bg-accent/20 text-accent';
      case 'global':
        return 'bg-bg-elevated text-text-secondary';
      case 'project':
        return 'bg-warning/20 text-warning';
      default:
        return 'bg-bg-elevated text-text-secondary';
    }
  };

  const SkillItem = ({ skill }: { skill: InstalledSkill }) => (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-border hover:bg-bg-base/50 transition-colors">
      {/* Icon */}
      <div className="w-8 h-8 rounded bg-accent/10 flex items-center justify-center">
        <BookOpen className="w-4 h-4 text-accent" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-sm font-medium text-text-primary truncate">{skill.name}</h3>
          <span className={`text-xs px-2 py-0.5 rounded-full ${getScopeBadgeColor(skill.scope)}`}>
            {skill.scope}
          </span>
        </div>
        <p className="text-xs text-text-secondary truncate">{skill.description}</p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => handleRemove(skill.id)}
          className="p-1.5 rounded hover:bg-error/20 transition-colors"
          title="Remove skill"
        >
          <Trash2 className="w-4 h-4 text-error" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-bg-surface">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-bg-elevated">
        <BookOpen className="w-5 h-5 text-accent" />
        <h2 className="text-sm font-semibold text-text-primary">Skills</h2>
        <span className="text-xs text-text-secondary ml-auto">
          {skills.length} installed
        </span>
      </div>

      {/* Skill List */}
      <div className="flex-1 overflow-y-auto">
        {skills.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 gap-4">
            <BookOpen className="w-12 h-12 text-text-secondary" />
            <p className="text-sm text-text-secondary text-center">
              No skills installed
            </p>
            <p className="text-xs text-text-secondary text-center max-w-md">
              Skills provide specialized instructions for specific tasks.
            </p>
          </div>
        ) : (
          <>
            {/* Built-in Skills */}
            {builtInSkills.length > 0 && (
              <div>
                <div className="px-4 py-2 bg-bg-base sticky top-0">
                  <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                    Built-in
                  </h3>
                </div>
                {builtInSkills.map((skill) => (
                  <SkillItem key={skill.id} skill={skill} />
                ))}
              </div>
            )}

            {/* Global Skills */}
            {globalSkills.length > 0 && (
              <div>
                <div className="px-4 py-2 bg-bg-base sticky top-0">
                  <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                    Global
                  </h3>
                </div>
                {globalSkills.map((skill) => (
                  <SkillItem key={skill.id} skill={skill} />
                ))}
              </div>
            )}

            {/* Project Skills */}
            {projectSkills.length > 0 && (
              <div>
                <div className="px-4 py-2 bg-bg-base sticky top-0">
                  <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                    Project
                  </h3>
                </div>
                {projectSkills.map((skill) => (
                  <SkillItem key={skill.id} skill={skill} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
