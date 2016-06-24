(function() {

    angular.module('NgCastMyData', [])
        .value('CastMyDataServer', '')
        .factory('NgCastMyDataEndpoint', ['CastMyDataServer', '$timeout', function(CastMyDataServer, $timeout) {
        
            var each = function(obj, callback) {
                for (var key in obj) {
                    if (obj.hasOwnProperty(key)) {
                        callback(obj[key], key);
                    }
                }
            };

            return function(path) {

                var NgCastMyData = new CastMyData.Endpoint(CastMyDataServer, path);

                NgCastMyData.__proto__.bindToScope = function($scope, param) {
                    var that = this;
                    var datas = $scope[param] = [];

                    this.on('records', function(models) {
                        datas.splice(0, datas.length);
                        models.forEach(function(data) {
                            datas.push(data);
                        });
                    });

                    this.on('post', function(data) {
                        datas.push(data);
                    });

                    this.on('put', function(data) {
                        var model = datas.filter(function(model) {
                            return model.id == data.id;
                        }).pop();
                        if (model) {
                            each(data, function(val, key) {
                                model[key] = val;
                            });
                        }
                    });

                    this.on('delete', function(data) {
                        var model = datas.filter(function(model) {
                            return model.id == data.id;
                        }).pop();
                        var index = datas.indexOf(model);
                        if (model && index > -1) {
                            datas.splice(index, 1);
                        }
                    });

                    this.on('records post put delete broadcast', function() {
                        $timeout(function(){
                            $scope.$digest();
                        });
                    });
                    if(this.models.length > 0) {
                        angular.extend(datas, this.models);
                        $timeout(function(){
                            $scope.$digest();
                        });
                    }

                    return this;
                }

                return NgCastMyData;
            };
        }]);
}).call(this);