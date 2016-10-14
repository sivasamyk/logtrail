module.exports = function (server) {
  server.route({
    method: 'GET',
    path: '/logtrail/validate/es',
    handler: function (request, reply) {
      var config = require('../../logtrail.json');
      //console.log(config);
      var callWithRequest = server.plugins.elasticsearch.callWithRequest;
      var timestampField = config.fields.mapping.timestamp;

      var body = {
        index: config.es.default_index,
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
              message: 'Cannot find index ' + config.es.default_index + ' in ES'
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
