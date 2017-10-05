import { uiModules } from "ui/modules"

uiModules.get('app/logtrail', []).directive('formatEvent', function() {
  return {
    scope: true,
    link: function (scope, element, attr) {
      element.on('click', function(clickEvent) {
        var argElement = angular.element(clickEvent.target);
        var argNum = argElement.data('argnum');
        //in case of highlight span will be the target. then search for parent.
        if (!argNum) {
          argNum = argElement.parent().data('argnum');
        }
        if (argNum) {
          var patternInfo = scope.event.patternInfo;
          var matchIndices = patternInfo.matchIndices;
          var text = scope.event.raw_message.substring(matchIndices[argNum * 2 - 2],matchIndices[argNum * 2 -1]);
          if (event.shiftKey) {
            var searchString = 'logtrail.patternId:' + patternInfo.patternId + ' AND logtrail.a' + argNum + ':"' + text + '"';
            //e.g searchString : logtrail.patternId:AV6ZmVeGVcFBgzHpAO3k AND logtrail.a1:"/10.196.68.149:3570"
            scope.search({
              searchString: searchString
            });
          } else if (event.altKey) {
            var searchString = '"' + text + '"';
            //e.g searchString : "/10.196.68.149:3570"
            scope.search({
              searchString: searchString
            });
          } else {
            scope.closeArgPopup();
            var rect = clickEvent.target.getBoundingClientRect();
            var left = rect.left - 30;
            var top = rect.top + 50;
            if ((rect.left + 440) > window.innerWidth) {
              left = left - (rect.left + 490 - window.innerWidth);
            }

            if ((rect.top + 350) > window.innerHeight) {
              top = top - (rect.top + 350 - window.innerHeight);
            }

            scope.argPopup.style.left = left;
            scope.argPopup.style.top = top;
            scope.argPopup.event = scope.event;
            scope.argPopup.text = text;
            scope.argPopup.argNum = argNum;
            scope.argPopup.className = scope.event.sourcePattern.context;
            scope.argPopup.methodName = scope.event.sourcePattern.method;
            scope.argPopup.variableName = scope.event.sourcePattern.args[argNum-1];
            scope.argPopup.fieldName = scope.event.sourcePattern.fields[argNum-1];
            scope.argPopup.argElement = argElement;
            scope.argPopup.argElement.addClass('highlight-arg');
            scope.argPopup.show = true;
            scope.$apply();
          }
        }
      });
    }
  }
});