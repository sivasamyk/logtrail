var moment = require('moment');
var chrome = require('ui/chrome');
var routes = require('ui/routes');
var modules = require('ui/modules');
var angular = require('angular');
var sugarDate = require('sugar-date');
var moment = require('moment');

require('plugins/logtrail/css/main.css');

var logtrailLogo = require('plugins/logtrail/images/header.png');

chrome
.setBrand({
  logo: 'url(' + logtrailLogo + ') center no-repeat',
  smallLogo: 'url(' + logtrailLogo + ') center no-repeat',
})
.setNavBackground('#03498f')
.setTabDefaults({})
.setTabs([]);

var app = require('ui/modules').get('app/konsole', []);

require('ui/routes').enable();

require('ui/routes')
.when('/', {
  template: require('plugins/logtrail/templates/index.html')
});

document.title = 'LogTrail - Kibana';

app.controller('logtrail', function ($scope, kbnUrl, es, courier, $window, $interval, $http, $document, $timeout) {
  $scope.title = 'LogTrail';
  $scope.description = 'Plugin to view, search & tail logs in Kibana';
  $scope.userSearchText = null;
  $scope.events = null;
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
  var updateViewInProgress = false;
  var tailTimer = null;
  var searchText = null;
  var lastEventTime = null;
  var config = null;

  function init() {
    kbnUrl.change('');
    checkElasticsearch();
  };

  function checkElasticsearch() {
    return $http.get('/logtrail/validate/es').then(function (resp) {
      if (resp.data.ok) {
        config = resp.data.config;
        console.info('connection to elasticsearch successful');
        //Initialize app views on validate successful
        setupHostsList();
        doSearch(null, 'desc', ['overwrite','reverse'], null);
        startTailTimer();
      } else {
        console.error('validate elasticsearch failed :' , resp);
        $scope.errorMessage = 'Cannot connect to elasticsearch : ' + resp.data.resp.msg;
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
      hostname: $scope.selectedHost
    };

    return $http.post('/logtrail/search', request).then(function (resp) {
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
    if (actions.indexOf('reverse') !== -1) {
      events.reverse();
    }
    if (actions.indexOf('overwrite') !== -1) {
      //If events are order desc, the reverse the list
      /*if (order === 'desc') {
      events.reverse();
    }*/
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
          if (firstEventElement !== null) {
            var topPos = firstEventElement.offsetTop;
            firstEventElement.scrollIntoView();
          }
        });
      }
    } else {
      //Bring scroll to bottom
      $timeout(function () {
        angular.element('#kibana-body').scrollTop(angular.element('#kibana-body')[0].scrollHeight);
      });
      //window.scrollTo(0,$(document).height());
    }

    if ($scope.events.length > 0)   {
      lastEventTime = Date.create($scope.events[$scope.events.length - 1].timestamp).getTime();
    } else {
      lastEventTime = null;
    }

    $timeout(function () {
      updateViewInProgress = false;
    });
  };
  $scope.onSearchClick = function (string) {

    searchText = '*';
    if ($scope.userSearchText !== null) {
      searchText = $scope.userSearchText;
    }

    if ($scope.pickedDateTime !== null) {
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
    var date = null;//Date.create();
    if ($scope.userDateTime !== '') {
      date = Date.create($scope.userDateTime);
    }
    if (date !== null && date.isValid()) {
      $scope.pickedDateTime = date.full();
    } else {
      $scope.pickedDateTime = null;
    }
  };

  $scope.seekAndSearch = function () {
    if ($scope.pickedDateTime != null) {
      $scope.userDateTimeSeeked = $scope.userDateTime;
    } else {
      $scope.userDateTimeSeeked = null;
    }
    $scope.hideDatePicker();
    /*var pickedTimestamp = Date.create($scope.pickedDateTime).getTime();
    doSearch('gte', 'asc', ['overwrite','scrollToTop'], pickedTimestamp);*/
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
    $scope.userSearchText = 'program: \'' + program + '\'';
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
      tailTimer = $interval(doTail,(config.tail_interval_in_seconds * 1000));
      $scope.$on('$destroy', function () {
        stopTailTimer();
      });
    }
  };

  function stopTailTimer() {
    if (tailTimer) {
      $interval.stop(tailTimer);
    }
    tailTimer = null;
  };

  function setupHostsList() {
    $http.get('/logtrail/hosts').then(function (resp) {
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
modules.get('logtrail').directive('onLastRepeat', function () {
  return function (scope, element, attrs) {
    if (scope.$last) {
      setTimeout(function () {
        scope.$emit('onRepeatLast', element, attrs);
      }, 1);
    }
  };
});

modules.get('logtrail').directive('clickOutside', function ($document) {
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
