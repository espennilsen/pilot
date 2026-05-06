// Minimal test plugin — verifies that the Extension Host can load and activate plugins
function activate(pilot) {
  console.log('Hello World plugin activated!');

  // Sidebar view
  pilot.contributions.registerTreeView('hello-sidebar', {
    title: 'Hello World',
    icon: 'smile',
    location: 'sidebar',
  });

  // Panel view
  pilot.contributions.registerTreeView('hello-panel', {
    title: 'Hello Panel',
    icon: 'layout',
    location: 'panel',
  });

  // Status bar
  pilot.contributions.createStatusBarItem('hello-status', {
    text: 'Hello from plugin!',
    alignment: 'right',
    priority: 100,
    tooltip: 'Hello World Plugin is active',
  });

  // Settings section
  pilot.contributions.registerSettingsSection('hello-settings', {
    title: 'Hello World Settings',
    icon: 'settings',
  });

  // Command
  pilot.contributions.registerCommand('hello-world.sayHello', {
    label: 'Hello World: Say Hello',
  });

  return () => {
    console.log('Hello World plugin deactivated');
  };
}

module.exports = { default: activate };
