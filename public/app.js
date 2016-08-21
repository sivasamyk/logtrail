import moment from 'moment';
import chrome from 'ui/chrome';
import uiModules from 'ui/modules';
import uiRoutes from 'ui/routes';
import angular from 'angular';
import sugarDate from 'sugar-date';

import 'ui/autoload/styles';
import './less/main.less';
import 'plugins/konsole/css/main.css';

import template from './templates/index.html';

chrome.setNavBackground('#222222');

var app = uiModules.get('app/konsole', []);

uiRoutes.enable();
uiRoutes
.when('/', {
  template
});

app.controller('konsole', function ($scope, $window, $interval, $http, $document, $compile) {
  $scope.title = 'Konsole';
  $scope.description = 'Plugin to view, search & tail logs in Kibana';
  $scope.userSearchText = null;
  $scope.events = [ ];
  $scope.datePickerVisible = false;
  $scope.hostPickerVisible = false;
  $scope.userDateTime = null;
  $scope.pickedDateTime = null;
  $scope.userDateTimeSeeked = null;
  $scope.liveTailStatus = 'Live';
  $scope.hosts = null;
  $scope.selectedHost = "All Systems";
  var tailTimer = null;
  var searchText = null;
  var lastExecutedTime = null;

  function init() {
    checkElasticsearch();
    doSearch(false);
    startTailTimer();
    setupHostsList();
  };

  function checkElasticsearch() {
    return $http.get('../konsole/validate/es').then(function (resp) {
      if (resp.data.ok) {
        console.log(resp);
      } else {
        console.log('not good');
      }
    });
  };

  function doSearch(fromLiveTail) {
    var timestamp = null;
    if ($scope.pickedDateTime != null)  {
      timestamp = Date.create($scope.pickedDateTime).getTime();
    }

    if (fromLiveTail) {
      timestamp = lastExecutedTime;
    }

    var request = {
      searchText: searchText,
      timestamp: timestamp,
      liveTail: fromLiveTail
    };
    console.log(request);

    return $http.post('../konsole/search', request).then(function (resp) {
      if (resp.data.ok) {
        updateEvents(resp.data.resp,fromLiveTail);
      } else {
        console.log('not good');
      }
    });
  };

  function updateEvents(events,fromLiveTail) {
    if (!fromLiveTail) {
      $scope.events = [];
    }
    angular.forEach(events, function (event) {
      $scope.events.push(event);
    });

    if (events.length > 0)   {
      lastExecutedTime = Date.create(events[events.length - 1].received_at).getTime();
    }
    //$scope.$apply();
  };

  $scope.search = function (string) {
    if (string != null) {
      searchText = string;
      $scope.userSearchText = searchText;
    }
    doSearch(false);
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
    var date = Date.create();
    if ($scope.userDateTime !== '') {
      date = Date.create($scope.userDateTime);
    }
    if (date.isValid()) {
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
    doSearch(false);
  };

  $scope.isNullorEmpty = function (string) {
    return string == null || string === '';
  };

  $scope.toggleLiveTail = function () {
    if ($scope.liveTailStatus === 'Live') {
      updateLiveTailStatus('Pause');
    } else if ($scope.liveTailStatus === 'Pause') {
      updateLiveTailStatus('Live');
    } else {
      angular.element('#kibana-body').scrollTop(angular.element('#kibana-body')[0].scrollHeight);
    }
  };

  $scope.onHostSelected = function (host) {
    $scope.hideHostPicker();
    $scope.selectedHost = host;
    $scope.search("syslog_hostname: " + host);
  };

  $scope.getLiveTailStatus = function () {
    if($scope.liveTailStatus === 'Live') {
      return 'PAUSE';
    } else if($scope.liveTailStatus === 'Pause') {
      return 'LIVE';
    } else {
      return 'GO LIVE';
    }
  }

	//Initialize scroll on launch
  $scope.$on('onRepeatLast', function () {
    angular.element('#kibana-body').scrollTop(angular.element('#kibana-body')[0].scrollHeight);
  });

  angular.element($window).bind('scroll', function (event) {
		console.log("Ypageoffset" + window.pageYOffset);
    console.log("LHS" + (angular.element($window).scrollTop() + angular.element($window).height()));
    console.log("RHS" + angular.element($document).height());
    if (angular.element($window).scrollTop() + angular.element($window).height() === angular.element($document).height()) {
      $scope.$apply(updateLiveTailStatus('Live'));
    } else {
      $scope.$apply(updateLiveTailStatus('Go Live'));
    }
  });

  function updateLiveTailStatus(status) {
    $scope.liveTailStatus = status;
  };

  function doTail() {
    if ($scope.liveTailStatus === 'Live') {
      doSearch(true);
    }
  };

  function startTailTimer() {
    tailTimer = $interval(doTail,10000);
    $scope.$on('$destroy', function () {
      stopTailTimer();
    });
  };

  function stopTailTimer() {
    if (tailTimer) {
      $interval.stop(tailTimer);
    }
    tailTimer = null;
  };

  function setupHostsList() {
    $http.get('../konsole/hosts').then(function (resp) {
      if (resp.data.ok) {
        console.log(resp.data.resp);
        $scope.hosts = resp.data.resp;
      } else {
        console.log('not good');
      }
    });
  }

  init();
});


//Directive to manage scroll during launch and on new events
uiModules.get('konsole').directive('onLastRepeat', function () {
  return function (scope, element, attrs) {
    if (scope.$last) {
      setTimeout(function () {
        scope.$emit('onRepeatLast', element, attrs);
      }, 1);
    }
  };
});

//Directive to manage date picker popup clicks
uiModules.get('konsole').directive('clickOutside', function ($document) {
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
