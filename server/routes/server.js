function convertToClientFormat(config, esResponse) {
  var clientResponse = [];
  var hits = esResponse.hits.hits;
  //console.log(hits);
  for (var i = 0; i < hits.length; i++) {
    var event = {};
    var source =  hits[i]._source;
    var type = source.type;

    event.id = hits[i]._id;
    var fields = [];
    var k;
    for (k = 0; k < config.fields.length; k++) {
      if (config.fields[k].type === type) {
        fields = config.fields[k].fields;
        break;
      }
    }

    if (fields.length > 0) {
      var j;
      for (j = 0; j < fields.length; j++) {
        event[fields[j]] = source[fields[j]];
      }
    } else {
      event = source;
    }
    /*event.timestamp = source['syslog_timestamp'];
    event.message = source['syslog_message'];
    event.host = source['syslog_hostname'];
    event.program = source['syslog_program'];*/
    clientResponse.push(event);
  }
  return clientResponse;
}

module.exports = function (server) {

  //Search
  server.route({
    method: ['POST'],
    path: '/logtrail/search',
    handler: function (request, reply) {
      var config = require('../../logtrail.json');
      var callWithRequest = server.plugins.elasticsearch.callWithRequest;

      var searchText = request.payload.searchText;
      if (searchText == null || searchText.length === 0) {
        searchText = '*';
      }

      //Search Request bbody
      var searchRequest = {
        index: config.es.default_index,
        size: config.max_buckets,
        body : {
          sort : [{}],
          query : {
            filtered : {
              query : {
                query_string : {
                  analyze_wildcard: true,
                  default_field : 'syslog_message',
                  query : searchText
                }
              },
              filter: {
                bool: {
                  must : [
                  ],
                  must_not:[],
                }
              }
            }
          }
        }
      };

      //By default Set sorting column to timestamp
      searchRequest.body.sort[0][config.es.timefield] = {'order':request.payload.order ,'unmapped_type': 'boolean'};

      //If hostname is present then term query.
      if (request.payload.hostname != null) {
        var termQuery = {
          term : {
            'hostname.raw' : request.payload.hostname
          }
        };
        searchRequest.body.query.filtered.filter.bool.must.push(termQuery);
      }

      //If timestamps are present set ranges
      if (request.payload.timestamp != null) {
        var rangeQuery = {
          range : {

          }
        };
        var range = rangeQuery.range;
        range[config.es.timefield] = {};
        /*if (request.payload.liveTail) {
          range[config.es.timefield].gt = request.payload.timestamp;
        } else {
          range[config.es.timefield].gte = request.payload.timestamp;
        }*/
        range[config.es.timefield][request.payload.rangeType] = request.payload.timestamp;
        range[config.es.timefield].time_zone = config.es.timezone;
        //range[config.es.timefield]['lte'] = 'now';
        range[config.es.timefield].format = 'epoch_millis';
        searchRequest.body.query.filtered.filter.bool.must.push(rangeQuery);
        //var range = searchRequest.body.query.bool.filter.range;

        /*//Set sorting column to timestamp
        searchRequest.body.sort[0][config.es.timefield] = {'order':'asc','unmapped_type': 'boolean'};*/
      }
      console.log(JSON.stringify(searchRequest));
      callWithRequest(request,'search',searchRequest).then(function (resp) {
        reply({
          ok: true,
          resp: convertToClientFormat(config, resp)
        });
      }).catch(function (resp) {
        console.log(resp);
        reply({
          ok: false,
          resp: resp
        });
      });
    }
  });

  //Get All Systems
  server.route({
    method: ['GET'],
    path: '/logtrail/hosts',
    handler: function (request,reply) {
      var config = require('../../logtrail.json');
      var callWithRequest = server.plugins.elasticsearch.callWithRequest;
      var hostAggRequest = {
        index: config.es.default_index,
        size: config.max_buckets,
        body : {
          size: 0,
          aggs: {
            hosts: {
              terms: {
                field: 'hostname.raw'
              }
            }
          }
        }
      };
      callWithRequest(request,'search',hostAggRequest).then(function (resp) {
        console.log(resp.aggregations.hosts.buckets);
        reply({
          ok: true,
          resp: resp.aggregations.hosts.buckets
        });
      }).catch(function (resp) {
        console.log(resp);
        reply({
          ok: false,
          resp: resp
        });
      });
    }
  });
};
