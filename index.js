import serverRoute from './server/routes/server';
import validateEsRoute from './server/routes/validate_es';

export default function (kibana) {
  return new kibana.Plugin({
    require: ['elasticsearch'],

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

    config(Joi) {
      return Joi.object({
        enabled: Joi.boolean().default(true),
      }).default();
    },

    init(server, options) {
      // Add server routes and initalize the plugin here
      serverRoute(server);
      validateEsRoute(server);
    }

  });
};
