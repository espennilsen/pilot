// Agent test plugin — demonstrates tool registration, skill injection, and event interception
function activate(pilot) {
  console.log('Agent Test plugin activated!');

  // Register a status bar item to show the plugin is active
  pilot.contributions.createStatusBarItem('agent-test-status', {
    text: '🤖 Agent Test Plugin',
    alignment: 'right',
    priority: 90,
    tooltip: 'Agent Test Plugin is monitoring tool calls',
  });

  // Register a custom tool
  pilot.agent.registerTool({
    name: 'plugin_hello',
    label: 'PluginHello',
    description: 'Say hello from a plugin tool - returns a greeting',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name to greet' }
      },
      required: ['name']
    },
    execute: async (toolCallId, params) => {
      const name = params.name || 'World';
      return {
        content: [{ type: 'text', text: `Hello ${name} from the Agent Test plugin! 🎉` }],
        details: { fromPlugin: 'agent-test-plugin' }
      };
    }
  });

  // Register a skill that will be injected into the system prompt
  pilot.agent.registerSkill(
    'When working with JSON files, always validate the schema before modifying. Use proper error handling and provide clear feedback to the user.',
    { scope: 'project' }
  );

  // Listen to tool calls - can block or modify them
  pilot.agent.on('tool_call', (event) => {
    console.log('[Agent Test] Saw tool call:', event.toolName);
    
    // Block sudo commands as an example of plugin intervention
    if (event.toolName === 'bash' && event.input?.command?.includes('sudo')) {
      console.log('[Agent Test] Blocking sudo command!');
      return { 
        block: true, 
        reason: 'sudo commands are blocked by agent-test plugin for security' 
      };
    }
    
    // Log all tool calls
    return {};
  });

  // Listen to tool results
  pilot.agent.on('tool_result', (event) => {
    console.log('[Agent Test] Saw tool result:', event.toolName);
    return {};
  });

  // Listen to agent lifecycle events
  pilot.agent.on('agent_start', (event) => {
    console.log('[Agent Test] Agent started');
    return {};
  });

  pilot.agent.on('agent_end', (event) => {
    console.log('[Agent Test] Agent finished');
    return {};
  });

  console.log('[Agent Test] Plugin fully activated with tool, skill, and event listeners');

  return () => {
    console.log('Agent Test plugin deactivated');
  };
}

module.exports = { default: activate };
