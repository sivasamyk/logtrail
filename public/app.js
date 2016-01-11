var moment = require('moment');
var chrome = require('ui/chrome');
var routes = require('ui/routes');
var modules = require('ui/modules');
var angular = require('angular');
var sugarDate = require('sugar-date');
var moment = require('moment');

require('plugins/konsole/css/main.css');
//require('plugins/konsole/less/main.less');

var konsoleLogo = require('plugins/konsole/images/header.png');

chrome
.setBrand({
  logo: 'url(' + konsoleLogo + ') center no-repeat',
  smallLogo: 'url(' + konsoleLogo + ') center no-repeat',
})
.setNavBackground('#03498f')
.setTabDefaults({})
.setTabs([]);

var app = require('ui/modules').get('app/konsole', []);

require('ui/routes')
  .when('/', {
    template: require('plugins/konsole/templates/index.html')
  });

app.controller('konsole', function ($scope, es, courier, $window, $interval, $http, $document) {
  $scope.title = 'Konsole';
  $scope.description = 'Plugin to view, search & tail logs in Kibana';
  $scope.userSearchText = null;
  $scope.events = [ ];
  $scope.datePickerVisible = false;
  $scope.userDateTime = null;
  $scope.pickedDateTime = null;
  $scope.userDateTimeSeeked = null;
  $scope.liveTailStatus = null;
  var tailTimer = null;
  var searchText = null;
  var lastExecutedTime = null;

  function init() {
    checkElasticsearch();
    doSearch(false);
    startTailTimer();
  };

  function checkElasticsearch() {
    return $http.get('/konsole/validate/es').then(function (resp) {
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

    return $http.post('/konsole/search', request).then(function (resp) {
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
      $scope.$apply(updateLiveTailStatus('Pause'));
    } else if ($scope.liveTailStatus === 'Pause') {
      $scope.$apply(updateLiveTailStatus('Live'));
    } else {
      angular.element('#kibana-body').scrollTop(angular.element('#kibana-body')[0].scrollHeight);
    }
  };

  /*$scope.getTailStatus = function () {
    return $scope.liveTail ? 'Pause' : 'Live'
  }*/

	//Initialize scroll on launch
  $scope.$on('onRepeatLast', function () {
    angular.element('#kibana-body').scrollTop(angular.element('#kibana-body')[0].scrollHeight);
  });

  angular.element($window).bind('scroll', function (event) {
		//console.log(window.pageYOffset);
    if (angular.element($window).scrollTop() + angular.element($window).height() === angular.element($document).height()) {
      $scope.$apply(updateLiveTailStatus('Pause'));
    } else {
      $scope.$apply(updateLiveTailStatus('Go Live'));
    }
  });

  function updateLiveTailStatus(status) {
    $scope.liveTailStatus = status;
  };

  function doTail() {
    if ($scope.liveTailStatus === 'Pause') {
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
  init();
});


//Directive to manage scroll during launch and on new events
modules.get('konsole').directive('onLastRepeat', function () {
  return function (scope, element, attrs) {
    if (scope.$last) {
      setTimeout(function () {
        scope.$emit('onRepeatLast', element, attrs);
      }, 1);
    }
  };
});

//Directive to manage date picker popup clicks
modules.get('konsole').directive('clickOutside', function ($document) {
  return {
    restrict: 'A',
    scope: {
      clickOutside: '&'
    },
    link: function (scope, el, attr) {
      $document.on('click', function (e) {
        if (el !== e.target && !el[0].contains(e.target) && e.target !== angular.element('#showDatePickerBtn')[0]) {
          scope.$apply(function () {
            scope.$eval(scope.clickOutside);
          });
        }
      });
    }
  };
});
