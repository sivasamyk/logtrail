var serverRoute = require('./server/routes/server');
module.exports = function (kibana) {
  return new kibana.Plugin({
    name: 'logtrail',
    require: ['kibana', 'elasticsearch'],
    uiExports: {
      app: {
        title: 'LogTrail',
        description: 'Plugin to view, search & tail logs in Kibana',
        main: 'plugins/logtrail/app',
        url: '/app/logtrail',
        injectVars: function (server, options) {
          var config = server.config();
          return {
            kbnIndex: config.get('kibana.index'),
            esShardTimeout: config.get('elasticsearch.shardTimeout'),
            esApiVersion: config.get('elasticsearch.apiVersion')
          };
        }
      }
    },    
    init: function (server, options) {
      // Add server routes and initalize the plugin here
      serverRoute(server);
    }

  });
};
