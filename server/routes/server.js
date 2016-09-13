function convertToClientFormat(config, esResponse) {
  var clientResponse = [];
  var hits = esResponse.hits.hits;
  //console.log(hits);
  for (var i = 0; i < hits.length; i++) {
    var event = {};
    var source =  hits[i]._source;

    event.id = hits[i]._id;
    event['timestamp'] = source[config.fields.mapping['timestamp']];
    event['display_timestamp'] = source[config.fields.mapping['display_timestamp']];
    event['hostname'] = source[config.fields.mapping['hostname']];
    event['message'] = source[config.fields.mapping['message']];
    event['program'] = source[config.fields.mapping['program']];
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
                  default_field : config.fields.mapping['message'],
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
      searchRequest.body.sort[0][config.fields.mapping.timestamp] = {'order':request.payload.order ,'unmapped_type': 'boolean'};

      //If hostname is present then term query.
      if (request.payload.hostname != null) {
        var termQuery = {
          term : {
          }
        };
        var rawHostField = config.fields.mapping.hostname + ".raw";
        termQuery.term[rawHostField] = request.payload.hostname;
        searchRequest.body.query.filtered.filter.bool.must.push(termQuery);
      }

      //If timestamps are present set ranges
      if (request.payload.timestamp != null) {
        var rangeQuery = {
          range : {

          }
        };
        var range = rangeQuery.range;
        range[config.fields.mapping.timestamp] = {};
        range[config.fields.mapping.timestamp][request.payload.rangeType] = request.payload.timestamp;
        range[config.fields.mapping.timestamp].time_zone = config.es.timezone;
        range[config.fields.mapping.timestamp].format = 'epoch_millis';
        searchRequest.body.query.filtered.filter.bool.must.push(rangeQuery);
      }
      //console.log(JSON.stringify(searchRequest));
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
      var rawHostField = config.fields.mapping.hostname + ".raw";
      var hostAggRequest = {
        index: config.es.default_index,
        size: config.max_buckets,
        body : {
          size: 0,
          aggs: {
            hosts: {
              terms: {
                field: rawHostField
              }
            }
          }
        }
      };
      callWithRequest(request,'search',hostAggRequest).then(function (resp) {
        //console.log(resp.aggregations.hosts.buckets);
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
