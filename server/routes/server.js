/**
 * 뷰에 보여질 로그 메시지 템플릿 생성
 * @param handlebar handlebar
 * @param selectedConfig 로그 설정값
 * @returns {*} 메시지 템플릿
 */
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

//쿠키 sid 값 생성용
let sidCnt = 0;

//응답 코드
const SUCC_CODE = '0000';//성공
const FAIL_CODE = '9999';//실패

/**
 * 세션 조회
 * @param server
 * @param request
 * @returns {*} 세션정보
 */
function getSession(server, request) {
  //쿠키 값 가져오기
  let sid = request.state['sid'];

  //쿠키 값 체크
  let isMatch = server.auth.api.checkSession(sid);

  if( isMatch ) {
    //server.log (['info','status'],'session match');
    return server.auth.api.cache.get(sid.sid);
  } else {
    //server.log (['info','status'],'session un match');
    return false;
  }
}

/**
 * 쿠기 sid 생성
 * @returns {string} sid
 */
function makeSid() {
  sidCnt++;
  if(sidCnt >= 100) sidCnt = 0;

  return new Date().toISOString().split('T')[0] + '-' + sidCnt + '-' +Math.round(Math.random()*100000);
}

export default function (server) {

  const login = async function (request, reply) {
    server.log (['info','status'],'login');

    let user = await require('../../user.json');
    let list = user.list;

    let loginId = request.payload.id;
    let loginPw = request.payload.pw;

    let targetUser;

    targetUser = ( list.filter( i=> (i.id == loginId && i.pw == loginPw) ) )[0];

    let resCode = { 'code' : FAIL_CODE };

    if(targetUser){
      resCode = { 'code' : SUCC_CODE} ;

      //쿠키값 세팅
      let sid = makeSid();
      request.cookieAuth.set({sid});
      server.auth.api.cache.set(sid, targetUser.id);
    }

    server.log (['info','status'],'login result => loginId => '+loginId+' / targetUser =>'+JSON.stringify(targetUser));

    return reply(resCode);
  };

  //검색
  const eSearch = function (request, reply) {
    //세션 체크
    let session = getSession(server,request);

    if( !session ) {
      request.cookieAuth.clear();
      reply({
        ok: false,
        resp: {msg:'세션 만료'},
        code:'999'
      });
    } else {
      //요청시마다 세션 유지 시간 연장
      server.auth.api.cache.set(session.sid, session.id);

      //로그 조회
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

      var sercondSortFiled = selectedConfig.secondary_sort_field;

      if(sercondSortFiled != undefined && sercondSortFiled.length > 0){
        searchRequest.body.sort.push(sercondSortFiled);
      }

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
  };

  //호스트 리스트 조회
  const getHostList = function (request,reply) {
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
  };

  //로그 설정 파일 로드
  async function loadConfig(server,request) {
    server.log (['info','status'],'loadingConfig file from logtrail.json');

    let logtrailConfig = await require('../../logtrail.json');//인덱스 정보

    server.log (['info','status'],'loadingUser file from user.json');

    let userConfig = await require('../../user.json');//계정 정보

    server.log (['info','status'],'loading config success');

    let curUser = getSession(server, request).id;

    let indexList;
    indexList = (userConfig.list.filter(user => user.id == curUser))[0].indexList;

    if(indexList) {

      let resultIndex = [];

      if(indexList == '*') {
        resultIndex = logtrailConfig.index_patterns;
      } else {
        //현재 로그인한 유저의 인덱스 리스트만 가져옴
        for(var j=0; j<indexList.length; j++){

          for(var i=0; i<logtrailConfig.index_patterns.length; i++) {

            if(logtrailConfig.index_patterns[i].es.default_index == indexList[j]){
              resultIndex.push(logtrailConfig.index_patterns[i]);
            }
          }
        }
      }

      return { "version": logtrailConfig.version, "index_patterns": resultIndex};

    } else {
      server.log (['error','status'],'not found matched indexList, user => '+curUser);
      return {};
    }

  }

  //Check Login Session
  server.route({
    method: 'GET',
    path: '/auth_logtrail/checkSession',
    handler: function (request, reply) {
      reply({
        ok: true,
        session: getSession(server, request)
      });
    }
  });

  //Search
  server.route({
    method: ['POST'],
    path: '/auth_logtrail/search',
    handler: eSearch
  });

  //Get Host List
  server.route({
    method: ['POST'],
    path: '/auth_logtrail/hosts',
    handler: getHostList
  });

  //Get Config
  server.route({
    method: 'GET',
    path: '/auth_logtrail/config',
    handler: async function (request, reply) {
      let config = await loadConfig(server,request);
      reply({
        ok: true,
        config: config
      });
    }
  });

  //로그인
  server.route({
    path: '/auth_logtrail/login',
    method: 'POST',
    handler: login
  });

  //로그아웃
  server.route({
    method: 'GET',
    path: '/auth_logtrail/logout',
    handler: function (request, reply) {
      let sid = request.state['sid'];
      if(sid.sid) server.auth.api.cache.drop(sid.sid);

      request.cookieAuth.clear();

      reply({
        ok: true
      });
    }
  });
}
