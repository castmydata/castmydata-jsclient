// jshint quotmark:single, bitwise:false, forin:false
// globals io:true define:true

(function() {
    'use strict';
  
    angular.module('NgCastMyData', [])
        .value('CastMyDataServer', '')
        .factory('NgCastMyDataEndpoint', ['CastMyDataServer', '$timeout',
            function(CastMyDataServer, $timeout) {
                var endpoints = {};
                CastMyData.Model.prototype.bindToScope = function($scope, param) {
                    $scope[param] = this;
                    this.on('sync post put delete merge', function() {
                        $timeout(function() {
                            $scope.$digest();
                        });
                    });
                    return this;
                };

                CastMyData.Endpoint.prototype.bindToScope = function($scope, param) {
                    $scope[param] = this.models;
                    this.on('subscribed unsubscribed sync post put delete clear merge broadcast', function() {
                        $timeout(function() {
                            $scope.$digest();
                        });
                    });
                    if (this.models.length > 0) {
                        $timeout(function() {
                            $scope.$digest();
                        });
                    }
                    return this;
                };

                CastMyData.Query.prototype.bindToScope = function($scope, param) {
                    $scope[param] = this.models;
                    this.on('subscribed unsubscribed sync post put delete clear merge', function() {
                        $timeout(function() {
                            $scope.$digest();
                        });
                    });
                    if (this.models.length > 0) {
                        $timeout(function() {
                            $scope.$digest();
                        });
                    }
                    return this;
                };

                return function(path, options) {
                    if (!endpoints.path) {
                        options = options || {};
                        return new CastMyData.Endpoint(CastMyDataServer, path, options);
                    }
                    return endpoints.path;
                };
            }
        ]);
}).call(this);