var serverRoute = require('./server/routes/server');

export default function (kibana) {
  return new kibana.Plugin({
    name: 'logtrail',
    require: ['kibana', 'elasticsearch'],
    uiExports: {
      app: {
        title: 'LogTrail',
        description: 'Plugin to view, search & tail logs in Kibana',
        main: 'plugins/logtrail/app'
      },
      hacks: [
      ]
    },
    init: function (server, options) {
      // Add server routes and initalize the plugin here
      serverRoute(server);
    }

  });
};
