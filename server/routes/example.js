module.exports = function (server) {

  server.route({
    path: '/konsole/api/example',
    method: 'GET',
    handler: function (req, reply) {
      reply({ time: (new Date()).toISOString() });
    }
  });

};
