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
    init: function (server) {
      // register feature
      console.log(JSON.stringify(server.plugins));
      const xpackMainPlugin = server.plugins.xpack_main;
      console.log(`****** xpackMainPlugin - ${xpackMainPlugin}`);
      if (xpackMainPlugin) {
        xpackMainPlugin.registerFeature({
          id: 'logtrail',
          name: 'LogTrail',
          app: ['logtrail','kibana'],
          catalogue: [],
          privileges: {
            all: {
              api: [],
              savedObject: {
                all: [],
                read: [],
              },
              ui: ['show'],
            },
            read: {
              api: [],
              savedObject: {
                all: [],
                read: [],
              },
              ui: ['show'],
            },
          },
        });
      }
      // Add server routes and initalize the plugin here
      serverRoute(server);
    }

  });
};
