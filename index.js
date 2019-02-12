import { resolve } from 'path';

var serverRoute = require('./server/routes/server');
export default function (kibana) {
  return new kibana.Plugin({
    name: 'logtrail',
    require: ['kibana', 'elasticsearch'],
    publicDir: resolve(__dirname, 'public'),
    uiExports: {
      app: {
        title: 'LogTrail',
        description: 'Plugin to view, search & tail logs in Kibana',
        // icon: 'plugins/logtrail/icon.svg',
        euiIconType: 'logtrailApp',
        main: 'plugins/logtrail/app',
        url: '/app/logtrail'
      },
      styleSheetPaths: resolve(__dirname, 'public/css/main.css'),
      home: [
        'plugins/logtrail/register_feature'
      ],
    },
    init: function (server, options) {
      // Add server routes and initalize the plugin here
      serverRoute(server);
    }

  });
};
