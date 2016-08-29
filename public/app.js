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

app.controller('konsole', function ($scope, $window, $interval, $http, $document, $compile, $timeout) {
  $scope.title = 'Konsole';
  $scope.description = 'Plugin to view, search & tail logs in Kibana';
  $scope.userSearchText = null;
  $scope.events = [ ];
  $scope.datePickerVisible = false;
  $scope.hostPickerVisible = false;
  $scope.userDateTime = null; // exact string typed by user like 'Aug 24 or last friday'
  $scope.pickedDateTime = null; // UTC date used in search query.
  $scope.userDateTimeSeeked = null; // exact string entered by user set after user clicks seek. User to show in search button
  $scope.liveTailStatus = 'Live';
  $scope.hosts = null;
  $scope.selectedHost = "All Systems";
  $scope.firstEventReached = false;
  var updateViewInProgress = false;
  var tailTimer = null;
  var searchText = null;
  var lastEventTime = null;

  function init() {
    checkElasticsearch();
    doSearch(null, 'desc', ['overwrite','reverse'], null);
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

  /**
    rangeType - gte or lte
    action - whether to append new events to end or prepend or clear all events (overwrite)
    timestamp - timestamp for range if available
  **/
  function doSearch(rangeType,order,actions,timestamp) {
    /*var timestamp = null;
    if ($scope.pickedDateTime != null)  {
      timestamp = Date.create($scope.pickedDateTime).getTime();
    }

    if (fromLiveTail) {
      timestamp = lastEventTime;
    }*/

    var request = {
      searchText: searchText,
      timestamp: timestamp,
      rangeType: rangeType,
      order: order
    };

    return $http.post('../konsole/search', request).then(function (resp) {
      if (resp.data.ok) {
        updateEventView(resp.data.resp,actions,order);
      } else {
        console.log('Error while fetching events ' + resp);
      }
    });
  };

  //TODO :: Remove duplicate events in case of tail.
  function removeDuplicates(newEventsFromServer) {
    // angular.forEach(newEventsFromServer, function(newEvent) {
    //   var alreadyPresent = false;
    //   angular.forEach($scope.events, function(event) {
    //     if(newEvent.id === event.id) {
    //
    //     }
    //   });
    // });
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
  */

  function updateEventView(events,actions,order) {

    updateViewInProgress = true;
    if (actions.indexOf('reverse') != -1) {
      events.reverse();
    }
    if (actions.indexOf('overwrite') != -1) {
      //If events are order desc, the reverse the list
      /*if(order === 'desc') {
        events.reverse();
      }*/
      $scope.firstEventReached = false;
      $scope.events = [];
      angular.forEach(events, function (event) {
        $scope.events.push(event);
      });
      $timeout(function () {
        //If scrollbar not visible
        if ($(document).height() <= $(window).height()) {
          $scope.firstEventReached = true;
        }
      });
    }
    if(actions.indexOf('append') != -1) {
      //If events are order desc, the reverse the list
      if(order === 'desc') {
        events.reverse();
      }
      removeDuplicates(events);
      angular.forEach(events, function (event) {
        $scope.events.push(event);
      });
    }
    var firstEventId = null;
    if(actions.indexOf('prepend') != -1) {
      if(events.length > 0) {
        //Need to move scrollbar to old event location
        var firstEventId = $scope.events[0].id;
        angular.forEach(events, function (event) {
          $scope.events.unshift(event);
        });
      } else {
        $scope.firstEventReached = true;
      }
    }

    if(actions.indexOf('scrollToTop') != -1) {
      $timeout(function() {
        window.scrollTo(0,5);
        console.log("scrollToTop called");
      });
    } else if(actions.indexOf('scrollToView') != -1) {
      if(firstEventId != null) {
        //Make sure the old top event in is still in view
        $timeout(function() {
          var firstEventElement = document.getElementById(firstEventId);
          var topPos = firstEventElement.offsetTop;
          firstEventElement.scrollIntoView();
        });
      }
    } else {
      //Bring scroll to bottom
      $timeout(function () {
        console.log('scroll to bottom')
        angular.element('#kibana-body').scrollTop(angular.element('#kibana-body')[0].scrollHeight);
      })
      //window.scrollTo(0,$(document).height());
    }

    if ($scope.events.length > 0)   {
      lastEventTime = Date.create($scope.events[$scope.events.length - 1].received_at).getTime();
    } else {
      lastEventTime = null;
    }

    $timeout(function () {
      updateViewInProgress = false;
    })
  };

  $scope.onSearchClick = function (string) {

    searchText = '*';

    if($scope.selectedHost != 'All Systems') {
      searchText = 'hostname:' + $scope.selectedHost;

      if($scope.userSearchText != null ) {
        searchText = searchText + " and " + $scope.userSearchText;
      }
    } else if ($scope.userSearchText != null) {
      searchText = $scope.userSearchText;
      //$scope.userSearchText = searchText;
    }

    if($scope.pickedDateTime != null) {
      var timestamp = Date.create($scope.pickedDateTime).getTime();
      doSearch('gt','asc', ['overwrite',"scrollToTop"],timestamp);
    } else {
      doSearch(null,'desc', ['overwrite','reverse'],null);
    }
    //doSearch(null,'desc', ['overwrite','reverse'],null);
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
      //angular.element('#kibana-body').scrollTop(angular.element('#kibana-body')[0].scrollHeight);
      $scope.pickedDateTime = null;
      $scope.userDateTime = null;
      $scope.userDateTimeSeeked = null;
      updateLiveTailStatus('Live');
      doSearch(null, 'desc', ['overwrite','reverse'], null);
      //doTail();
    }
  };

  $scope.onHostSelected = function (host) {
    $scope.hideHostPicker();
    $scope.selectedHost = host;
    /*if($scope.userSearchText != null) {
      searchText = $scope.userSearchText + " and hostname:" + host;
    } else {
      searchText = "hostname:" + host;
    }
    if($scope.pickedDateTime != null) {
      doSearch(null,'asc', ['overwrite',"scrollToTop"],$scope.pickedDateTime);
    } else {
      doSearch(null,'desc', ['overwrite','reverse'],null);
    }
    //$scope.onSearchClick("hostname:" + host);*/
    $scope.onSearchClick();
  };

  $scope.onProgramClick = function (program) {
    $scope.userSearchText = "program: \"" + program + "\"";
    $scope.onSearchClick();
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
    //angular.element('#kibana-body').scrollTop(angular.element('#kibana-body')[0].scrollHeight);
    console.log("onRepeatLast called");
  });

  angular.element($window).bind('scroll', function (event) {

    if(!updateViewInProgress) {
      //When scroll bar search bottom
      if (angular.element($window).scrollTop() + angular.element($window).height() === angular.element($document).height()) {
        if($scope.events.length > 0) {
          console.log('scrollbar reaches buttons');
          var timestamp = Date.create($scope.events[$scope.events.length-1].received_at).getTime();
          doSearch('gt', 'asc', ['append','scrollToView'], timestamp);
        }
        $scope.$apply(updateLiveTailStatus('Live'));
      } else {
        //When scroll bar is in middle
        $scope.$apply(updateLiveTailStatus('Go Live'));
      }

      //When scrollbar reaches top & if scroll bar is visible
      if(window.pageYOffset == 0) {
      // && angular.element($document).height() > angular.element($window).height()) {
          if($scope.events.length > 0) {
            var timestamp = Date.create($scope.events[0].received_at).getTime();
            doSearch('lt', 'desc', ['prepend','scrollToView'], timestamp);
          }
      }
    }
  });

  function updateLiveTailStatus(status) {
    /*if(status === 'Live') {
      doSearch(true);
    }*/
    $scope.liveTailStatus = status;
  };

  function doTail() {
    if ($scope.liveTailStatus === 'Live') {
      //TODO : RangeType should be gte and need to remove duplicates
      doSearch('gt', 'asc', ['append'], lastEventTime);
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
uiModules.get('konsole').directive('onLastRepeat', function ($timeout) {
  return function (scope, element, attrs) {
    if (scope.$last) {
      $timeout(function () {
        scope.$emit('onRepeatLast', element, attrs);
      });
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
