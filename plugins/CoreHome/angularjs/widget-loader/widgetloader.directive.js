/*!
 * Matomo - free/libre analytics platform
 *
 * @link https://matomo.org
 * @license http://www.gnu.org/licenses/gpl-3.0.html GPL v3 or later
 */

/**
 * Loads any custom widget or URL based on the given parameters.
 *
 * The currently active idSite, period, date and segment (if needed) is automatically appended to the parameters. If
 * this widget is removed from the DOM and requests are in progress, these requests will be aborted. A loading message
 * or an error message on failure is shown as well. It's kinda similar to ng-include but there it is not possible to
 * listen to HTTP errors etc.
 *
 * Example:
 * <div piwik-widget-loader="{module: '', action: '', ...}"></div>
 */
(function () {
    angular.module('piwikApp').directive('piwikWidgetLoader', piwikWidgetLoader);

    piwikWidgetLoader.$inject = ['piwik', 'piwikUrl', '$http', '$compile', '$q', '$location', 'notifications', '$rootScope', '$timeout', 'piwikComparisonsService'];

    function piwikWidgetLoader(piwik, piwikUrl, $http, $compile, $q, $location, notifications, $rootScope, $timeout, piwikComparisonsService){
        return {
            restrict: 'A',
            transclude: true,
            scope: {
                piwikWidgetLoader: '=',
                widgetName: '@',
                loadingMessage: '@'
            },
            templateUrl: 'plugins/CoreHome/angularjs/widget-loader/widgetloader.directive.html?cb=' + piwik.cacheBuster,
            compile: function (element, attrs) {

                return function (scope, element, attrs, ngModel) {
                    scope.widgetName = attrs.widgetName;

                    if (!attrs.widgetName) {
                        scope.loadingMessage = _pk_translate('General_LoadingData');
                    } else {
                        scope.loadingMessage = _pk_translate('General_LoadingPopover', [attrs.widgetName]);
                    }

                    var changeCounter = 0,
                        currentScope,
                        currentElement,
                        httpCanceler,
                        contentNode = element.find('.theWidgetContent');

                    var cleanupLastWidgetContent = function() {
                        if (currentElement) {
                            currentElement.remove();
                            currentElement = null;
                        }
                        if (currentScope) {
                            currentScope.$destroy();
                            currentScope = null;
                        }
                    };

                    var abortHttpRequestIfNeeded = function () {
                        if (httpCanceler) {
                            httpCanceler.resolve();
                            httpCanceler = null;
                        }
                    }

                    function getFullWidgetUrl(parameters) {

                        var url = $.param(parameters);

                        var $urlParams = $location.search();

                        delete $urlParams['comparePeriods[]'];
                        delete $urlParams['compareDates[]'];
                        delete $urlParams['compareSegments[]'];

                        if ($.isEmptyObject($urlParams) || !$urlParams || !$urlParams['idSite']) {
                            // happens eg in exported widget etc when URL does not have #?...
                            $urlParams = {idSite: 'idSite', period: 'period',date: 'date'};
                            if (piwikUrl.getSearchParam('widget')) {
                                $urlParams['widget'] = 'widget';
                            }
                        } else {
                            $urlParams = angular.copy($urlParams);
                            delete $urlParams['category'];
                            delete $urlParams['subcategory'];
                        }

                        if (piwikUrl.getSearchParam('segment')) {
                            $urlParams['segment'] = 'segment';
                        }

                        angular.forEach($urlParams, function (value, key) {
                            if (!(key in parameters)) {
                                url += '&' + key + '=' + piwikUrl.getSearchParam(key);
                            }
                        });

                        if (piwikComparisonsService.isComparisonEnabled()) {
                            ['comparePeriods', 'compareDates', 'compareSegments'].forEach(function (paramName) {
                                var value = piwikUrl.getSearchParam(paramName);
                                if (value) {
                                    var map = {};
                                    map[paramName] = value;
                                    url += '&' + $.param(map);
                                }
                            });
                        }

                        if (!parameters || !('showtitle' in parameters)) {
                            url += '&showtitle=1';
                        }

                        if (piwik.shouldPropagateTokenAuth && broadcast.getValueFromUrl('token_auth')) {
                            if (!piwik.broadcast.isWidgetizeRequestWithoutSession()) {
                                url += '&force_api_session=1';
                            }
                            url += '&token_auth=' + encodeURIComponent(broadcast.getValueFromUrl('token_auth'));
                        }

                        url += '&random=' + parseInt(Math.random() * 10000);

                        return '?' + url;
                    }

                    function loadWidgetUrl(parameters, thisChangeId)
                    {
                        scope.loading = true;

                        var url = getFullWidgetUrl(parameters);

                        abortHttpRequestIfNeeded();
                        cleanupLastWidgetContent();

                        httpCanceler = $q.defer();

                        $http.get(url, {timeout: httpCanceler.promise, headers: {'X-Requested-With': 'XMLHttpRequest'}}).then(function(response) {
                            if (thisChangeId !== changeCounter || !response.data) {
                                // another widget was requested meanwhile, ignore this response
                                return;
                            }

                            httpCanceler = null;

                            var newScope = scope.$new();
                            currentScope = newScope;

                            scope.loading = false;
                            scope.loadingFailed = false;

                            currentElement = contentNode.html(response.data).children();

                            if (scope.widgetName) {
                                // we need to respect the widget title, which overwrites a possibly set report title
                                var $title = currentElement.find('> .card-content .card-title');
                                if (!$title.length) {
                                    $title = currentElement.find('> h2');
                                }

                                if ($title.length) {
                                    $title.html(piwik.helper.htmlEntities(scope.widgetName));
                                }
                            }

                            $compile(currentElement)(newScope);

                            notifications.parseNotificationDivs();

                            $timeout(function () {
                                $rootScope.$emit('widget:loaded', {
                                    parameters: parameters,
                                    element: currentElement,
                                });
                            });
                        })['catch'](function (response) {
                            if (thisChangeId !== changeCounter) {
                                // another widget was requested meanwhile, ignore this response
                                return;
                            }

                            httpCanceler = null;

                            cleanupLastWidgetContent();

                            scope.loading = false;

                            if (response.xhrStatus === 'abort') {
                                return;
                            };

                            scope.loadingFailed = true;
                        });
                    }

                    scope.$watch('piwikWidgetLoader', function (parameters, oldUrl) {
                        if (parameters) {
                            loadWidgetUrl(parameters, ++changeCounter);
                        }
                    });

                    element.on('$destroy', function() {
                        abortHttpRequestIfNeeded();
                    });
                };
            }
        };
    }
})();
