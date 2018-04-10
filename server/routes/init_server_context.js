function initServerContext(server, context) {
  //by default use local config
  var config = require('../../logtrail.json');
  context.config = config;
  //try loading from elasticsearch
  loadConfigFromES(server, context);
}

function loadConfigFromES(server,context) {
  const { callWithInternalUser } = server.plugins.elasticsearch.getCluster('admin');
  var request = {
    index: '.logtrail',
    type: 'config',
    id: 1
  };
  callWithInternalUser('get',request).then(function (resp) {
    //If elasticsearch has config use it.
    context.config = resp._source;
    server.log (['info','status'],'Loaded logtrail config from Elasticsearch');
  }).catch(function (error) {
    server.log (['info','status'],'Error while loading config from Elasticsearch. Will use local');
  });
}

function updateKeywordInfo(request, server, indexPattern, fieldKey) {
  return new Promise((resolve,reject) => {
    var field = indexPattern.fields.mapping[fieldKey];
    //check if the direct field is of type keyword
    checkIfFieldIsKeyword(request, server,indexPattern, field).then(async function (result) {
      if (result) {
        indexPattern.fields.mapping[fieldKey + '.keyword'] = field;
      } else {
        //else check if we have .keyword mapping added by logstash template.
        result = await checkIfFieldIsKeyword(request, server,indexPattern, field + '.keyword');
        if (result) {
          indexPattern.fields.mapping[fieldKey + '.keyword'] = field + '.keyword';
        }
      }
      resolve(result);
    });
  });
}

function checkIfFieldIsKeyword(request, server, indexPattern, fieldToCheck) {
  return new Promise((resolve, reject) => {
    const { callWithRequest } = server.plugins.elasticsearch.getCluster('data');
    var payload = {
      index: indexPattern.es.default_index,
      fields: fieldToCheck,
      ignoreUnavailable: true
    };
    var resp = callWithRequest(request, 'fieldCaps', payload).then(function (resp) {
      resolve(resp.fields[fieldToCheck].keyword != null);
    }).catch(function (error) {
      server.log (['info','status'],`Cannot load keyword field for ${fieldToCheck}. will use non-keyword field ${error}`);
      resolve(false);
    });
  });
}

export { initServerContext, updateKeywordInfo };