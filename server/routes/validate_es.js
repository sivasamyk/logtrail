module.exports = function (server) {
  server.route({
    method: 'GET',
    path: '/logtrail/validate/es',
    handler: function (request, reply) {
      var config = require('../../logtrail.json');
      var callWithRequest = server.plugins.elasticsearch.callWithRequest;
      var timestampField = config.fields.mapping.timestamp;

      var body = {
        index: config.es.default_index,
        fields: timestampField
      };

      callWithRequest(request, 'fieldStats', body).then(function (resp) {
        reply({
          ok: true,
          field: timestampField,
          min: resp.indices._all.fields[timestampField].min_value,
          max: resp.indices._all.fields[timestampField].max_value,
          config: config
        });
      }).catch(function (error) {
        console.error('Exception while validating ES',error);
        if (error instanceof TypeError) {
          reply({
            ok: false,
            resp: 'Cannot find required fields in ES. Make sure you have required fields in ES before using the plugin'
          });
        } else {
          reply({
            ok: false,
            resp: error
          });
        }
      });

    }
  });
};
