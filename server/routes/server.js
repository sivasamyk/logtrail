import init_server_context from "./init_server_context.js"

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
  var messageField = selectedConfig.fields.mapping.message;
  var messageTemplate = messageFormat;

  var match = messageFormatRegex.exec(messageFormat);
  while (match !== null) {
    if (match[2] !== messageField) {
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
  var responseToClient = [];
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
    event['raw_message'] = get(source, selectedConfig.fields.mapping['message']);

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
    //list of indices and html tags to replace
    //based in highlight and source pattern analysis.
    var tokensToInsert = [];

    if (hits[i].highlight) {
      message = message.replace(/logtrail.highlight.pre_tag/g,'<span class="highlight">');
      message = message.replace(/logtrail.highlight.post_tag/g,'</span>');
    }
    source[selectedConfig.fields.mapping.message] = message;

    //if source analysis is enabled. This won't work for messages with HTML text.
    if (sourcePatterns) {
      var patternInfo = source['lt'];
      if (patternInfo) {
        updateSourcePatternIndices(tokensToInsert,patternInfo, sourcePatterns);
        event['patternInfo'] = patternInfo; //added by logstash plugin
        event['sourcePattern'] = sourcePatterns[patternInfo.patternId]; //pushed to ES by source analyzer
      }
    }

    //sort the indices
    tokensToInsert.sort(function(t1, t2) {
      return t1.index - t2.index;
    });

    //add required tags to message based on replace indices.
    if (tokensToInsert.length > 0) {
      //insert tokens on the raw message
      message = event['raw_message'];
      var messageArr = [];
      for (var j = 0; j < tokensToInsert.length; j++) {
        var lastIndex = j == 0 ? 0 : tokensToInsert[j-1].index;
        messageArr.push(escape(message.slice(lastIndex, tokensToInsert[j].index)));
        messageArr.push(tokensToInsert[j].text);
      }
      messageArr.push(escape(message.slice(tokensToInsert[tokensToInsert.length-1].index)));
      source[selectedConfig.fields.mapping['message']] = messageArr.join("");
    }

    //If the user has specified a custom format for message field
    if (messageFormat) {
      event.message = template(source);
    } else {
      event.message = message;
    }
    responseToClient.push(event);
  }
  return responseToClient;
}

//lookup for pattern in sourcePatterns and update tokensToInsert with tags.
function updateSourcePatternIndices(tokensToInsert, patternInfo, sourcePatterns) {
  var patternId = patternInfo['patternId'];
  if (patternId) {
    var pattern = sourcePatterns[patternId];
    if (pattern) {
      var matchIndices = patternInfo['matchIndices'];
      if (matchIndices) {
        var handlebar = require('handlebars');
        var tagTemplate = handlebar.compile('<a data-argnum="{{num}}" class="arg" href>');
        for (var j = 0; j < matchIndices.length; j++) {
          var tag = j%2 == 0 ? tagTemplate({
            num : (j/2) + 1
          }) : '</a>';
          tokensToInsert.push({
            index: matchIndices[j],
            text: tag
          });
        }
      }
    }
  }
}

function getDefaultTimeRangeToSearch(selectedConfig) {
  var defaultTimeRangeToSearch = null;
  var moment = require('moment');
  if (selectedConfig.default_time_range_in_minutes && 
    selectedConfig.default_time_range_in_minutes !== 0) {
    defaultTimeRangeToSearch = moment().subtract(
      selectedConfig.default_time_range_in_minutes,'minutes').valueOf();
  } else if (selectedConfig.default_time_range_in_days !== 0) {
    defaultTimeRangeToSearch = moment().subtract(
      selectedConfig.default_time_range_in_days,'days').startOf('day').valueOf();
  }
  return defaultTimeRangeToSearch;
}

module.exports = function (server) {

  //Search
  server.route({
    method: ['POST'],
    path: '/logtrail/search',
    handler: function (request, reply) {
      const { callWithRequest } = server.plugins.elasticsearch.getCluster('data');
      var selectedConfig = request.payload.config;
      var searchText = request.payload.searchText;

      if (searchText == null || searchText.length === 0) {
        searchText = '*';
      }

      //Search Request body
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
        let keywordSuffix = selectedConfig.fields.keyword_suffix;
        if (keywordSuffix == undefined) {
          hostnameField += ('.keyword');
        } else if (keywordSuffix.length > 0) {
          hostnameField += ('.' + keywordSuffix);
        }
        termQuery.term[hostnameField] = request.payload.hostname;
        searchRequest.body.query.bool.filter.bool.must.push(termQuery);
      }

      //If no time range is present get events based on default selectedConfig
      var timestamp = request.payload.timestamp;
      var rangeType = request.payload.rangeType;
      if (timestamp == null) {
        let defaultTimeRange = getDefaultTimeRangeToSearch(selectedConfig);
        if (defaultTimeRange) {
          timestamp = defaultTimeRange;
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
      const { callWithRequest } = server.plugins.elasticsearch.getCluster('data');
      var selectedConfig = request.payload.config;
      var index = request.payload.index;
      
      var hostnameField = selectedConfig.fields.mapping.hostname;
      let keywordSuffix = selectedConfig.fields.keyword_suffix;
      if (keywordSuffix == undefined) {
        hostnameField += ('.keyword');
      } else if (keywordSuffix.length > 0) {
        hostnameField += ('.' + keywordSuffix);
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
        if (!resp.aggregations) {
          reply({
            ok: false,
            resp: {
              msg: 'Check if the index pattern ' + selectedConfig.es.default_index + ' exists'
            }
          });
          return;
        }
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
      var config = await loadConfig(server);
      reply({
        ok: true,
        config: config
      });
    }
  });

  server.route({
    method: 'GET',
    path: '/logtrail/reload',
    handler: function (request, reply) {
      server.log(['info','logtrail'],"Reloading logtrail server context...");
      context = {};
      init_server_context(server,context);
      reply();
    }
  });
};

function loadConfig(server) {
  return new Promise((resolve, reject) => {
    const { callWithInternalUser } = server.plugins.elasticsearch.getCluster('admin');
    var request = {
      index: '.logtrail',
      type: 'config',
      id: 1
    };
    callWithInternalUser('get',request).then(function (resp) {
      //If elasticsearch has config use it.
      resolve(resp._source);
      server.log (['info','status'],'Loaded logtrail config from Elasticsearch');
    }).catch(function (error) {
      server.log (['info','status'],'Error while loading config from Elasticsearch. Will use local');
      var config = require('../../logtrail.json');
      resolve(config);
    });
  });
}
