import { initServerContext, updateKeywordInfo } from './init_server_context.js';

function getMessageTemplate(handlebar, selectedConfig) {
  var messageFormat = selectedConfig.fields.message_format;
  //Append <a> tags for click to message format except for message field
  var messageFormatRegex = /({{{[\[]?(\S+?)[\]]?}}})/g; // e.g. {{{[pid]}}} {{{program-name}}} : {{syslog_message}}
  var ngClickTemplate = handlebar.compile('<a class="ng-binding" ng-click="onClick(\'{{name_no_braces}}\',\'{{name}}\')">{{name}}</a>',
    {
      knownHelpers: {
        log: false,
        lookup: false
      },
      knownHelpersOnly: true
    });
  var messageField = '{{{' + selectedConfig.fields.mapping.message + '}}}';
  var messageTemplate = messageFormat;

  var match = messageFormatRegex.exec(messageFormat);
  while (match !== null) {
    if (match[0] !== messageField) {
      var context = {
        name : match[0],
        name_no_braces : match[2]
      };
      var messageWithClickAttr = ngClickTemplate(context);
      messageTemplate = messageTemplate.replace(match[0], messageWithClickAttr);
    }
    match = messageFormatRegex.exec(messageFormat);
  }
  return messageTemplate; //<a class="ng-binding" ng-click="onClick('pid','{{pid}}')">{{pid}}</a> : {{syslog_message}}
}

function convertToClientFormat(selectedConfig, esResponse) {
  var clientResponse = [];
  var hits = esResponse.hits.hits;
  var template = null;
  var messageFormat = selectedConfig.fields.message_format;
  if (messageFormat) {
    var handlebar = require('handlebars');
    var messageTemplate = getMessageTemplate(handlebar, selectedConfig);
    template = handlebar.compile(messageTemplate, {
      knownHelpers: {
        log: false,
        lookup: false
      },
      knownHelpersOnly: true
    });
  }
  for (let i = 0; i < hits.length; i++) {
    var event = {};
    var source =  hits[i]._source;
    event.id = hits[i]._id;
    let get = require('lodash.get');
    event.timestamp = get(source, selectedConfig.fields.mapping.timestamp);
    event.hostname = get(source, selectedConfig.fields.mapping.hostname);
    event.program = get(source, selectedConfig.fields.mapping.program);

    //Calculate message color, if configured
    if (selectedConfig.color_mapping && selectedConfig.color_mapping.field) {
      var colorField = get(source, selectedConfig.color_mapping.field);
      var color = selectedConfig.color_mapping.mapping[colorField];
      if (color) {
        event.color =  color;
      }
    }

    //Change the source['message'] to highlighter text if available
    if (hits[i].highlight) {
      var set = require('lodash.set');
      var withHighlights = get(hits[i].highlight, [selectedConfig.fields.mapping.message,0]);
      set(source, selectedConfig.fields.mapping.message, withHighlights);
      source[selectedConfig.fields.mapping.message] = hits[i].highlight[selectedConfig.fields.mapping.message][0];
    }
    var message = source[selectedConfig.fields.mapping.message];
    //sanitize html
    var escape = require('lodash.escape');
    message = escape(message);
    //if highlight is present then replace pre and post tag with html
    if (hits[i].highlight) {
      message = message.replace(/logtrail.highlight.pre_tag/g,'<span class="highlight">');
      message = message.replace(/logtrail.highlight.post_tag/g,'</span>');
    }
    source[selectedConfig.fields.mapping.message] = message;

    //If the user has specified a custom format for message field
    if (messageFormat) {
      event.message = template(source);
    } else {
      event.message = message;
    }
    clientResponse.push(event);
  }
  return clientResponse;
}


module.exports = function (server) {

  var context = {};
  initServerContext(server,context);

  //Search
  server.route({
    method: ['POST'],
    path: '/logtrail/search',
    handler: function (request, reply) {
      var config = context.config;
      const { callWithRequest } = server.plugins.elasticsearch.getCluster('data');

      var index = request.payload.index;
      var selectedConfig = config.index_patterns[0];
      if (index) {
        for (let i = config.index_patterns.length - 1; i >= 0; i--) {
          if (config.index_patterns[i].es.default_index === index) {
            selectedConfig = config.index_patterns[i];
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
        index: selectedConfig.es.default_index,
        size: selectedConfig.max_buckets,
        body : {
          sort : [{}],
          query : {
            bool : {
              must :{
                query_string : {
                  analyze_wildcard: true,
                  default_field : selectedConfig.fields.mapping.message,
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
            pre_tags : ['logtrail.highlight.pre_tag'],
            post_tags : ['logtrail.highlight.post_tag'],
            fields : {
            }
          }
        }
      };
      //Enable highlightng on message field
      searchRequest.body.highlight.fields[selectedConfig.fields.mapping.message] = {
        number_of_fragments: 0
      };

      //By default Set sorting column to timestamp
      searchRequest.body.sort[0][selectedConfig.fields.mapping.timestamp] = {'order':request.payload.order ,'unmapped_type': 'boolean'};

      //If hostname is present then term query.
      if (request.payload.hostname != null) {
        var termQuery = {
          term : {
          }
        };
        var hostnameField = selectedConfig.fields.mapping.hostname;
        if (selectedConfig.fields.mapping['hostname.keyword']) {
          hostnameField += '.keyword';
        }
        termQuery.term[hostnameField] = request.payload.hostname;
        searchRequest.body.query.bool.filter.bool.must.push(termQuery);
      }

      //If no time range is present get events based on default selectedConfig
      var timestamp = request.payload.timestamp;
      var rangeType = request.payload.rangeType;
      if (timestamp == null) {
        if (selectedConfig.default_time_range_in_days !== 0) {
          var moment = require('moment');
          timestamp = moment().subtract(
            selectedConfig.default_time_range_in_days,'days').startOf('day').valueOf();
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
        range[selectedConfig.fields.mapping.timestamp] = {};
        range[selectedConfig.fields.mapping.timestamp][rangeType] = timestamp;
        range[selectedConfig.fields.mapping.timestamp].format = 'epoch_millis';
        searchRequest.body.query.bool.filter.bool.must.push(rangeQuery);
      }
      //console.log(JSON.stringify(searchRequest));

      callWithRequest(request,'search',searchRequest).then(function (resp) {
        reply({
          ok: true,
          resp: convertToClientFormat(selectedConfig, resp)
        });
      }).catch(function (resp) {
        if (resp.isBoom) {
          reply(resp);
        } else {
          console.error('Error while executing search',resp);
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
      var config = context.config;
      const { callWithRequest } = server.plugins.elasticsearch.getCluster('data');
      var index = request.payload.index;
      var selectedConfig = config.index_patterns[0];
      if (index) {
        for (let i = config.index_patterns.length - 1; i >= 0; i--) {
          if (config.index_patterns[i].es.default_index === index) {
            selectedConfig = config.index_patterns[i];
            break;
          }
        }
      }

      var hostnameKey = 'hostname.keyword';
      var hostnameField = selectedConfig.fields.mapping[hostnameKey];
      //field mapped to hostname key is not of type keyword.
      if (hostnameField == null) {
        var errorMessage = selectedConfig.fields.mapping.hostname +
        ' field not of type keyword or keyword mapping does not exist.';
        reply({
          ok: false,
          resp: errorMessage
        });
        return;
      }
      var hostAggRequest = {
        index: selectedConfig.es.default_index,
        body : {
          size: 0,
          aggs: {
            hosts: {
              terms: {
                field: hostnameField,
                size: selectedConfig.max_hosts
              }
            }
          }
        }
      };

      callWithRequest(request,'search',hostAggRequest).then(function (resp) {
        //console.log(JSON.stringify(resp));//.aggregations.hosts.buckets);
        reply({
          ok: true,
          resp: resp.aggregations.hosts.buckets
        });
      }).catch(function (resp) {

        if(resp.isBoom) {
          reply(resp);
        } else {
          console.error('Error while fetching hosts',resp);
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
    handler: async function (request, reply) {
      var config = context.config;
      for (let i = config.index_patterns.length - 1; i >= 0; i--) {
        var selectedConfig = config.index_patterns[i];
        if (selectedConfig.fields.mapping['hostname.keyword'] == null) {
          await updateKeywordInfo(request, server, selectedConfig, 'hostname');
          await updateKeywordInfo(request, server, selectedConfig, 'program');
        }
      }
      reply({
        ok: true,
        config: config
      });
    }
  });
};