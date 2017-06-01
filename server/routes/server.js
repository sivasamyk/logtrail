function getMessageTemplate(handlebar, selected_config) {
  var message_format = selected_config.fields.message_format;
  //Append <a> tags for click to message format except for message field    
    var message_format_regex = /({{{(\S+)}}})/g; // e.g. {{pid}} : {{syslog_message}}    
    var ng_click_template = handlebar.compile("<a class=\"ng-binding\" ng-click=\"onClick('{{name_no_braces}}','{{name}}')\">{{name}}</a>");
    var messageField = "{{{" + selected_config.fields.mapping.message + "}}}";
    var message_template = message_format;

    var match = message_format_regex.exec(message_format);    
    while (match !== null) {      
      if (match[0] !== messageField) {
        var context = {
          name : match[0],
          name_no_braces : match[2]
        };        
        var with_click = ng_click_template(context);
        message_template = message_template.replace(match[0], with_click);        
      }
      match = message_format_regex.exec(message_format);
    }
    return message_template; //<a class="ng-binding" ng-click="onClick('pid','{{pid}}')">{{pid}}</a> : {{syslog_message}}
}

function convertToClientFormat(selected_config, esResponse) {
  var clientResponse = [];
  var hits = esResponse.hits.hits;     

  var message_format = selected_config.fields.message_format;
  if (message_format) {
    var handlebar = require('handlebars');
    var message_template = getMessageTemplate(handlebar, selected_config);
    var template = handlebar.compile(message_template);
  }
  var escape = require("escape-html");
  for (var i = 0; i < hits.length; i++) {
    var event = {};
    var source =  hits[i]._source;

    event.id = hits[i]._id;
    if (selected_config.nested_objects) {
      var flatten = require('flat');
      source = flatten(source);
    }
    event['timestamp'] = source[selected_config.fields.mapping['timestamp']];
    event['display_timestamp'] = source[selected_config.fields.mapping['display_timestamp']];
    event['hostname'] = source[selected_config.fields.mapping['hostname']];
    event['program'] = source[selected_config.fields.mapping['program']];

    if ( source[selected_config.fields.mapping['severity']] )
    	event['severity'] = source[selected_config.fields.mapping['severity']].toLowerCase();
    else
    	event['severity'] = source[selected_config.fields.mapping['severity']];

    //Change the source['message'] to highlighter text if available
    if (hits[i].highlight) {
      source[selected_config.fields.mapping['message']] = hits[i].highlight[selected_config.fields.mapping['message']][0];
    }

    var message = source[selected_config.fields.mapping['message']];
    //If the user has specified a custom format for message field
    if (message_format) {
      event['message'] = template(source);
    } else {
      event['message'] = escape(message);
    }
    //console.log(event.message);
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
      const { callWithRequest } = server.plugins.elasticsearch.getCluster('data');

      var index = request.payload.index;
      var selected_config = config.index_patterns[0];
      if (index) {        
        for (var i = config.index_patterns.length - 1; i >= 0; i--) {
          if (config.index_patterns[i].es.default_index === index) {
            selected_config = config.index_patterns[i];
            break;
          }          
        }        
      }

      var searchText = request.payload.searchText;
      if (searchText == null || searchText.length === 0) {
        searchText = '*';
      }

      //Search Request bbody
      var searchRequest = {
        index: selected_config.es.default_index,
        size: selected_config.max_buckets,
        body : {
          sort : [{}],
          query : {
              bool : {
                must :{
                    query_string : {
                      analyze_wildcard: true,
                      default_field : selected_config.fields.mapping['message'],
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
          },
          highlight : {
            pre_tags : ["<span class='highlight'>"],
            post_tags : ["</span>"],
            fields : {
            }
          }
        }
      };
      //Enable highlightng on message field
      searchRequest.body.highlight.fields[selected_config.fields.mapping['message']] = {
      };

      //By default Set sorting column to timestamp
      searchRequest.body.sort[0][selected_config.fields.mapping.timestamp] = {'order':request.payload.order ,'unmapped_type': 'boolean'};

      //If hostname is present then term query.
      if (request.payload.hostname != null) {
        var termQuery = {
          term : {
          }
        };
        var hostKeywordField = selected_config.fields.mapping.hostname + '.keyword';
        termQuery.term[hostKeywordField] = request.payload.hostname;
        searchRequest.body.query.bool.filter.bool.must.push(termQuery);
      }

      //If no time range is present get events based on default selected_config
      var timestamp = request.payload.timestamp;
      var rangeType = request.payload.rangeType;
      if (timestamp == null) {
        if (selected_config.default_time_range_in_days !== 0) {
          var moment = require('moment');
          timestamp = moment().subtract(
            selected_config.default_time_range_in_days,'days').startOf('day').valueOf();
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
        range[selected_config.fields.mapping.timestamp] = {};
        range[selected_config.fields.mapping.timestamp][rangeType] = timestamp;
        range[selected_config.fields.mapping.timestamp].format = 'epoch_millis';
        searchRequest.body.query.bool.filter.bool.must.push(rangeQuery);
      }
      //console.log(JSON.stringify(searchRequest));
      callWithRequest(request,'search',searchRequest).then(function (resp) {
        reply({
          ok: true,
          resp: convertToClientFormat(selected_config, resp)
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
    method: ['POST'],
    path: '/logtrail/hosts',
    handler: function (request,reply) {
      var config = require('../../logtrail.json');      
      const { callWithRequest } = server.plugins.elasticsearch.getCluster('data');
      var index = request.payload.index;
      var selected_config = config.index_patterns[0];
      if (index) {        
        for (var i = config.index_patterns.length - 1; i >= 0; i--) {
          if (config.index_patterns[i].es.default_index === index) {
            selected_config = config.index_patterns[i];
            break;
          }          
        }        
      }

      var hostKeywordField = selected_config.fields.mapping.hostname + '.keyword';
      var hostAggRequest = {
        index: selected_config.es.default_index,
        body : {
          size: 0,
          aggs: {
            hosts: {
              terms: {
                field: hostKeywordField,
                size: selected_config.max_hosts
              }
            }
          }
        }
      };
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

  server.route({
    method: 'GET',
    path: '/logtrail/config',
    handler: function (request, reply) {
      reply({
        ok: true,
        config: require('../../logtrail.json')
      });
    }  
  });
};
