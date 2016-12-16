import moment from 'moment';
import chrome from 'ui/chrome';
import uiModules from 'ui/modules';
import uiRoutes from 'ui/routes';
import angular from 'angular';
import sugarDate from 'sugar-date';
import notify from 'ui/notify';

import 'ui/autoload/styles';
import 'plugins/logtrail/css/main.css';

import template from './templates/index.html';

chrome.setNavBackground('#222222');

var app = uiModules.get('app/logtrail', []);

uiRoutes.enable();
uiRoutes
.when('/', {
  template: template,
  reloadOnSearch: false
});

document.title = 'LogTrail - Kibana';

app.controller('logtrail', function ($scope, kbnUrl, $route, $routeParams,
   $window, $interval, $http, $document, $timeout, $location) {
  $scope.title = 'LogTrail';
  $scope.description = 'Plugin to view, search & tail logs in Kibana';
  $scope.userSearchText = null;
  $scope.events = [];
  $scope.datePickerVisible = false;
  $scope.hostPickerVisible = false;
  $scope.userDateTime = null; // exact string typed by user like 'Aug 24 or last friday'
  $scope.pickedDateTime = null; // UTC date used in search query.
  $scope.userDateTimeSeeked = null; // exact string entered by user set after user clicks seek. Used to show in search button
  $scope.liveTailStatus = 'Live';
  $scope.hosts = null;
  $scope.selectedHost = null;
  $scope.firstEventReached = false;
  $scope.errorMessage = null;
  $scope.noEventErrorStartTime = null;
  $scope.showNoEventsMessage = false;
  var updateViewInProgress = false;
  var tailTimer = null;
  var searchText = null;
  var lastEventTime = null;
  var config,selected_index_config = null;  

  function init() {
    //init scope vars from get params if available
    if ($routeParams.q) {
      $scope.userSearchText = $routeParams.q === '*' ? null : $routeParams.q;
      searchText = $routeParams.q;
    }

    if ($routeParams.h) {
      $scope.selectedHost = $routeParams.h === 'All' ? null : $routeParams.h;
    }

    if ($routeParams.t) {
      if ($routeParams.t === 'Now' || $routeParams.t == null) {
        $scope.pickedDateTime = null;
        $scope.userDateTime = null;
      } else {
        $scope.pickedDateTime = convertStringToDate($routeParams.t);
        $scope.userDateTimeSeeked = $routeParams.t;
      }
    }
    $http.get(chrome.addBasePath('/logtrail/config')).then(function (resp) {
      if (resp.data.ok) {
        config = resp.data.config;
      }
      if($routeParams.i) {

      } else {
        selected_index_config = config.index_patterns[0];
      }
      checkElasticsearch();
    });        
  };

  function getConfig() {
    
  }

  function checkElasticsearch() {    
    var params = {
      index: selected_index_config.es.default_index
    };
    return $http.post(chrome.addBasePath('/logtrail/validate/es'), params).then(function (resp) {
      if (resp.data.ok) {        
        console.info('connection to elasticsearch successful');
        //Initialize app views on validate successful
        setupHostsList();
        if ($scope.pickedDateTime == null) {
          doSearch(null, 'desc', ['overwrite','reverse'], null);
        } else {
          var timestamp = Date.create($scope.pickedDateTime).getTime();
          doSearch('gt','asc', ['overwrite','scrollToTop'],timestamp);
        }
        startTailTimer();
      } else {
        console.error('validate elasticsearch failed :' , resp);
        if (resp.data.resp.message) {
          $scope.errorMessage = resp.data.resp.message;
        } else {
          $scope.errorMessage = 'ES Validation failed : ' + resp.data.resp;
        }
      }
    });
  };

  /**
  rangeType - gte or lte
  action - whether to append new events to end or prepend or clear all events (overwrite)
  timestamp - timestamp for range if available
  **/
  function doSearch(rangeType,order,actions,timestamp) {

    var request = {
      searchText: searchText,
      timestamp: timestamp,
      rangeType: rangeType,
      order: order,
      hostname: $scope.selectedHost,      
      index: selected_index_config.es.default_index
    };

    return $http.post(chrome.addBasePath('/logtrail/search'), request).then(function (resp) {
      if (resp.data.ok) {
        updateEventView(resp.data.resp,actions,order);
      } else {
        console.error('Error while fetching events ' , resp);
        $scope.errorMessage = 'Exception while executing search query :' + resp.data.resp.msg;
      }
    });
  };

  function removeDuplicatesForAppend(newEventsFromServer) {
    var BreakException = {};
    for (var i = newEventsFromServer.length - 1; i >= 0; i--) {
      var newEvent = newEventsFromServer[i];
      try {
        for (var j = $scope.events.length - 1; j >= 0; j--) {
          var event = $scope.events[j];
          if (Date.parse(event.timestamp) < Date.parse(newEvent.timestamp)) {
            throw BreakException;
          }
          if (newEvent.id === event.id) {
            newEventsFromServer.splice(i,1);
          }
        }
      }
      catch (e) {
        //ignore
      }
    }
  }

  function removeDuplicatesForPrepend(newEventsFromServer) {
    var BreakException = {};
    for (var i = newEventsFromServer.length - 1; i >= 0; i--) {
      var newEvent = newEventsFromServer[i];
      try {
        for (var j = 0; j < $scope.events.length; j++) {
          var event = $scope.events[j];
          if (Date.parse(event.timestamp) > Date.parse(newEvent.timestamp)) {
            throw BreakException;
          }
          if (newEvent.id === event.id) {
            newEventsFromServer.splice(i,1);
          }
        }
      }
      catch (e) {
        //ignore
      }
    }
  }

  /*
  actions available
  overwrite -
  append -
  prepend -
  reverse -
  scrollToTop -
  scrollToView - in case of prepend,i.e scrollUp that old event should be visible
  scrollToBottom - Default behavior, no need to pass
  startTimer - start tail timer. Will be invoked duing initialization
  */

  function updateEventView(events,actions,order) {

    updateViewInProgress = true;
    $scope.showNoEventsMessage = false;

    if (actions.indexOf('reverse') !== -1) {
      events.reverse();
    }
    if (actions.indexOf('overwrite') !== -1) {
      $scope.firstEventReached = false;
      $scope.events = [];
      angular.forEach(events, function (event) {
        $scope.events.push(event);
      });
      $timeout(function () {
        //If scrollbar not visible
        if (angular.element($document).height() <= angular.element($window).height()) {
          $scope.firstEventReached = true;
        }
      });
    }
    if (actions.indexOf('append') !== -1) {
      //If events are order desc, the reverse the list
      if (order === 'desc') {
        events.reverse();
      }
      removeDuplicatesForAppend(events);
      angular.forEach(events, function (event) {
        $scope.events.push(event);
      });
    }
    var firstEventId = null;
    if (actions.indexOf('prepend') !== -1) {
      removeDuplicatesForPrepend(events);
      if (events.length > 0) {
        //Need to move scrollbar to old event location,
        //so note down its id of before model update
        firstEventId = $scope.events[0].id;
        angular.forEach(events, function (event) {
          $scope.events.unshift(event);
        });
      } else {
        $scope.firstEventReached = true;
      }
    }

    if (actions.indexOf('scrollToTop') !== -1) {
      $timeout(function () {
        window.scrollTo(0,5);
      });
    } else if (actions.indexOf('scrollToView') !== -1) {

      if (firstEventId !== null) {
        //Make sure the old top event in is still in view
        $timeout(function () {
          var firstEventElement = document.getElementById(firstEventId);
          if (firstEventElement != null) {
            var topPos = firstEventElement.offsetTop;
            firstEventElement.scrollIntoView();
          }
        });
      }
    } else {
      //Bring scroll to bottom
      $timeout(function () {
        window.scrollTo(0,$(document).height());
      });
    }

    if ($scope.events.length > 0)   {
      lastEventTime = Date.create($scope.events[$scope.events.length - 1].timestamp).getTime();
    } else {
      lastEventTime = null;
    }

    $timeout(function () {
      updateViewInProgress = false;
    });

    if ($scope.events != null && $scope.events.length === 0) {
      $scope.showNoEventsMessage = true;
      if ($scope.pickedDateTime != null) {
        var timestamp = Date.create($scope.pickedDateTime).getTime();
        $scope.noEventErrorStartTime = moment(timestamp).format('MMMM Do YYYY, h:mm:ss a');
      } else {
        if (selected_index_config.default_time_range_in_days !== 0) {
          $scope.noEventErrorStartTime = moment().subtract(
            selected_index_config.default_time_range_in_days,'days').startOf('day').format('MMMM Do YYYY, h:mm:ss a');
        }
      }
    }
  };

  $scope.isTimeRangeSearch = function () {
    return (config != null && selected_index_config.default_time_range_in_days !== 0) || $scope.pickedDateTime != null;
  };

  $scope.onSearchClick = function () {
    searchText = '*';
    if ($scope.userSearchText != null) {
      searchText = $scope.userSearchText;
    }

    var host = $scope.selectedHost;
    if (host == null) {
      host = 'All';
    }

    var time = $scope.userDateTimeSeeked;
    if (time == null) {
      time = 'Now';
    }

    $location.path('/').search({q: searchText, h: host, t:time});

    if ($scope.pickedDateTime != null) {
      var timestamp = Date.create($scope.pickedDateTime).getTime();
      doSearch('gt','asc', ['overwrite','scrollToTop'],timestamp);
    } else {
      doSearch(null,'desc', ['overwrite','reverse'],null);
    }
  };

  $scope.showDatePicker = function () {
    $scope.datePickerVisible = true;
    if ($scope.pickedDateTime == null) {
      $scope.userDateTime = null;
    }
  };

  $scope.hideDatePicker = function () {
    $scope.datePickerVisible = false;
  };

  $scope.showHostPicker = function () {
    $scope.hostPickerVisible = true;
  };

  $scope.hideHostPicker = function () {
    $scope.hostPickerVisible = false;
  };

  $scope.onDateChange = function () {
    $scope.pickedDateTime = convertStringToDate($scope.userDateTime);
  };

  function convertStringToDate(string) {
    var date = null;
    var retDate = null;
    if (string !== '') {
      date = Date.create(string);
    }
    if (date !== null && date.isValid()) {
      retDate = date.full();
    } else {
      retDate = null;
    }
    return retDate;
  }

  $scope.seekAndSearch = function () {
    if ($scope.pickedDateTime != null) {
      $scope.userDateTimeSeeked = $scope.userDateTime;
    } else {
      $scope.userDateTimeSeeked = null;
    }
    $scope.hideDatePicker();
    $scope.onSearchClick();
  };

  $scope.isNullorEmpty = function (string) {
    return string == null || string === '';
  };

  $scope.toggleLiveTail = function () {
    if ($scope.liveTailStatus === 'Live') {
      updateLiveTailStatus('Pause');
    } else if ($scope.liveTailStatus === 'Pause') {
      updateLiveTailStatus('Live');
      doTail();
    } else { //Go Live - refresh whole view to launch view
      $scope.pickedDateTime = null;
      $scope.userDateTime = null;
      $scope.userDateTimeSeeked = null;
      updateLiveTailStatus('Live');
      doSearch(null, 'desc', ['overwrite','reverse'], null);
    }
  };

  $scope.onHostSelected = function (host) {
    $scope.hideHostPicker();
    if (host === '*') {
      $scope.selectedHost = null;
    } else {
      $scope.selectedHost = host;
    }
    $scope.onSearchClick();
  };

  $scope.onProgramClick = function (program) {
    $scope.userSearchText = selected_index_config.fields.mapping['program'] + '.keyword: "' + program + '"';
    $scope.onSearchClick();
  };

  $scope.getLiveTailStatus = function () {
    if ($scope.liveTailStatus === 'Live') {
      return 'PAUSE';
    } else if ($scope.liveTailStatus === 'Pause') {
      return 'LIVE';
    } else {
      return 'GO LIVE';
    }
  };

  angular.element($window).bind('scroll', function (event) {

    if (!updateViewInProgress) {
      //When scroll bar search bottom
      if (angular.element($window).scrollTop() + angular.element($window).height() === angular.element($document).height()) {
        if ($scope.events.length > 0) {
          var lastestEventTimestamp = Date.create($scope.events[$scope.events.length - 1].timestamp).getTime();
          doSearch('gt', 'asc', ['append','scrollToView'], lastestEventTimestamp);
        }
        $scope.$apply(updateLiveTailStatus('Live'));
      } else {
        //When scroll bar is in middle
        $scope.$apply(updateLiveTailStatus('Go Live'));
      }

      //When scrollbar reaches top & if scroll bar is visible
      if (window.pageYOffset === 0) {
        // && angular.element($document).height() > angular.element($window).height()) {
        if ($scope.events.length > 0) {
          var timestamp = Date.create($scope.events[0].timestamp).getTime();
          doSearch('lte', 'desc', ['prepend','scrollToView'], timestamp);
        }
      }
    }
  });

  function updateLiveTailStatus(status) {
    $scope.liveTailStatus = status;
  };

  function doTail() {
    if ($scope.liveTailStatus === 'Live' && !updateViewInProgress) {
      doSearch('gte', 'asc', ['append'], lastEventTime);
    }
  };

  function startTailTimer() {
    if (config != null) {
      tailTimer = $interval(doTail,(selected_index_config.tail_interval_in_seconds * 1000));
      $scope.$on('$destroy', function () {
        stopTailTimer();
      });
    }
  };

  function stopTailTimer() {
    if (tailTimer) {
      $interval.cancel(tailTimer);
    }
  };

  function setupHostsList() {
    var params = {
      index: selected_index_config.es.default_index
    };
    $http.get(chrome.addBasePath('/logtrail/hosts'),params).then(function (resp) {
      if (resp.data.ok) {
        $scope.hosts = resp.data.resp;
      } else {
        console.error('Error while fetching hosts : ' , resp.data.resp.msg);
        $scope.errorMessage = 'Exception while fetching hosts : ' + resp.data.resp.msg;
      }
    });
  }

  init();
});


//Directive to manage scroll during launch and on new events
uiModules.get('logtrail').directive('onLastRepeat', function () {
  return function (scope, element, attrs) {
    if (scope.$last) {
      setTimeout(function () {
        scope.$emit('onRepeatLast', element, attrs);
      }, 1);
    }
  };
});

uiModules.get('logtrail').directive('clickOutside', function ($document) {
  return {
    restrict: 'A',
    scope: {
      clickOutside: '&'
    },
    link: function (scope, el, attr) {
      $document.on('click', function (e) {
        if (el !== e.target && !el[0].contains(e.target) && (e.target !== angular.element('#showDatePickerBtn')[0] &&
        e.target !== angular.element('#showHostPickerBtn')[0])) {
          scope.$apply(function () {
            scope.$eval(scope.clickOutside);
          });
        }
      });
    }
  };
});