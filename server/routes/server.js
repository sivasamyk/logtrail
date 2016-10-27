function convertToClientFormat(config, esResponse) {
  var clientResponse = [];
  var hits = esResponse.hits.hits;
  //console.log(hits);
  for (var i = 0; i < hits.length; i++) {
    var event = {};
    var source =  hits[i]._source;

    event.id = hits[i]._id;
    if(config.nested_objects) {
      var flatten = require('flat');
      source = flatten(source);
    }
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
              bool : {
                must :{
                    query_string : {
                      analyze_wildcard: true,
                      default_field : config.fields.mapping['message'],
                      query : searchText
                    }
                },
                filter: {
                  bool : {
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
        var hostKeywordField = config.fields.mapping.hostname + '.keyword';
        termQuery.term[hostKeywordField] = request.payload.hostname;
        searchRequest.body.query.bool.filter.bool.must.push(termQuery);
      }

      //If no time range is present get events based on default config
      var timestamp = request.payload.timestamp;
      var rangeType = request.payload.rangeType;
      if (timestamp == null) {
        if (config.default_time_range_in_days !== 0) {
          var moment = require('moment');
          timestamp = moment().subtract(
            config.default_time_range_in_days,'days').startOf('day').valueOf();
          rangeType = 'gte';
        }
      }

      //If timestamps are present set ranges
      if (timestamp != null) {
        var rangeQuery = {
          range : {

          }
        };
        var range = rangeQuery.range;
        range[config.fields.mapping.timestamp] = {};
        range[config.fields.mapping.timestamp][rangeType] = timestamp;
        range[config.fields.mapping.timestamp].time_zone = config.es.timezone;
        range[config.fields.mapping.timestamp].format = 'epoch_millis';
        searchRequest.body.query.bool.filter.bool.must.push(rangeQuery);
      }
      //console.log(JSON.stringify(searchRequest));
      callWithRequest(request,'search',searchRequest).then(function (resp) {
        reply({
          ok: true,
          resp: convertToClientFormat(config, resp)
        });
      }).catch(function (resp) {
        if (resp.isBoom) {
          reply(resp);
        } else {
          console.error("Error while executing search",resp);
          reply({
            ok: false,
            resp: resp
          });
        }
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
      var hostKeywordField = config.fields.mapping.hostname + '.keyword';
      var hostAggRequest = {
        index: config.es.default_index,
        body : {
          size: 0,
          aggs: {
            hosts: {
              terms: {
                field: hostKeywordField
              }
            }
          }
        }
      };

      //NOT YET TESTED!!
      if (config.nested_objects) {
        var parentIndex = config.fields.mapping.hostname.lastIndexOf(".");
        var hostPath = config.fields.mapping.hostname.substr(0,parentIndex);
        hostAggRequest = {
          index: config.es.default_index,
          body : {
            size: 0,
            aggs: {
              nested: {
                path: hostPath
              },
              aggs: {
                hosts: {
                  terms: {
                    field: hostKeywordField
                  }
                }
              }
            }
          }
        };
      }

      callWithRequest(request,'search',hostAggRequest).then(function (resp) {
        //console.log(resp);//.aggregations.hosts.buckets);
        reply({
          ok: true,
          resp: resp.aggregations.hosts.buckets
        });
      }).catch(function (resp) {
        if(resp.isBoom) {
          reply(resp);
        } else {
          console.error("Error while fetching hosts",resp);
          reply({
            ok: false,
            resp: resp
          });
        }
      });
    }
  });
};
