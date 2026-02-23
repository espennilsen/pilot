/**
 * CommandRegistry — Singleton for dynamic system command registration.
 *
 * Each system (memory, tasks, prompts, etc.) registers its own slash commands
 * during app initialization. The prompt library queries this registry to
 * detect conflicts — it never hardcodes system command names.
 */

interface RegisteredCommand {
  owner: string;
  description: string;
}

type ChangeCallback = () => void;

class CommandRegistryImpl {
  private commands = new Map<string, RegisteredCommand>();
  private listeners = new Set<ChangeCallback>();

  /**
   * Register a system command. Called by each system during app init.
   * Throws if the command is already registered by a different owner.
   */
  register(command: string, owner: string, description: string): void {
    const existing = this.commands.get(command);
    if (existing && existing.owner !== owner) {
      throw new Error(
        `Command "/${command}" is already registered by "${existing.owner}" — cannot register for "${owner}"`
      );
    }
    this.commands.set(command, { owner, description });
    this.emit();
  }

  /**
   * Unregister a command. Only the owning system can unregister.
   */
  unregister(command: string, owner: string): void {
    const existing = this.commands.get(command);
    if (existing && existing.owner === owner) {
      this.commands.delete(command);
      this.emit();
    }
  }

  /**
   * Get a system command entry, or null if not registered.
   */
  getSystemCommand(command: string): { owner: string; description: string } | null {
    return this.commands.get(command) ?? null;
  }

  /**
   * Check if a command is reserved by a system.
   */
  isReserved(command: string): boolean {
    return this.commands.has(command);
  }

  /**
   * Return all registered system commands.
   */
  getAllSystemCommands(): Array<{ command: string; owner: string; description: string }> {
    return Array.from(this.commands.entries()).map(([command, { owner, description }]) => ({
      command,
      owner,
      description,
    }));
  }

  /**
   * Listen for changes (register/unregister). Returns unsubscribe function.
   */
  onChange(callback: ChangeCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private emit(): void {
    for (const cb of this.listeners) {
      try { cb(); } catch { /* ignore listener errors */ }
    }
  }
}

// Singleton instance
export const CommandRegistry = new CommandRegistryImpl();
