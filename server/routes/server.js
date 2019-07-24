/*
 * Licensed to Elasticsearch B.V. under one or more contributor
 * license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright
 * ownership. Elasticsearch B.V. licenses this file to you under
 * the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */


function getMessageTemplate(handlebar, selectedConfig) {
  const messageFormat = selectedConfig.fields.message_format;
  //Append <a> tags for click to message format except for message field
  const messageFormatRegex = /({{{[\[]?(\S+?)[\]]?}}})/g; // e.g. {{{[pid]}}} {{{program-name}}} : {{syslog_message}}
  const ngClickTemplate = handlebar.compile('<a class="ng-binding" ng-click="onClick(\'{{name_no_braces}}\',\'{{name}}\')">{{name}}</a>',
    {
      knownHelpers: {
        log: false,
        lookup: false
      },
      knownHelpersOnly: true
    });
  const messageField = selectedConfig.fields.mapping.message;
  let messageTemplate = messageFormat;

  let match = messageFormatRegex.exec(messageFormat);
  while (match !== null) {
    if (match[2] !== messageField) {
      const context = {
        name: match[0],
        name_no_braces: match[2]
      };
      const messageWithClickAttr = ngClickTemplate(context);
      messageTemplate = messageTemplate.replace(match[0], messageWithClickAttr);
    }
    match = messageFormatRegex.exec(messageFormat);
  }
  return messageTemplate; //<a class="ng-binding" ng-click="onClick('pid','{{pid}}')">{{pid}}</a> : {{syslog_message}}
}

function convertToClientFormat(selectedConfig, esResponse) {
  const clientResponse = [];
  const hits = esResponse.hits.hits;
  let template = null;
  const messageFormat = selectedConfig.fields.message_format;
  if (messageFormat) {
    const handlebar = require('handlebars');
    const messageTemplate = getMessageTemplate(handlebar, selectedConfig);
    template = handlebar.compile(messageTemplate, {
      knownHelpers: {
        log: false,
        lookup: false
      },
      knownHelpersOnly: true
    });
  }
  for (let i = 0; i < hits.length; i++) {
    const event = {};
    const source =  hits[i]._source;
    event.id = hits[i]._id;
    const get = require('lodash/get');
    event.timestamp = get(source, selectedConfig.fields.mapping.timestamp);
    event.hostname = get(source, selectedConfig.fields.mapping.hostname);
    event.program = get(source, selectedConfig.fields.mapping.program);

    //Calculate message color, if configured
    if (selectedConfig.color_mapping && selectedConfig.color_mapping.field) {
      const colorField = get(source, selectedConfig.color_mapping.field);
      const color = selectedConfig.color_mapping.mapping[colorField];
      if (color) {
        event.color =  color;
      }
    }

    //Change the source['message'] to highlighter text if available
    if (hits[i].highlight) {
      const set = require('lodash/set');
      const withHighlights = get(hits[i].highlight, [selectedConfig.fields.mapping.message, 0]);
      set(source, selectedConfig.fields.mapping.message, withHighlights);
      source[selectedConfig.fields.mapping.message] = hits[i].highlight[selectedConfig.fields.mapping.message][0];
    }
    let message = get(source, selectedConfig.fields.mapping.message);
    //sanitize html
    const escape = require('lodash/escape');
    message = escape(message);
    //if highlight is present then replace pre and post tag with html
    if (hits[i].highlight) {
      message = message.replace(/logtrail.highlight.pre_tag/g, '<span class="highlight">');
      message = message.replace(/logtrail.highlight.post_tag/g, '</span>');
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

function getDefaultTimeRangeToSearch(selectedConfig) {
  let defaultTimeRangeToSearch = null;
  const moment = require('moment');
  if (selectedConfig.default_time_range_in_minutes &&
      selectedConfig.default_time_range_in_minutes !== 0) {
    defaultTimeRangeToSearch = moment().subtract(
      selectedConfig.default_time_range_in_minutes, 'minutes').valueOf();
  } else if (selectedConfig.default_time_range_in_days !== 0) {
    defaultTimeRangeToSearch = moment().subtract(
      selectedConfig.default_time_range_in_days, 'days').startOf('day').valueOf();
  }
  return defaultTimeRangeToSearch;
}

module.exports = function (server) {

  //Search
  server.route({
    method: ['POST'],
    path: '/logtrail/search',
    handler: async function (request, h) {
      const { callWithRequest } = server.plugins.elasticsearch.getCluster('data');
      const selectedConfig = request.payload.config;
      let searchText = request.payload.searchText;

      if (searchText == null || searchText.length === 0) {
        searchText = '*';
      }

      //Search Request body
      const searchRequest = {
        index: selectedConfig.es.default_index,
        size: selectedConfig.max_buckets,
        body: {
          sort: [{}],
          query: {
            bool: {
              must: {
                query_string: {
                  analyze_wildcard: true,
                  default_field: selectedConfig.fields.mapping.message,
                  query: searchText
                }
              },
              filter: {
                bool: {
                  must: [
                  ],
                  must_not: [],
                }
              }
            }
          },
          highlight: {
            pre_tags: ['logtrail.highlight.pre_tag'],
            post_tags: ['logtrail.highlight.post_tag'],
            fields: {
            }
          }
        }
      };
      //Enable highlightng on message field
      searchRequest.body.highlight.fields[selectedConfig.fields.mapping.message] = {
        number_of_fragments: 0
      };

      //By default Set sorting column to timestamp
      searchRequest.body.sort[0][selectedConfig.fields.mapping.timestamp] = { 'order': request.payload.order, 'unmapped_type': 'boolean' };

      // If secondary sorting field is present then set secondary sort.
      const secondarySortField = selectedConfig.fields.secondary_sort_field;
      if (secondarySortField !== undefined) {
        if (secondarySortField.length > 0) {
          searchRequest.body.sort[0][secondarySortField] = { 'order': request.payload.order };
        }
      }

      //If hostname is present then term query.
      if (request.payload.hostname != null) {
        const termQuery = {
          term: {
          }
        };
        let hostnameField = selectedConfig.fields.mapping.hostname;
        const keywordSuffix = selectedConfig.fields.keyword_suffix;
        if (keywordSuffix === undefined) {
          hostnameField += ('.keyword');
        } else if (keywordSuffix.length > 0) {
          hostnameField += ('.' + keywordSuffix);
        }
        termQuery.term[hostnameField] = request.payload.hostname;
        searchRequest.body.query.bool.filter.bool.must.push(termQuery);
      }

      //If no time range is present get events based on default selectedConfig
      let timestamp = request.payload.timestamp;
      let rangeType = request.payload.rangeType;
      if (timestamp == null) {
        const defaultTimeRange = getDefaultTimeRangeToSearch(selectedConfig);
        if (defaultTimeRange) {
          timestamp = defaultTimeRange;
          rangeType = 'gte';
        }
      }

      //If timestamps are present set ranges
      if (timestamp != null) {
        const rangeQuery = {
          range: {

          }
        };
        const range = rangeQuery.range;
        range[selectedConfig.fields.mapping.timestamp] = {};
        range[selectedConfig.fields.mapping.timestamp][rangeType] = timestamp;
        range[selectedConfig.fields.mapping.timestamp].format = 'epoch_millis';
        searchRequest.body.query.bool.filter.bool.must.push(rangeQuery);
      }
      //console.log(JSON.stringify(searchRequest));
      try {
        const resp = await callWithRequest(request, 'search', searchRequest);
        return {
          ok: true,
          resp: convertToClientFormat(selectedConfig, resp)
        };
      } catch(e) {
        console.error('Error while executing search', e);
        return {
          ok: false,
          resp: e
        };
      }
    }
  });

  //Get All Systems
  server.route({
    method: ['POST'],
    path: '/logtrail/hosts',
    handler: async function (request, h) {
      const { callWithRequest } = server.plugins.elasticsearch.getCluster('data');
      const selectedConfig = request.payload.config;
      const index = request.payload.index;

      let hostnameField = selectedConfig.fields.mapping.hostname;
      const keywordSuffix = selectedConfig.fields.keyword_suffix;
      if (keywordSuffix === undefined) {
        hostnameField += ('.keyword');
      } else if (keywordSuffix.length > 0) {
        hostnameField += ('.' + keywordSuffix);
      }
      const hostAggRequest = {
        index: selectedConfig.es.default_index,
        body: {
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
      try {
        const resp = await callWithRequest(request, 'search', hostAggRequest);
        if (!resp.aggregations) {
          return {
            ok: false,
            resp: {
              msg: 'Check if the index pattern ' + selectedConfig.es.default_index + ' exists'
            }
          };
        }
        return {
          ok: true,
          resp: resp.aggregations.hosts.buckets
        };
      } catch(e) {
        console.error('Error while fetching hosts', e);
        return {
          ok: false,
          resp: e
        };
      }
    }
  });

  server.route({
    method: 'GET',
    path: '/logtrail/config',
    handler: async function (request) {
      const config = await loadConfig(server, request);
      return {
        ok: true,
        config: config
      };
    }
  });
};

async function loadConfig(server, request) {
  const curUser = await server.plugins.security.getUser(request);

  const { callWithInternalUser } = server.plugins.elasticsearch.getCluster('admin');

  const config = (await callWithInternalUser('get', {
    index: '.logtrail',
    type: 'config',
    id: 1
  }))._source;

  const userConfig = (await callWithInternalUser('get', {
    index: '.logtrail',
    type: 'config',
    id: 2
  }))._source;

  const userIndexList = (userConfig.list.filter(user => user.id === curUser.username))[0].indexList;

  if(userIndexList === '*') {
    console.log('userIndexList === *');
    return config;
  }

  const newConfig = {
    'version': config.version,
    'index_patterns': []
  };

  for(let i = 0; userIndexList.length > i; i++) {
    for(let j = 0; config.index_patterns.length > j; j++) {
      if(userIndexList[i] === config.index_patterns[j].es.default_index) {
        newConfig.index_patterns.push(config.index_patterns[j]);
      }
    }
  }

  return newConfig;
}
