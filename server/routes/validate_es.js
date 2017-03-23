module.exports = function (server) {
  server.route({
    method: 'POST',
    path: '/logtrail/validate/es',
    handler: function (request, reply) {
      var config = require('../../logtrail.json');      
      var index = request.params.index;
      var selected_config = config.index_patterns[0];
      if (index) {        
        for (var i = config.index_patterns.length - 1; i >= 0; i--) {
          if (config.index_patterns[i].es.default_index === index) {
            selected_config = config.index_patterns[i];
            break;
          }
        }
      }
      const { callWithRequest } = server.plugins.elasticsearch.getCluster('data');
      var timestampField = selected_config.fields.mapping.timestamp;

      var body = {
        index: selected_config.es.default_index,
        fields: timestampField
      };

      callWithRequest(request, 'fieldStats', body).then(function (resp) {
        if (resp.indices._all) {
          reply({
            ok: true,
            field: timestampField,
            min: resp.indices._all.fields[timestampField].min_value,
            max: resp.indices._all.fields[timestampField].max_value,
            config: config
          });
        } else {
          reply({
            ok: false,
            resp: {
              message: 'Cannot find index ' + selected_config.es.default_index + ' in ES'
            }
          });
        }
      }).catch(function (resp) {
        if (resp.isBoom) {
          reply(resp);
        } else {
          console.error('Error while validating ES', resp);
          reply({
            ok: false,
            resp: resp
          });
        }
      });
    }
  });  
};
