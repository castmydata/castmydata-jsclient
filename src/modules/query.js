(function() {
    "use strict";

    var utils = require('../utils');

    function Query(endpoint, filter) {
        this.models = [];
        this._filter = filter;
        this._endpoint = endpoint;
        this._events = {};
        var self = this;
        this._endpoint.on('subscribed', function() {
            self.run();
            self.emit('subscribed');
        });
        this._endpoint.on('unsubscribed', function() {
            self.run();
            self.emit('unsubscribed');
        });
        this._endpoint.on('sync', function(models) {
            self.run();
            self.emit('sync', models);
        });
        this._endpoint.on('post', function(model) {
            self.run();
            self.emit('post', model);
        });
        this._endpoint.on('put', function(model) {
            self.run();
            self.emit('put', model);
        });
        this._endpoint.on('delete', function(model) {
            self.run();
            self.emit('put', model);
        });
        this._endpoint.on('clear', function() {
            self.run();
            self.emit('clear');
        });
        this._endpoint.on('merge', function() {
            self.run();
            self.emit('merge');
        });
        this.run.call(self);
    }

    Query.prototype = Object.create(utils.Eev.prototype);

    Query.prototype.run = function() {
        this.models = utils.sift(this._filter, this._endpoint.models);
        return this;
    };

    Query.prototype.put = function(record) {
        this.models.forEach(function(model) {
            model.put(record);
        });
        return this;
    };

    Query.prototype.delete = function() {
        this.models.forEach(function(model) {
            model.delete();
        });
        return this;
    };

    module.exports = Query;

})(this);