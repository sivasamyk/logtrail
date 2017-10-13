module.exports = function init_server_context(server, context) {
	//by default use local config
  var config = require('../../logtrail.json');
  context['config'] = config;
  //try loading from elasticsearch
  loadConfigFromES(server, context);
  loadSourcePatterns(server, context);
}

//http://www.tivix.com/blog/making-promises-in-a-synchronous-manner/
let makeMeLookSync = fn => {
  let iterator = fn();
  let loop = result => {
    !result.done && result.value.then(
      res => loop(iterator.next(res)),
      err => loop(iterator.throw(err))
    );
  };

  loop(iterator.next());
};

function loadConfigFromES(server,context) {
  const { callWithInternalUser } = server.plugins.elasticsearch.getCluster('admin');
  var request = {
    index: '.logtrail',
    type: 'config',
    id: 1
  };
  makeMeLookSync ( function* () {
    try {
      let result = yield callWithInternalUser('get',request);
      //If elasticsearch has config use it.
      context['config'] = resp._source;
      server.log (['info','status'],`Loaded logtrail config from Elasticsearch`);
    } catch (error) {
      server.log (['error','status'],`Error while loading config from Elasticsearch. Will use local` );
    }
    updateKeywordInfo(server,context['config']);
    updateIndexPatternIds(server,context['config']);
  });
}

function updateKeywordInfo(server,config) {
  for (var i = 0; i < config.index_patterns.length; i++) {
    var indexPattern = config.index_patterns[i];
    updateKeywordInfoForField(server,indexPattern, 'hostname');
    updateKeywordInfoForField(server,indexPattern, 'program');
  }
}

function updateKeywordInfoForField(server, indexPattern, field) {
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

function updateIndexPatternIds(server,config) {
  const { callWithInternalUser } = server.plugins.elasticsearch.getCluster('admin');
  var request = {
    index: '.kibana',
    type: 'doc', //index-pattern for 5.x
    size: 100
  };
  callWithInternalUser('search',request).then(function (resp) {
    var hits = resp.hits.hits;
    for (var i = hits.length - 1; i >= 0; i--) {
      var hit = hits[i];
      //need to update for 5.x
      if (hit._source.type === 'index-pattern') {
        var indexPatternName = hit._source['index-pattern'].title;
        for (var i = config.index_patterns.length - 1; i >= 0; i--) {
          if (config.index_patterns[i].es.default_index === indexPatternName) {
            config.index_patterns[i].es.indexPatternId = hit._id.split(":")[1];
            server.log (['info','status'],`Updated index pattern id for ${indexPatternName}`);
            break;
          }
        }
      }
    }
  }).catch(function (resp) {
    server.log (['error','status'],`Error while updating index patterns from ES ...${resp}`);
  });
}

//for each index, if source analysis is enabled, read the
//respective patterns file and then create a map of context -> patterns
function loadSourcePatterns(server, context) {
  const { callWithInternalUser } = server.plugins.elasticsearch.getCluster('admin');
  context['sourcePatterns'] = {};

  var request = {
    index: '.logtrail',
    type: 'pattern',
    scroll: "1m",
    size: 500
  };
  var loop = true;
  var scroll_id = null;
  var method = 'search';
  var patternCount = 0;
  makeMeLookSync (function* () {
    try {
      while (loop) {
        var resp = yield callWithInternalUser(method,request);
        var hits = resp.hits.hits;
        scroll_id = resp['_scroll_id'];
        for (var i = hits.length - 1; i >= 0; i--) {
          var hit = hits[i];
          context.sourcePatterns[hit['_id']] = hit['_source'];
          patternCount++;
        }
        loop = hits.length > 0;
        method = 'scroll';
        request = {
          "scroll" : "1m",
          "scroll_id" : scroll_id
        };
      }
      server.log (['info','status','logtrail'],`Loaded ${patternCount} source patterns from ES ...`);
    } catch (error) {
      server.log (['error','status','logtrail'],`Error while loading patterns from ES ...${error}`);
    }
  });
}