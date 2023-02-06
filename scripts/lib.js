/*
Veeva MyInsights Library version 223.2.908

http://developer.veevacrm.com/

Copyright © 2017 Veeva Systems, Inc. All rights reserved.

My Insights Library is dependent on the Q library, which enables you to work with promises as returns from the My Insights Library methods.
Include the Q library as a script in the custom report package.
Q Library License Acknolegements
Copyright 2009-2017 Kristopher Michael Kowal. All rights reserved.
Q library can be downloaded here https://github.com/kriskowal/q/blob/v1/LICENSE
*/
(function () {
    'use strict';
    window.VeevaUtilities = function () {
        var veevaUtil = this;

        veevaUtil.isWin8 = function () {
            return navigator.platform.toLowerCase().indexOf('win') >= 0;
        };

        /**
         * Returns true if the client is Windows tablet
         * @return {Boolean}
         */
        veevaUtil.isWindowsMobile = function() {
            return (typeof window.external !== 'undefined') && ('notify' in window.external);
        };

        veevaUtil.isOnline = function () {
            var host = window.location.hostname;
            var cdnRETest = /cdnhtml/gi;
            var cloudFrontDomain = 'cloudfront.net';
            var isCloudFront = host.indexOf(cloudFrontDomain) >= 0;

            return cdnRETest.test(host) || isCloudFront;
        };

        veevaUtil.addMessageListener = function (callback) {
            if (window.addEventListener) {
                window.addEventListener('message', callback, false);
            } else {
                window.attachEvent('onmessage', callback);
            }
            return callback;
        };

        veevaUtil.removeMessageListener = function (callback) {
            if (window.removeEventListener) {
              window.removeEventListener('message', callback, false);
            }
            else {
              window.detachEvent('onmessage', callback);
            }
        };

        veevaUtil.mergeObjects = function (dst, src, clobber) {
            for (var k in src) {
                if (src.hasOwnProperty(k) && ((!clobber && !dst[k]) || clobber)) {
                    dst[k] = src[k];
                }
            }
            return dst;
        };

        veevaUtil.copyObject = function (obj) {
            return JSON.parse(JSON.stringify(obj));
        };

        veevaUtil.deepCopy = function (originalObject) {
            if(originalObject === null || typeof(originalObject) !== 'object') {
                return originalObject;
            }

            var clonedObject;
            if(originalObject instanceof Date) {
                clonedObject = new Date(originalObject);
            } else {
                clonedObject = originalObject.constructor();
            }

            for(var key in originalObject) {
                // Ignore inherited properties
                if(Object.prototype.hasOwnProperty.call(originalObject, key)) {
                    //TODO: worse case O(2^n), any better?
                    clonedObject[key] = veevaUtil.deepCopy(originalObject[key]);
                }
            }

            return clonedObject;
        };

        veevaUtil.replaceStringInWhereClause = function (whereClause, input, stringToBeReplaced) {
            var result = '', i;
            var indices = getIndicesOf(stringToBeReplaced, whereClause);

            if (indices.length === 0) {
                return whereClause;
            }

            for (i = 0; i < indices.length; i+=1) {

                if (i === 0) {
                    result += whereClause.slice(0, indices[0]);
                }else {
                    result += whereClause.slice((indices[i - 1] + stringToBeReplaced.length), indices[i]);
                }

                result = result + "'" + input + "'";
            }

            result += whereClause.slice((indices[indices.length - 1] + stringToBeReplaced.length));

            return result;
        };

        function getIndicesOf(searchStr, str, caseSensitive) {
            var searchStrLen = searchStr.length;
            var startIndex = 0, index, indices = [];

            if (searchStrLen === 0) {
                return [];
            }

            if (!caseSensitive) {
                str = str.toLowerCase();
                searchStr = searchStr.toLowerCase();
            }

            while ((index = str.indexOf(searchStr, startIndex)) > -1) {
                indices.push(index);
                startIndex = index + searchStrLen;
            }

            return indices;
        }
    };
})();

(function (Q) {
    'use strict';
    window.OnlineAPI = function () {
        var olAPI = this;
        var listenerQueue = {};
        var veevaUtil = new window.VeevaUtilities();
        var translationsCache = {};
        var queries = {
            translations: {
                object: 'Message_vod__c',
                fields: ['Name', 'Category_vod__c', 'Language_vod__c', 'Text_vod__c'],
                where: ''
            }
        };
        var errorCode = {
            GENERIC: 0,
            NO_PARAMETER: 2,
            UNSUPPORTED_OBJECT: 10
        };
        olAPI.htmlReportIdAndUUIDDeferred = Q.defer();
        olAPI.htmlReportIdAndUUIDDeferred.promise.then(function(htmlReportIdentifiers) {
            olAPI.htmlReportId = htmlReportIdentifiers.htmlReportId;
            olAPI.htmlReportUUID = htmlReportIdentifiers.htmlReportUUID;
        });

        // Set timeout in case we are Online with the old non-LEX MyInsights page.
        // We will set a half second timeout since we want to make sure that older
        // reports will still work without the htmlReportId and htmlReportUUID
        setTimeout(function() {
            if (!olAPI.htmlReportId || !olAPI.htmlReportUUID) {
                olAPI.htmlReportIdAndUUIDDeferred.resolve({
                    htmlReportId: undefined,
                    htmlReportUUID: undefined
                });
            }
        }, 500);

        function getIFrameDimensions() {
            return {
                height: document.scrollingElement.offsetHeight
            }
        }

        function sendIFrameDimensionsToParentWindow() {
            var iframeDimensionsToRequest = getIFrameDimensions();
            // We will send the HTML Report Id in the case there is more than one
            // MyInsights LWC on the screen
            postMessage({
                command: "iframeDimensions",
                iframeDimensions: iframeDimensionsToRequest
            });
        }

        function queryListener(message) {
            var data;
            if (typeof message.data === 'string') {
                try {
                    data = JSON.parse(message.data);
                }
                catch (e) {
                    data = {data: {}};
                }
            }
            if (data.command === 'queryReturn') {
                if (listenerQueue[data.deferredId]) {
                    listenerQueue[data.deferredId].resolve(data);
                    delete listenerQueue[data.deferredId];

                    if(~data.deferredId.indexOf('callback_queued_')) {
                        olAPI.queryRunning = false;
                        olAPI.checkQueryQueue();
                    }
                } else if (olAPI._MESSAGE_REGISTRY[data.messageId]) {
                    olAPI._MESSAGE_REGISTRY[data.messageId].resolve(data);

                    delete olAPI._MESSAGE_REGISTRY[data.messageId];
                } else {
                    console.warn('deferred object not found', data);
                }
            } else if (data.command === 'error') {
                if(listenerQueue[data.deferredId]) {
                    listenerQueue[data.deferredId].reject(data);
                    delete listenerQueue[data.deferredId];

                    if(~data.deferredId.indexOf('callback_queued_')) {
                        olAPI.queryRunning = false;
                        olAPI.checkQueryQueue();
                    }
                }else if (olAPI._MESSAGE_REGISTRY[data.messageId]) {
                    olAPI._MESSAGE_REGISTRY[data.messageId].reject(data);

                    delete olAPI._MESSAGE_REGISTRY[data.messageId];
                }
            } else if (data.command === 'setHTMLReportIdAndUUID') {
                olAPI.htmlReportIdAndUUIDDeferred.resolve({
                    htmlReportId: data.htmlReportId,
                    htmlReportUUID: data.htmlReportUUID
                });
            } else if (data.command === "iframeDimensions") {
                // When the parent window requests iframeDimensions
                // we will return our dimensions and allow the parent window
                // determine how much space to give the iframe
                sendIFrameDimensionsToParentWindow();
            } else {
                console.warn('unknown command', message);
            }
        }

        function addMessageListener(callback) {
            if (window.addEventListener) {
                window.addEventListener('message', callback, false);
            }
            else {
                window.attachEvent('onmessage', callback);
            }
        }

        function postMessage(message) {
            // We will wait for the htmlReportIdAndUUIDDeferred promise to resolve
            // before we attempt to send a message to the parent window.
            // This allows us to uniquely identify our message so the parent window knows
            // which iframe sent the message.
            olAPI.htmlReportIdAndUUIDDeferred.promise.then(function() {
                // If HTML Report Id and HTML Report UUID are defined we will pass them
                // to the parent window in the case that there are multiple listeners for the message
                message.htmlReportId = olAPI.htmlReportId;
                message.htmlReportUUID = olAPI.htmlReportUUID;
                window.parent.postMessage(JSON.stringify(message), '*');
            });
        }

        function delegateOnlineRequest(queryConfig, deferredId, deferred, respHandler) {
            olAPI.queryRunning = true;
            listenerQueue[deferredId] = deferred;

            // When optional callback function is given:
            if(typeof respHandler === 'function') {
                var interDeferred = Q.defer();
                listenerQueue[deferredId] = interDeferred;
                interDeferred.promise.then(function(resp) {
                    respHandler(resp, deferred);
                });
            }

            postMessage(queryConfig);
        }

        function onlineErrorResponse(code, message) {
            var customErrorObject = {};
            customErrorObject.success = false;
            customErrorObject.code = code;
            customErrorObject.message = message;
            return customErrorObject;
        }

        /**
         * Wrapper function for the legacy online queryRecord function
         */
        function queryRecord(object, fields, where, sort, limit) {
            var deferred = Q.defer();
            var deferredId = 'callback_' + (+new Date());
            var queryConfig = {
                command: 'queryObject',
                object: object,
                fields: fields,
                where: where,
                sort: sort,
                limit: limit,
                deferredId: deferredId
            };
            listenerQueue[deferredId] = deferred;
            postMessage(queryConfig);
            return deferred.promise;
        }

        olAPI.genericQueryErrorHandler = function (e) {
            var errors = e.error;
            var i = errors.length;
            while (i--) {
                errors[i] = {
                    message: errors[i].message,
                    error: errors[i].errorCode
                };
            }
            console.log(e);
        };

        olAPI.queryRecord = function (queryObject) {
            if(arguments.length > 1) {
                // Fallback method for legacy queryRecord
                return queryRecord.apply(olAPI, arguments);
            }

            var deferred = Q.defer();

            if (olAPI.queryRunning) {
                olAPI.queriesQueue.push({
                    config: queryObject,
                    deferred: deferred,
                    type: 'queryRecord_ol'
                });
            } else {
                var deferredId = 'callback_queued_' + (+new Date());
                var queryConfig = {
                    command: 'queryObject',
                    object: queryObject.object,
                    fields: queryObject.fields,
                    where: queryObject.where,
                    sort: queryObject.sort,
                    limit: queryObject.limit,
                    deferredId: deferredId
                };
                delegateOnlineRequest(queryConfig, deferredId, deferred);
            }

            return deferred.promise;
        };

        olAPI.querySalesData = function(queryObject) {
            var deferred = Q.defer();

            if(olAPI.queryRunning) {
                olAPI.queriesQueue.push({
                    config: queryObject,
                    deferred: deferred,
                    type: 'querySalesData_ol'
                });
            } else {
                var deferredId = 'callback_queued_' + (+new Date());
                var queryConfig = {
                    command: 'querySalesData',
                    object: queryObject.object,
                    fields: queryObject.fields,
                    where: queryObject.where,
                    sort: queryObject.sort,
                    limit: queryObject.limit,
                    deferredId: deferredId
                };
                delegateOnlineRequest(queryConfig, deferredId, deferred);
            }

            return deferred.promise;
        };

        olAPI.query = function (queryConfig) {
            var deferred = Q.defer();
            var deferredId = 'callback_' + Math.random().toString(36).substring(2); // (+new Date());
            queryConfig.deferredId = deferredId;
            listenerQueue[deferredId] = deferred;
            postMessage(queryConfig);

            return deferred.promise;
        };

        olAPI.getDataForCurrentObject = function (object, field) {
            var deferred = Q.defer();

            if(olAPI.queryRunning) {
                olAPI.queriesQueue.push({
                    object: object,
                    field: field,
                    deferred: deferred,
                    type: 'getDataForCurrentObject_ol'
                });
            } else {
                var deferredId = 'callback_queued_' + (+new Date());
                var newConfig = {
                    command: 'getDataForObjectV2',
                    object: object,
                    fields: [field],
                    deferredId: deferredId
                };
                delegateOnlineRequest(newConfig, deferredId, deferred);
            }

            return deferred.promise;
        };

        olAPI.getObjectLabels = function (objects) {
            var deferred = Q.defer();

            if(olAPI.queryRunning) {
                olAPI.queriesQueue.push({
                    config: objects,
                    deferred: deferred,
                    type: 'getObjectLabels_ol'
                });
            } else {
                var deferredId = 'callback_queued_' + (+new Date());
                var newConfig = {
                    command: 'getObjectLabels',
                    object: objects,
                    deferredId: deferredId
                };
                delegateOnlineRequest(newConfig, deferredId, deferred);
            }

            return deferred.promise;
        };

        olAPI.getFieldLabels = function (queryConfig) {
            var deferred = Q.defer();
            var object = queryConfig.object;
            var fields = queryConfig.fields;

            var respHandler = function(resp, deferred) {
                var labels = resp[object];
                var i = fields.length;
                var newLabels = [];
                while (i--) {
                    newLabels.unshift({
                        name: fields[i],
                        display: labels[fields[i]]
                    });
                }
                deferred.resolve(newLabels);
            };

            if(olAPI.queryRunning) {
                olAPI.queriesQueue.push({
                    config: queryConfig,
                    deferred: deferred,
                    type: 'getFieldLabels_ol'
                });
            } else {
                var deferredId = 'callback_queued_' + (+new Date());
                var newConfig = {
                    command: 'getFieldLabel',
                    object: object,
                    fields: fields,
                    deferredId: deferredId
                };
                delegateOnlineRequest(newConfig, deferredId, deferred, respHandler);
            }

            return deferred.promise;
        };

        olAPI.getTranslation = function (tokens, localeKey) {
            var deferred = Q.defer();
            var config = veevaUtil.copyObject(queries.translations);
            var whereSubClauses = [];
            var index = tokens.length;
            var cachedResponses = [];
            var cache = translationsCache;
            while (index--) {
                if (!cache[tokens[index].msgName + ':' + tokens[index].msgCategory]) {
                    whereSubClauses.push("(Name='" + tokens[index].msgName + "' AND Category_vod__c='" + tokens[index].msgCategory + "')");
                }
                else {
                    cachedResponses.push(cache[tokens[index].msgName + ':' + tokens[index].msgCategory]);
                }
            }
            config.where += "(" + whereSubClauses.join(" OR ") + ")" + " AND Language_vod__c='" + localeKey + "'";
            // if all the responses were in the cache, then this will be empty and we just return the cached responses.
            if (whereSubClauses.length) {
                olAPI
                    .queryRecord(config.object, config.fields, config.where)
                    .then(function (resp) {
                        var data = resp[config.object],
                            d = data.length;
                        deferred.resolve(data.concat(cachedResponses));
                        while (d--) {
                            if (!cache[data[d].Name.value + ':' + data[d].Category_vod__c.value]) {
                                cache[data[d].Name.value + ':' + data[d].Category_vod__c.value] = data[d];
                            }
                        }
                    });
            }
            else {
                deferred.resolve(cachedResponses);
            }
            return deferred.promise;
        };

        olAPI.getPicklistValueLabels = function (object, field) {
            var deferred = Q.defer();

            if(olAPI.queryRunning) {
                olAPI.queriesQueue.push({
                    object: object,
                    field: field,
                    deferred: deferred,
                    type: 'getPicklistValueLabels_ol'
                });
            } else {
                var deferredId = 'callback_queued_' + (+new Date());
                var newConfig = {
                    command: 'getPicklistValueLabels',
                    object: object,
                    field: field,
                    deferredId: deferredId
                };
                delegateOnlineRequest(newConfig, deferredId, deferred);
            }

            return deferred.promise;
        };

        olAPI.queryVDSRecord = function(configObject) {
            var deferred = Q.defer();

            if(typeof configObject === 'object') {
                var config = {
                    object: configObject.object,
                    fields: configObject.fields || [],
                    limit: configObject.limit || null,
                    sort: configObject.sort || [],
                    where: configObject.where || ""
                };
                var messageBody = {
                    command: 'queryVDSRecord',
                    configObject: config
                };

                return olAPI.doPostMessage(messageBody);
            } else {
                deferred.reject({
                    success: false,
                    message: 'queryVDSRecord request failed: ' + JSON.stringify(configObject)
                });
            }

            return deferred.promise;
        };

        function initiateAction(command, configObject) {
            var deferred = Q.defer();

            if(typeof configObject === 'object') {
                var messageBody = {
                    command: command,
                    configObject: configObject
                };

                return olAPI.doPostMessage(messageBody);
            } else {
                deferred.reject({
                    code: command === 'newRecord' ? 1400 : 1500,
                    success: false,
                    message: command + ' request failed: ' + JSON.stringify(configObject)
                });
            }

            return deferred.promise;
        }

        olAPI.newRecord = function(configObject) {
            return initiateAction('newRecord', configObject);
        };

        olAPI.viewRecord = function(configObject) {
            return initiateAction('viewRecord', configObject);
        };

        olAPI.smartLinking = function(configObject) {
            var deferred = Q.defer();

            if (olAPI.queryRunning) {
                olAPI.queriesQueue.push({
                    config: configObject,
                    deferred: deferred,
                    type: 'smartLinking_ol'
                });
            } else {
                var deferredId = 'callback_queued_' + (+new Date());
                var queryConfig = {
                    command: 'smartLinking',
                    configObject: configObject,
                    deferredId: deferredId
                };
                delegateOnlineRequest(queryConfig, deferredId, deferred);
            }

            return deferred.promise;
        };

        olAPI.getAvailableObjects = function() {
            var deferred = Q.defer();

            if (olAPI.queryRunning) {
                olAPI.queriesQueue.push({
                    deferred: deferred,
                    type: 'getAvailableObjects_ol'
                });
            } else {
                var deferredId = 'callback_queued_' + (+new Date());
                var queryConfig = {
                    command: 'getAvailableObjects',
                    deferredId: deferredId
                };

                delegateOnlineRequest(queryConfig, deferredId, deferred);
            }

            return deferred.promise;
        };

        olAPI.getObjectMetadata = function(queryObject) {
            var deferred = Q.defer();

            if(queryObject && queryObject.object) {
                if (olAPI.queryRunning) {
                    olAPI.queriesQueue.push({
                        config: queryObject,
                        deferred: deferred,
                        type: 'getObjectMetadata_ol'
                    });
                } else {
                    var deferredId = 'callback_queued_' + (+new Date());
                    var queryConfig = {
                        command: 'getObjectMetadata',
                        object: queryObject.object,
                        deferredId: deferredId
                    };

                    delegateOnlineRequest(queryConfig, deferredId, deferred);
                }
            } else if (queryObject === undefined || queryObject.object === undefined) {
                deferred.reject(onlineErrorResponse(errorCode.NO_PARAMETER, "getObjectMetadata called with no object: " + JSON.stringify(queryObject)));
            } else {
                deferred.reject(onlineErrorResponse(errorCode.UNSUPPORTED_OBJECT, "getObjectMetadata called with an unsupported object: " + JSON.stringify(queryObject.object)));
            }

            return deferred.promise;
        };

        olAPI.getRecordTypeLabels = function(objectName) {
            var deferred = Q.defer();

            if(objectName) {
                if (olAPI.queryRunning) {
                    olAPI.queriesQueue.push({
                        config: objectName,
                        deferred: deferred,
                        type: 'getRecordTypeLabels_ol'
                    });
                } else {
                    var deferredId = 'callback_queued_' + (+new Date());
                    var queryConfig = {
                        command: 'getRecordTypeLabels',
                        object: objectName,
                        deferredId: deferredId
                    };

                    delegateOnlineRequest(queryConfig, deferredId, deferred);
                }
            } else {
                deferred.reject(onlineErrorResponse(errorCode.NO_PARAMETER, "getRecordTypeLabels called with no parameter"));
            }

            return deferred.promise;
        };

        // Overriding ds.onlinePostMessage
        olAPI.onlinePostMessage = function(message) {
            postMessage(message);
        }

        addMessageListener(queryListener);

        window.addEventListener("load", function() {
            // Creates a ResizeObserver that listens to when the body size changes and sends the new iframe dimensions to the parent
            olAPI.resizeObserver = new ResizeObserver(function() {
                sendIFrameDimensionsToParentWindow();
            });

            // document.body is only defined once the window has loaded
            olAPI.resizeObserver.observe(document.body);
        });
    };
})(window.Q);

(function (Q) {
    'use strict';

    var DataService = function () {
        var ds = this;
        ds.queriesQueue = [];
        ds.queryRunning = false;
        ds.messageId = 0;

        var veevaUtil = new window.VeevaUtilities();
        var queries = {
            translations: {
                object: 'Message_vod__c',
                fields: ['Name', 'Category_vod__c', 'Language_vod__c', 'Text_vod__c'],
                where: ''
            }
        };
        const ISO_DATE_REGEX = /[0-9]{4}-[0-9]{2}-[0-9]{2}(T|\s)[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{1,3}Z/;
        const VALID_DATE_FORMAT_REGEX = /[0-9]{4}.[0-9]{2}.[0-9]{2}(.[0-9]{2})?(.[0-9]{2})?(.[0-9]{2})?(.[0-9]{1,3})?[zZ]?/;
        const MESSAGE_HANDLERS = (function() {
            if(window.webkit && window.webkit.messageHandlers && typeof window.webkit.messageHandlers === 'object') {
                return window.webkit.messageHandlers;
            } else {
                return null;
            }
        })();

        function genericQueryErrorHandler(deferred) {
            return function(error) {
                deferred.reject(error);
            };
        }

        function isISODateFormat(inputString) {
            return ISO_DATE_REGEX.test(inputString);
        }

        function isValidDateFormat(inputString) {
            return VALID_DATE_FORMAT_REGEX.test(inputString);
        }

        function normalizeTimeDigits(digitInString) {
            return digitInString ? parseInt(digitInString, 10) : 0;
        }

        function extractDateStringToNumbers(inputString) {
            var parts = inputString.match(/(\d+)/g);

            return {
                year: normalizeTimeDigits(parts[0]),
                month: normalizeTimeDigits(parts[1]) - 1,
                date: normalizeTimeDigits(parts[2]),
                hours: normalizeTimeDigits(parts[3]),
                minutes: normalizeTimeDigits(parts[4]),
                seconds: normalizeTimeDigits(parts[5]),
                ms: normalizeTimeDigits(parts[6])
            };
        }

        function parseDate(input) {
            var extractedDigits;

            if (isISODateFormat(input)) {
                return new Date(input);
            }else {
                extractedDigits = extractDateStringToNumbers(input);

                return new Date(
                    extractedDigits.year, extractedDigits.month, extractedDigits.date,
                    extractedDigits.hours, extractedDigits.minutes, extractedDigits.seconds,
                    extractedDigits.ms
                );
            }
        }
        
        function getCRMDate(dateString) {
            var newDate;

            if (isISODateFormat(dateString) || isValidDateFormat(dateString)) {
                newDate = parseDate(dateString);
            }

            if (!newDate) {
                console.warn('bad date: ', dateString, newDate);
            }

            return newDate;
        }

        function getResultSet(query) {
            for (var k in query) {
                if (query.hasOwnProperty(k) && k !== 'success' && k !== 'record_count' && k !== 'fieldLabels' && k !== 'object') {
                    var object = query.object;
                    var objectFieldsArr = query.metadata.data.fields;
                    var result = {
                        data: query[k],
                        object: object,
                        name: k,
                        fieldLabels: query.fieldLabels
                    };
                    var data = result.data;
                    var urlTrimProtocolRE = /^(http|https):\/\//i;
                    var urlTrimDubRE = /www\./i;
                    var fieldLabels = query.fieldLabels;

                    result.object.name = k;

                    for (var i = data.length; i--;) {
                        for (var d in data[i]) {
                            if (data[i].hasOwnProperty(d)) { // d is the key of the data point
                                var cur_field = null;
                                for (var field of objectFieldsArr) {
                                    // find matching field and check metadata for field type
                                    if (field.name === d) {
                                        cur_field = field;
                                        break;
                                    }
                                }
                                if (cur_field && (cur_field.dataType === 'date' || cur_field.dataType === 'datetime')) { // date field
                                    var tempDate = data[i][d];
                                    var realDate = getCRMDate(tempDate);
                                    if (realDate) {
                                        data[i].date = data[i][d] = {
                                            value: realDate,
                                            display: [realDate.getFullYear(), (realDate.getMonth() + 1), realDate.getDate()].join('-'),
                                            dataType: 'date'
                                        };
                                    } else {
                                        data[i].date = data[i][d] = {
                                            value: tempDate,
                                            display: tempDate,
                                            dataType: 'date'
                                        };
                                    }
                                } else if (cur_field && cur_field.dataType === 'url') { //url field
                                    var tempUrl = data[i][d];
                                    data[i][d] = {
                                        value: tempUrl,
                                        display: tempUrl && tempUrl.length ? ('<a href="' + tempUrl + '" target="_blank">' + tempUrl.replace(urlTrimProtocolRE, '').replace(urlTrimDubRE, '').slice(0, 12) + '\u2026</a>') : null,
                                        dataType: 'url'
                                    };
                                } else {
                                    if (data[i][d] && data[i][d].value) {
                                        var formattedData = {
                                            value: data[i][d].value,
                                            display: data[i][d].display,
                                            dataType: 'string'
                                        };

                                        data[i][d] = formattedData;
                                    }else {
                                        data[i][d] = {
                                            value: data[i][d],
                                            display: data[i][d],
                                            dataType: 'string'
                                        };
                                    }
                                }
                                data[i][d].label = getLabelFromLabels(d, fieldLabels);
                            }
                        }
                    }
                    return result;
                }
            }

            function getLabelFromLabels(name, labels) {
                var l = labels.length;
                while (l--) {
                    if (labels[l].name === name) {
                        return labels[l].display;
                    }
                }
            }
        }

        function runQueryHelper(queryConfig, deferred) {
            var picklistsAvailable = queryConfig.picklists && queryConfig.picklists.length;

            function finishQuery(results) {
                deferred.resolve(getResultSet(results));
                ds.checkQueryQueue();
            }

            function reportQueryError(e) {
                deferred.reject(e);
                ds.checkQueryQueue();
            }

            function getPicklists(resp) {
                var deferred = Q.defer();
                if (picklistsAvailable) {
                    var picklistPromises = [];
                    var queryObject = queryConfig.object;
                    queryConfig.picklists.forEach(function(picklist) {
                        var promise = 
                            ds.getPicklistValueLabels(queryObject, picklist).then(function (picklistResp) {
                                var currentPicklistResp = picklistResp[queryObject];
                                return currentPicklistResp;
                            });
                        picklistPromises.push(promise);
                    });
                
                    // Use Q.all to instead of nextPicklist(), so recursive for promise is unnecessary
                    Q.all(picklistPromises).then(function(result){
                        result.forEach(function(thisPicklistsResp){
                            // got the object containing picklist values for each picklist field
                            for (var pk in thisPicklistsResp) { // loop over each of the piclist value lists
                                    if (thisPicklistsResp.hasOwnProperty(pk)) {
                                        var picklistName = pk; // the picklist name is also the name of the field in the record
                                        var picklistValues = thisPicklistsResp[pk]; // this object has all the possible values for the picklist
                                        for (var records = resp[queryConfig.object], r = records.length; r--;) {
                                            var record = records[r];
                                            if (record[picklistName] && (picklistValues[record[picklistName].value] || picklistValues[record[picklistName]])) {
                                                if (record[picklistName].value) {
                                                    record[picklistName].display = picklistValues[record[picklistName].value];
                                                }
                                                else if (picklistValues[record[picklistName]]) {
                                                    var formattedRecord = {
                                                        value: record[picklistName],
                                                        display: picklistValues[record[picklistName]]
                                                    };

                                                    record[picklistName] = formattedRecord;
                                                }
                                            }
                                        }
                                    }
                                }
                        });
                        deferred.resolve();
                    }, function (e) {
                        console.warn('picklist error', e);
                    });
                }
                else {
                    deferred.resolve();
                }
                return deferred.promise;
            }

            // Get object label
            var objectLabelDeferred = Q.defer();
            ds.getObjectLabels([queryConfig.object]).then(function(resp) {
                objectLabelDeferred.resolve(resp);
            }, genericQueryErrorHandler(objectLabelDeferred));
            
            // Get Object metadata
            var objectMetadataDeferred = Q.defer();
            ds.getObjectMetadata({object: queryConfig.object}).then(function(resp) {
                objectMetadataDeferred.resolve(resp);
            }, genericQueryErrorHandler(objectMetadataDeferred));

            // Get field label
            var fieldLabelDeferred = Q.defer();
            ds.getFieldLabels(queryConfig).then(function(resp) {
                fieldLabelDeferred.resolve(resp);
            }, genericQueryErrorHandler(fieldLabelDeferred));

            // Query record
            var queryRecordDeferred = Q.defer();
            ds.queryRecord(queryConfig).then(function(resp) {
                queryRecordDeferred.resolve(resp);
            }, genericQueryErrorHandler(queryRecordDeferred));

            // When everything is done
            var allPromises = [objectLabelDeferred.promise, objectMetadataDeferred.promise, fieldLabelDeferred.promise, queryRecordDeferred.promise];
            Q.all(allPromises).then(function(allResp) {
                var objectLabelResp = allResp[0];
                var objectMetadataResp = allResp[1];
                var fieldLabelResp = allResp[2];
                var queryRecordResp = allResp[3];

                var runQueryResp = veevaUtil.copyObject(queryRecordResp);
                runQueryResp.object = objectLabelResp[queryConfig.object][0];
                runQueryResp.metadata = objectMetadataResp;
                runQueryResp.fieldLabels = fieldLabelResp;

                if(picklistsAvailable) {
                    getPicklists(runQueryResp).then(function() {
                        finishQuery(runQueryResp);
                    }, reportQueryError);
                } else {
                    finishQuery(runQueryResp);
                }
            }, reportQueryError);
        }

        function constructRequest(command, object, fields, where, sort, limit) {
            var request = [];
            if (command && object) {
                request.push('veeva:' + command + '(' + object + ')');
                if (fields) {
                    var fieldLabel = 'fields';
                    if(command === 'getPicklistValueLabels') {
                        fieldLabel = 'field';
                    } else if(command === 'getDataForObjectV2') {
                        fieldLabel = 'fieldName';
                    }
                    request.push(fieldLabel + '(' + fields + ')');
                }
                if (where) {
                    request.push('where(where ' + where + ')');
                }
                if (sort) {
                    request.push('sort(' + JSON.stringify(sort) + ')');
                }
                if (limit) {
                    request.push('limit(' + limit + ')');
                }

            } else if(command && arguments.length === 1) {
                // Case where no parameter is needed
                request.push('veeva:' + command + '()');

            } else {
                console.error('constructRequest: invalid arguments', command, object, fields);
            }
            return request.join(',');
        }

        function sendLinkingRequest(command, configObject) {
            var deferred = Q.defer();
            var req = constructLinkingRequest(command, configObject);

            query(req).then(function(resp) {
                deferred.resolve(resp);
            }, function(error) {
                deferred.reject(error);
            });

            return deferred.promise;
        }

        function constructLinkingRequest(command, configObject) {
            var request = [];
            if(typeof command === 'string' && command.length && typeof configObject === 'object') {
                request.push('veeva:' + command + '(' + configObject.object + ')');
                request.push('fields(' + JSON.stringify(configObject.fields) + ')');
            }
            return request.join(',');
        }

        function constructSmartLinkingRequest(configObject) {
            return "veeva:smartLinking(" + JSON.stringify(configObject) + ")";
        }

        function validateRequestObjectWithErrorMessage(request) {
            //validate that an object is passed in
            if (typeof request !== "object") {
                return "Invalid request.  Must be an object.";
            }

            //validate url
            //url must be a string
            //value is required
            if (typeof request.url !== "string" || request.url.length <= 0) {
                return "Invalid URL value. Must be a non-empty String";
            }

            //validate method
            //method must be one of the valid HTTP verbs
            //optional
            if (request.method && !validateMethod(request.method)) {
                return "Invalid method value. Must be a valid HTTP method.";
            }

            //validate headers
            //must be an object whose values are all strings
            //optional
            if (request.headers && !validateHeaders(request.headers)) {
                return "Invalid headers value. Must be an object with values of type String";
            }

            //validate timeout
            //must be a number
            //optional
            if (request.timeout && (typeof request.timeout !== "number" || request.timeout <= 0)) {
                return "Invalid timeout value. Must be a positive number";
            }

            //validate expect
            //must be a "text" or "blob"
            //optional
            if (request.expect && !validateExpect(request.expect)) {
                return "Invalid expect value.  Must be a String of value 'text' or 'blob'";
            }

            return "Valid";
        }

        var methods = ['POST', 'GET', 'HEAD', 'PUT', 'DELETE', 'CONNECT', 'OPTIONS', 'TRACE', 'PATCH'];

        function validateMethod(method) {
            return typeof method === "string" && !!~methods.indexOf(method.toUpperCase());
        }

        function validateHeaders(headers) {
            if (typeof headers === "object") {
                var keys = Object.keys(headers);
                for (var i = 0; i < keys.length; i++) {
                    var key = keys[i];
                    var headerValue = headers[key];
                    if (typeof headerValue !== "string") {
                        return false;
                    }
                }
            }
            return true;
        }

        function validateExpect(expect) {
            return typeof expect === "string" && (expect.toLowerCase() === "text" || expect.toLowerCase() === "blob");
        }

        function addRequestObjectDefaultsAndFormat(request) {
            if (!request.method) {
                request.method = "GET";
            } else {
                request.method = request.method.toUpperCase();
            }
            if (!request.headers) {
                request.headers = {};
            }
            if (!request.timeout) {
                request.timeout = 30;
            }
            if (!request.body) {
                request.body = "";
            } else if (typeof request.body === 'object') {
                request.body = JSON.stringify(request.body);
            }
            if (!request.expect) {
                request.expect = "text";
            } else {
                request.expect = request.expect.toLowerCase();
            }
        }

        /**
         * Register a callback function at the global scope
         * @param deferred the deferred object to resolve when this callback function is invoked.
         * @returns {string} the name of this callback function
         */
        function registerCallbackFunction(deferred) {
            var uniqueCallbackName = 'com_veeva_queryRecordReturn' + (+new Date());
            window[uniqueCallbackName] = function (resp) {
                var result = resp;
                var win8ParseError;

                if (typeof result === 'string') {
                    try {
                        result = JSON.parse(result);
                    }
                    catch (e) {
                        win8ParseError = veevaUtil.isWin8();
                        console.warn('query result returned as non-parseable string', e, result);
                    }
                }
                if(typeof win8ParseError === 'boolean' && win8ParseError){
                    result = formatResult(result);
                }
                if ((typeof result === 'object' && result && result.success) || result === null) {
                    deferred.resolve(wrapResult('query', formatResult(result)));
                }
                else {
                    for (var a = arguments.length; a--;) {
                        console.error('query failure arguments', arguments[a]);
                    }
                    deferred.reject(JSON.stringify(result));
                }
            };
            return uniqueCallbackName;
        }

        function query(request) {
            var deferred = Q.defer();
            var callbackFunctionName = registerCallbackFunction(deferred);
            request = request + ',' + callbackFunctionName + '(result)';
            runAPIRequest(request);
            return deferred.promise;
        }

        function formatResult(result) {
            if (veevaUtil.isWin8()) {
                if (typeof result === 'string') {
                    result = eval('(' + result + ')');
                }
            }
            return result;
        }

        function wrapResult(apiName, result) {
            result = formatResult(result);
            if (typeof result === 'object' && result && !result.success) {
                result.message = apiName + ': ' + result.message;
            }
            return result;
        }

        function runAPIRequest(request) {
            if (veevaUtil.isWin8()) {
                window.external.notify(request);
            } else if(isVeevaMessagingEnabled()) {
                window.webkit.messageHandlers.veeva.postMessage({"message": request});
            } else {
                //Remove the veeva: prefix, encode the remaining request, and add veeva: back.
                //This works with a basic replace because we only run ONE request here.
                request = request.replace(/^veeva:/, '');
                request = encodeURIComponent(request);
                request = 'veeva:' + request;

                document.location = request;
            }
        }

        function isVeevaMessagingEnabled() {
            return Boolean(window.webkit.messageHandlers.veeva);
        }

        function postMessageRequest(messageId, messageBody) {
            let deferred = Q.defer();

            if(MESSAGE_HANDLERS && MESSAGE_HANDLERS[messageId]) {
                ds._MESSAGE_REGISTRY[messageId] = {
                    resolve: deferred.resolve,
                    reject: deferred.reject
                };
                if(messageBody && typeof messageBody === 'object') {
                    messageBody.messageId = messageId;
                } else {
                    messageBody = { messageId: messageId };
                }

                MESSAGE_HANDLERS[messageId].postMessage(JSON.stringify(messageBody), '*');
            } else {
                deferred.reject(messageId + ' handler not found');
            }

            return deferred.promise;
        }

        /**
         * Legacy queryRecord function.
         * Although this function still works, it should only be called within the library.
         */
        function queryRecord(object, fields, where, sort, limit) {
            var req = constructRequest('queryObject', object, fields, where, sort, limit);
            return query(req);
        }

        var errorCode = {
            GENERIC: 0,
            NO_PARAMETER: 2,
            INVALID_PARAM: 5,
            UNSUPPORTED_OBJECT: 10
        };

        function createErrorResponse(code, message) {
            var customErrorObject = {};
            customErrorObject.success = false;
            customErrorObject.code = code;
            customErrorObject.message = message;
            return customErrorObject;
        }
        
        function getVeevaMessagesHelper(deferred, config, languageFilter, defaultResponseArr) {  
            config.where += " AND (Language_vod__c='" + languageFilter + "'";
            if (languageFilter === "en_US") {
                config.where += ")";
            } else {
                config.where += " OR Language_vod__c='en_US')";
            }
            
            ds.runQuery(config)
                    .then(function (resp) {
                        let queryData = resp.data;
                        deferred.resolve(combineQueryResults(queryData, defaultResponseArr, languageFilter));
                    });
        }
        
        function buildDefaultResponse(msgName, msgCategory, defaultStr) {
            return { 
                Category_vod__c: { value: msgCategory, display: msgCategory, dataType: 'string', label: '' },
                Language_vod__c: { value: '', display: '', label: '', dataType: 'string' },
                Name: { value: msgName, display: msgName, dataType: 'string', label: '' },
                Text: { value: defaultStr, display: defaultStr, dataType: 'string', label: '' },
            };
        }
        
        function getLanguageFilter(languageLocaleKey) {
            let deferred = Q.defer();
            
            if (languageLocaleKey) {
                deferred.resolve(languageLocaleKey);
            } else {
                ds.getDataForCurrentObject('User', 'LanguageLocaleKey').then(function (resp) {
                    deferred.resolve(resp.User.LanguageLocaleKey);
                });
            }
            
            return deferred.promise;
        }
        
        function combineQueryResults(queryData, defaultResponseArr, languageFilter) {
            let allData = [];
            //add all messages with given language filter
            for (let message of queryData) {
                if (message.Language_vod__c.value === languageFilter) {
                    allData.push(message);
                }
            }
            
            //add backup messages if needed
            if (languageFilter !== "en_US") {
                for (let message of queryData) {
                    if (!dataContainsMessage(message, allData)) {
                        allData.push(message);
                    }
                }
            }
            
            //add defaults if needed
            for (let defaultMessage of defaultResponseArr) {
                if (!dataContainsMessage(defaultMessage, allData)) {
                    allData.push(defaultMessage);
                }
            }
            
            return allData;
        }
        
        function dataContainsMessage(message, allData) {
            for (let dataMessage of allData) {
                if (dataMessage.Name.value === message.Name.value && dataMessage.Category_vod__c.value === message.Category_vod__c.value) {
                    return true;
                }
            }
            return false;
        }
        
        /**
         * Public facing functions
         */

        ds.queryRecord = function (queryObject) {
            // Fallback method for legacy queryRecord
            if(arguments.length > 1) {
                return queryRecord.apply(ds, arguments);
            }

            var deferred = Q.defer();

            if (ds.queryRunning) {
                ds.queriesQueue.push({
                    config: queryObject,
                    deferred: deferred,
                    type: 'queryRecord'
                });
            } else {
                var req = constructRequest('queryObject', queryObject.object, queryObject.fields, queryObject.where, queryObject.sort, queryObject.limit);
                ds.delegateQueryRequest(req, deferred);
            }

            return deferred.promise;
        };

        ds.runQuery = function (queryConfig) {
            var deferred = Q.defer();

            if (ds.queryRunning) {
                ds.queriesQueue.push({
                    config: queryConfig,
                    deferred: deferred,
                    type: typeof queryConfig === 'string' ? 'apiRequest' : 'runQuery'
                });
            } else {
                runQueryHelper(queryConfig, deferred);
            }
            return deferred.promise;
        };

        ds.querySalesData = function(queryObject) {
            var deferred = Q.defer();

            if(ds.queryRunning) {
                ds.queriesQueue.push({
                    config: queryObject,
                    deferred: deferred,
                    type: 'querySalesData'
                });
            } else {
                // we will use queryObject method from the platform to handle sales data for now
                var req = constructRequest('queryObject', queryObject.object, queryObject.fields, queryObject.where, queryObject.sort, queryObject.limit);
                ds.delegateQueryRequest(req, deferred);
            }

            return deferred.promise;
        };

        ds.joinQueries = function (q1, q2, keyForID, fieldsLabelsToExclude, primaryObjectName) {
            var primaryQuery, secondaryQuery, joinTo, joinFrom;
            var q1Copy = veevaUtil.deepCopy(q1);
            var q2Copy = veevaUtil.deepCopy(q2);
            var joins = {};
            // get the primary query and secondary query
            if (q1Copy.object.name === primaryObjectName) {
                primaryQuery = q1Copy;
                secondaryQuery = q2Copy;
            }
            else {
                primaryQuery = q2Copy;
                secondaryQuery = q1Copy;
            }
            // figure out which has the key on which to join the queries
            for (var k in q1Copy.data[0]) {
                if (k === keyForID) {
                    joinTo = q1Copy;
                    joinFrom = q2Copy;
                    break;
                }
            }
            if (!joinTo) {
                joinTo = q2Copy;
                joinFrom = q1Copy;
            }
            // Set up a dictonary with references to each result on which to join
            for (var d = joinFrom.data.length; d--;) {
                joins[joinFrom.data[d].ID.value] = joinFrom.data[d];
            }
            // rename the fields on the secondary result set to reflect their unique relationship to the original results
            for (d = secondaryQuery.data.length; d--;) {
                for (k in secondaryQuery.data[d]) {
                    if (secondaryQuery.data[d].hasOwnProperty(k) && k !== 'date') {
                        var propertyToMove = secondaryQuery.data[d][k];
                        secondaryQuery.data[d][secondaryQuery.object.name + '.' + k] = propertyToMove;
                        delete(secondaryQuery.data[d][k]);
                    }
                }
            }
            // merge each record with its respective matching record
            // figure out if we need to append the object name to the keyForID in the case where the joinTo === secondaryQuery
            if (joinTo.object.name === secondaryQuery.object.name) {
                keyForID = joinTo.object.name + '.' + keyForID;
            }
            for (d = joinTo.data.length; d--;) {
                // merge joinTo[d] with joins[joinTo[d][keyForID]]
                veevaUtil.mergeObjects(joinTo.data[d], joins[joinTo.data[d][keyForID].value]); // does the key for ID include the object name or not. it will if joinTo === secondaryQuery;
            }

            // begin label renaming and combining
            var deleteExcludedLabels = function (labels) {
                    for (var k in fieldsLabelsToExclude) {
                        for (var n = labels.length; n--;) {
                            if (labels[n].name === k) {
                                labels.splice(n, 1);
                            }
                        }
                    }
                    return labels;
                },
                primaryLabels = deleteExcludedLabels(primaryQuery.fieldLabels),
                secondaryLabels = deleteExcludedLabels(secondaryQuery.fieldLabels);
            // rename labels in q2Copy
            for (var l = secondaryLabels.length, label; l--;) {
                label = secondaryLabels[l];
                label.name = secondaryQuery.object.name + '.' + label.name;
            }
            joinTo.fieldLabels = primaryLabels.concat(secondaryLabels);
            joinTo.object = primaryQuery.object;
            joinTo.name = primaryQuery.name;
            return joinTo;
        };

        ds.getInStatement = function (ids) {
            var online = veevaUtil.isOnline();
            var statmentEnd = online ? ')' : '}';
            var statementBegin = online ? '(' : '{';
            return statementBegin + '\'' + ids.join('\',\'') + '\'' + statmentEnd;
        };

        /*
         Returns the value of a field for a specific record related to the current object
         */
        ds.getDataForCurrentObject = function (object, field) {
            var deferred = Q.defer();

            if(ds.queryRunning) {
                ds.queriesQueue.push({
                    object: object,
                    field: field,
                    deferred: deferred,
                    type: 'getDataForCurrentObject'
                });
            } else {
                var req = constructRequest('getDataForObjectV2', object, field);
                ds.delegateQueryRequest(req, deferred);
            }

            return deferred.promise;
        };

        ds.getObjectLabels = function (objects) {
            var deferred = Q.defer();

            if(ds.queryRunning) {
                ds.queriesQueue.push({
                    config: objects,
                    deferred: deferred,
                    type: 'getObjectLabels'
                });
            } else {
                var req = constructRequest('getObjectLabels', JSON.stringify(objects));
                ds.delegateQueryRequest(req, deferred);
            }

            return deferred.promise;
        };

        ds.getFieldLabels = function (queryConfig) {
            var deferred = Q.defer();
            var object = queryConfig.object;
            var fields = queryConfig.fields;

            var respHandler = function(resp, deferred) {
                var i = fields.length;
                var labels = resp[object];
                var newLabels = [];
                while (i--) {
                    newLabels.unshift({
                        name: fields[i],
                        display: labels[fields[i]]
                    });
                }
                deferred.resolve(newLabels);
            };

            if(ds.queryRunning) {
                ds.queriesQueue.push({
                    config: queryConfig,
                    deferred: deferred,
                    type: 'getFieldLabels'
                });
            } else {
                var req = constructRequest('getFieldLabel', object, JSON.stringify(fields));
                ds.delegateQueryRequest(req, deferred, respHandler);
            }

            return deferred.promise;
        };

        /*
         Returns the translated label for each of the picklist values of the specified field

         object - API Name of the object
         field - API Name of the picklist field
         */
        ds.getPicklistValueLabels = function (object, field) {
            var deferred = Q.defer();

            if(ds.queryRunning) {
                ds.queriesQueue.push({
                    object: object,
                    field: field,
                    deferred: deferred,
                    type: 'getPicklistValueLabels'
                });
            } else {
                var req = constructRequest('getPicklistValueLabels', object, field);
                ds.delegateQueryRequest(req, deferred);
            }

            return deferred.promise;
        };

        ds.getVeevaMessagesWithDefault = function (tokens, languageLocaleKey) {
            let deferred = Q.defer();
            let config = veevaUtil.copyObject(queries.translations);
            let whereSubClauses = [];
            let index = tokens.length;
            let isActiveFilter = '';
            let defaultResponseArr = [];


            while (index--) {
                whereSubClauses.push("(Name='" + tokens[index].msgName + "' AND Category_vod__c='" + tokens[index].msgCategory + "')");
                if (tokens[index].default) {
                    defaultResponseArr.push(buildDefaultResponse(tokens[index].msgName, tokens[index].msgCategory, tokens[index].default));
                }
            }

            if (veevaUtil.isWin8() && veevaUtil.isWindowsMobile()) {
                isActiveFilter = "Active_vod__c='true'";
            } else if (veevaUtil.isOnline()) {
                isActiveFilter = "Active_vod__c=true";
            } else {
                isActiveFilter = "Active_vod__c=1";
            }

            config.where += "(" + whereSubClauses.join(" OR ") + ")" + " AND " + isActiveFilter;
            
            getLanguageFilter(languageLocaleKey).then(function (languageFilter) {
                if (whereSubClauses.length) {
                    getVeevaMessagesHelper(deferred, config, languageFilter, defaultResponseArr);
                }
            });

            return deferred.promise;
        };

        ds.delegateQueryRequest = function(request, deferred, respHandler) {
            ds.queryRunning = true;
            query(request).then(function(resp) {
                /**
                 * If the optional callback function is given,
                 * let the callback function resolve the promise instead
                 */
                if(typeof respHandler === 'function') {
                    respHandler(resp, deferred);
                } else {
                    deferred.resolve(resp);
                }
                ds.queryRunning = false;
                ds.checkQueryQueue();
            }, function(error) {
                deferred.reject(error);
                ds.queryRunning = false;
                ds.checkQueryQueue();
            });
        };

        ds.checkQueryQueue = function() {
            if (ds.queriesQueue.length && !ds.queryRunning) {
                var next = ds.queriesQueue.shift();
                if (next.type === 'apiRequest') {
                    ds.queryRunning = true;
                    query(next.config).then(function (resp) {
                        next.deferred.resolve(resp);
                        ds.queryRunning = false;
                        ds.checkQueryQueue();
                    });
                } else if (next.type === 'runQuery') {
                    runQueryHelper(next.config, next.deferred);
                } else if(next.type === 'queryRecord' || next.type === 'queryRecord_ol') {
                    ds.queryRecord(next.config).then(function(resp) {
                        next.deferred.resolve(resp);
                    }, genericQueryErrorHandler(next.deferred));
                } else if(next.type === 'querySalesData' || next.type === 'querySalesData_ol') {
                    ds.querySalesData(next.config).then(function(resp) {
                        next.deferred.resolve(resp);
                    }, genericQueryErrorHandler(next.deferred));
                } else if(next.type === 'getAvailableObjects' || next.type === 'getAvailableObjects_ol') {
                    ds.getAvailableObjects().then(function(resp) {
                        next.deferred.resolve(resp);
                    }, genericQueryErrorHandler(next.deferred));
                } else if(next.type === 'getObjectMetadata' || next.type === 'getObjectMetadata_ol') {
                    ds.getObjectMetadata(next.config).then(function(resp) {
                        next.deferred.resolve(resp);
                    }, genericQueryErrorHandler(next.deferred));
                } else if(next.type === 'getRecordTypeLabels' || next.type === 'getRecordTypeLabels_ol') {
                    ds.getRecordTypeLabels(next.config).then(function(resp) {
                        next.deferred.resolve(resp);
                    }, genericQueryErrorHandler(next.deferred));
                } else if (next.type === 'getFieldLabels' || next.type === 'getFieldLabels_ol') {
                    ds.getFieldLabels(next.config).then(function(resp) {
                        next.deferred.resolve(resp);
                    }, genericQueryErrorHandler(next.deferred));
                } else if (next.type === 'getObjectLabels' || next.type === 'getObjectLabels_ol') {
                    ds.getObjectLabels(next.config).then(function(resp) {
                        next.deferred.resolve(resp);
                    }, genericQueryErrorHandler(next.deferred));
                } else if (next.type === 'getPicklistValueLabels' || next.type === 'getPicklistValueLabels_ol') {
                    ds.getPicklistValueLabels(next.object, next.field).then(function (resp) {
                        next.deferred.resolve(resp);
                    }, genericQueryErrorHandler(next.deferred));
                } else if (next.type === 'getDataForCurrentObject' || next.type === 'getDataForCurrentObject_ol') {
                    ds.getDataForCurrentObject(next.object, next.field).then(function(resp) {
                        next.deferred.resolve(resp);
                    }, genericQueryErrorHandler(next.deferred));
                } else if (next.type === 'smartLinking' || next.type === 'smartLinking_ol') {
                    ds.smartLinking(next.config).then(function(resp) {
                        next.deferred.resolve(resp);
                    }, genericQueryErrorHandler(next.deferred));
                } else if (next.type === 'queryVDSRecord') {
                    ds.queryVDSRecord(next.config).then(function(resp) {
                        next.deferred.resolve(resp);
                    }, genericQueryErrorHandler(next.deferred));
                } else {
                    if(typeof ds.customQueryQueueHandler === 'function') {
                        ds.customQueryQueueHandler(next);
                    } else {
                        console.error('Unknown queue event');
                    }
                }
            }
        };

        ds.newRecord = function(configObject) {
            return sendLinkingRequest('newRecord', configObject);
        };

        ds.viewRecord = function(configObject) {
            return sendLinkingRequest('viewRecord', configObject);
        };

        ds._MESSAGE_REGISTRY = {};

        ds.doPostMessage = function (messageBody) {
            var deferred = Q.defer();
            var messageId = ++ds.messageId;

            ds._MESSAGE_REGISTRY[messageId] = {
                resolve: deferred.resolve,
                reject: deferred.reject
            };
            if(messageBody && typeof messageBody === 'object') {
                messageBody.messageId = messageId;
            } else {
                messageBody = { messageId: messageId };
            }

            if (veevaUtil.isWin8() && veevaUtil.isWindowsMobile()) {
                window.external.notify(JSON.stringify(messageBody));
            } else if (veevaUtil.isOnline()) {
                ds.onlinePostMessage(messageBody);
            } else {
                window.webkit.messageHandlers.myInsightsAPI.postMessage(JSON.stringify(messageBody));
            }

            return deferred.promise;
        };

        function parseArrayForMultiPicklist(config) {
            var configClone = JSON.parse(JSON.stringify(config));
            var fields = configClone.fields;
            var keys = Object.keys(fields);
            keys.forEach(function(key) {
                if (Array.isArray(fields[key])) {
                    fields[key] = fields[key].join(';');
                }
            });

            return configClone;
        }

        ds.createRecord = function(config) {
            var deferred = Q.defer();

            if (config && config.object) {
                config.command = 'createRecord';
                config.fields = config.fields ? config.fields : {};

                return ds.doPostMessage(parseArrayForMultiPicklist(config));
            } else {
                deferred.reject(createErrorResponse(errorCode.GENERIC, 'createRecord called with invalid configuration: ' + JSON.stringify(config)));
            }

            return deferred.promise;
        };

        ds.updateRecord = function(config) {
            var deferred = Q.defer();

            if (config && config.object) {
                config.command = 'updateRecord';
                config.fields = config.fields ? config.fields : {};

                return ds.doPostMessage(parseArrayForMultiPicklist(config));
            } else {
                deferred.reject(createErrorResponse(errorCode.GENERIC, 'updateRecord called with invalid configuration: ' + JSON.stringify(config)));
            }

            return deferred.promise;
        };

        ds.request = function (requestObject) {
            var deferred = Q.defer();

            var errorMessage = validateRequestObjectWithErrorMessage(requestObject)
            if (errorMessage !== "Valid") {
                deferred.reject(createErrorResponse(errorCode.INVALID_PARAM, errorMessage));
            } else {
                addRequestObjectDefaultsAndFormat(requestObject);
                requestObject.command = "request";

                return ds.doPostMessage(requestObject);
            }

            return deferred.promise;
        };

        ds.getSFDCSessionID = function() {
            return ds.doPostMessage({command: 'getSFDCSessionID'});
        };

        ds.smartLinking = function(configObject) {
            var deferred = Q.defer();

            if(ds.queryRunning) {
                ds.queriesQueue.push({
                    config: configObject,
                    deferred: deferred,
                    type: 'smartLinking'
                });
            } else {
                var req = constructSmartLinkingRequest(configObject);
                ds.delegateQueryRequest(req, deferred);
            }

            return deferred.promise;
        };

        ds.executeSuggestionAction = function(suggestionId, actionType) {
            return ds.smartLinking({
                object: "Suggestion_vod__c",
                action: actionType ? actionType : 'execute',
                options: {
                    record: {
                        Id: suggestionId
                    }
                }
            });
        };

        ds.launchMediaForAccount = function(accountId, presentationId, keyMessageMediaFileName) {
            var linkingOptions = {
                prefill: {
                    Call2_vod__c: {
                        Account_vod__c: accountId ? accountId : ''
                    }
                }
            };

            // presentation id and key message file name are optional, but need to pass together
            if(presentationId && keyMessageMediaFileName) {
                linkingOptions.record = {
                    Presentation_Id_vod__c: presentationId,
                    Key_Message_vod__c: {
                        Media_File_Name_vod__c: keyMessageMediaFileName
                    }
                };
            }

            return ds.smartLinking({
                object: "Clm_Presentation_vod__c",
                action: "launch",
                options: linkingOptions
            });
        };

        ds.getAvailableObjects = function() {
            var deferred = Q.defer();

            if(ds.queryRunning) {
                ds.queriesQueue.push({
                    config: {},
                    deferred: deferred,
                    type: 'getAvailableObjects'
                });
            } else {
                var req = constructRequest('getAvailableObjects');
                ds.delegateQueryRequest(req, deferred);
            }

            return deferred.promise;
        };

        ds.getObjectMetadata = function(queryObject) {
            var deferred = Q.defer();

            if(queryObject && queryObject.object) {
                if (ds.queryRunning) {
                    ds.queriesQueue.push({
                        config: queryObject,
                        deferred: deferred,
                        type: 'getObjectMetadata'
                    });
                } else {
                    var req = constructRequest('getObjectMetadata', queryObject.object);
                    ds.delegateQueryRequest(req, deferred);
                }
            } else if (queryObject === undefined || queryObject.object === undefined) {
                deferred.reject(createErrorResponse(errorCode.NO_PARAMETER, "getObjectMetadata called with no object: " + JSON.stringify(queryObject)));
            } else {
                deferred.reject(createErrorResponse(errorCode.UNSUPPORTED_OBJECT, "getObjectMetadata called with an unsupported object: " + JSON.stringify(queryObject.object)));
            }

            return deferred.promise;
        };

        ds.getRecordTypeLabels = function(objectName) {
            var deferred = Q.defer();

            if(ds.queryRunning) {
                ds.queriesQueue.push({
                    config: objectName,
                    deferred: deferred,
                    type: 'getRecordTypeLabels'
                });
            } else {
                var req = constructRequest('getRecordTypeLabels', objectName);
                ds.delegateQueryRequest(req, deferred);
            }

            return deferred.promise;
        };

        ds.getCurrentPosition = function() {
            return ds.doPostMessage({command: 'getCurrentPosition'});
        };

        ds.getFeedbackData = function() {
            return ds.doPostMessage({command: 'getFeedbackData'});
        };
        
        ds.sendToMySchedule = function(config) {
            let deferred = Q.defer();
            
            let messageConfig = {
                command: 'sendToMySchedule',
                accountIds: [],
            };
            
            let invalidArgumentError = createErrorResponse(
                1601,
                "sendToMySchedule called with invalid argument:\n" +
                    "   " + JSON.stringify(config) + "\n" +
                    "The argument must have the following type:\n" +
                    "   { accountIds: string[] }\n" +
                    "Here is an example: \n" +
                    '   sendToMySchedule({ accountIds: ["Account_ID_1", "Account_ID_2"]})\n' +
                    "Read <https://developer.veevacrm.com/api/MyInsightsLibrary/> to learn more."
            );
            
            if (config && Array.isArray(config.accountIds)) {
                // filter out non-string objects in array
                if (config.accountIds.some(id => typeof id !== 'string')) {
                    deferred.reject(invalidArgumentError);
                } else {
                    messageConfig.accountIds = config.accountIds;
                    return ds.doPostMessage(messageConfig);   
                }
            } else {
                deferred.reject(invalidArgumentError);
            }
            
            return deferred.promise;
        };

        /**
         * Global listener for message callback event
         * This mechanism is not yet supported by Online.
         */
        if(!veevaUtil.isOnline()) {
            window.addEventListener('message', function(event) {
                if(event) {
                    let data = {};
                    if(typeof event === 'object') {
                        if (veevaUtil.isWin8() && typeof event.data === 'string') {
                            data = JSON.parse(event.data);
                        } else {
                            data = event.data;
                        }
                    } else if(typeof event === 'string') {
                        try {
                            data = (JSON.parse(event)).data;
                        } catch(error) {
                            console.error('Fail to parse response: ' + error);
                        }
                    }

                    const messageId = data.messageId;
                    if(ds._MESSAGE_REGISTRY[messageId]) {
                        const promise = ds._MESSAGE_REGISTRY[messageId];
                        if(!!data.success) {
                            promise.resolve(data);
                        } else {
                            promise.reject(data);
                        }
                        delete ds._MESSAGE_REGISTRY[messageId];
                    } else {
                        console.warn('Promise not found in registry');
                    }
                }
            });
        }

        /*
        * CDW Query Record
        *
        * */
        ds.queryVDSRecord = function(configObject) {
            var deferred = Q.defer();
            var request;

            if (ds.queryRunning) {
                ds.queriesQueue.push(
                    {
                        config: configObject,
                        deferred: deferred,
                        type: 'queryVDSRecord'
                    }
                );
            } else {
                request = constructRequest('queryVDSRecord', configObject.object, configObject.fields, configObject.where, configObject.sort, configObject.limit);
                ds.delegateQueryRequest(request, deferred);
            }

            return deferred.promise;
        };

        // We will do nothing when this method is called window.OnlineAPI is responsible for calling postMessage
        ds.onlinePostMessage = function() {}

        // switch in here for the different overrides?
        if (veevaUtil.isOnline()) {
            // This call will override different methods that are part of DataService
            // since we are passing ds as "this" to OnlineAPI
            window.OnlineAPI.call(ds);
        }
    };

    window.ds = new DataService();
})(window.Q);
