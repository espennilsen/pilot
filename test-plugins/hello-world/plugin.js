// Minimal test plugin — verifies that the Extension Host can load and activate plugins
function activate(pilot) {
  console.log('Hello World plugin activated!');

  // Register a simple tree view
  pilot.contributions.registerTreeView('hello-world', {
    title: 'Hello World',
    icon: 'smile',
    location: 'sidebar',
  });

  // Register a status bar item
  pilot.contributions.createStatusBarItem('hello-status', {
    text: '$(smile) Hello from plugin!',
    alignment: 'right',
    priority: 100,
    tooltip: 'Hello World Plugin',
  });

  // Return cleanup
  return () => {
    console.log('Hello World plugin deactivated');
  };
}

module.exports = { default: activate };
