module.exports = function init_server_context(server, context) {
	//by default use local config
  var config = require('../../logtrail.json');
  context['config'] = config;
  //try loading from elasticsearch
  loadConfigFromES(context, server);
}

function loadConfigFromES(context,server) {
  const { callWithInternalUser } = server.plugins.elasticsearch.getCluster('admin');
  var request = {
    index: '.logtrail',
    type: 'config',
    id: 1
  };
  callWithInternalUser('get',request).then(function (resp) {
    //If elasticsearch has config use it.
    context['config'] = resp._source;
    server.log (['info','status'],`Loaded logtrail config from Elasticsearch`);
    updateKeywordInfo(context['config'],server)
  }).catch(function (error) {
    server.log (['error','status'],`Error while loading config from Elasticsearch. Will use local` );
    updateKeywordInfo(context['config'],server)
  });
}

function updateKeywordInfo(config,server) {
  for (var i = 0; i < config.index_patterns.length; i++) {
    var indexPattern = config.index_patterns[i];
    updateKeywordInfoForField(indexPattern, 'hostname', server);
    updateKeywordInfoForField(indexPattern, 'program', server);
  }
}

function updateKeywordInfoForField(indexPattern, field, server) {
  const { callWithInternalUser } = server.plugins.elasticsearch.getCluster('admin');
  var keywordField = indexPattern.fields.mapping[field] + ".keyword";
  var request = {
    index: indexPattern.es.default_index,
    size: 1,
    body : {
      query: {
        exists : { field : keywordField }
      }
    }
  };
  callWithInternalUser('search',request).then(function (resp) {
    if (resp.hits.hits.length > 0) {
      indexPattern.fields[field + '.keyword'] = true;
    }
  }).catch(function (error) {
    server.log (['info','status'],`Cannot load keyword field for ${field}. will use non-keyword field` );
  });
}