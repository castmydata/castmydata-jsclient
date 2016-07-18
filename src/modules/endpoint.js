(function() {
    "use strict";

    var utils = require('../utils');
    var storage = require('../storage');
    var Model = require('../modules/Model');
    var Query = require('../modules/Query');
    var io = (typeof window !== 'undefined') ? window.io : null;

    function Endpoint(CastMyDataServer, path, options) {

        options = options || {};

        var self = this;
        if ((/[^a-zA-Z0-9-_\.]/g).test(path)) {
            throw 'Invalid characters in path. Allowed characters are a-z, A-Z, 0-9, -, _, .';
        }

        if(!io) {
            io = require('socket.io-client');
        }
        var socket = io(CastMyDataServer + '?path=' + path, {
            multiplex: false
        });

        this._options = {
            storage: 'jjlc'
        };
        utils.deepExtend(this._options, options);

        this._socket = socket;
        this._Model = this._options.model || Model;
        this.models = [];
        this._events = {};
        this._filter = {};
        this._subscribed = false;
        this._storage = new storage('cmd_' + path, {
            driver: this._options.storage
        });

        // create the socket
        socket.path = path;

        // Add handlers
        function syncHandler(data, callback) {
            if (!self._subscribed) return;
            data.forEach(function(_model) {
                postHandler(_model);
            });
            self.emit('sync', self.models);
            if (callback) callback();
        }

        function postHandler(_model, callback) {
            if (!self._subscribed) return;
            var model = self.find(_model.id);
            if (model) {
                model.merge(_model);
                model.emit('merge', model);
                self.emit('merge', model);
            } else {
                // create model
                model = new self._Model(self, _model);

                // add to models
                self.models.push(model);

                // save into storage
                self.commit();
            }
            // emit events
            model.emit('post', model);
            self.emit('post', model);
            if (callback) callback(model);
        }

        function putHandler(record, callback) {
            if (!self._subscribed) return;
            var model = self.find(record.id);
            if (model) {
                // update model properties
                utils.deepExtend(model, record);

                // save into storage
                self.commit();

                // emit events
                model.emit('merge', model);
                self.emit('merge', model);
            } else {
                model = new self._Model(self, record);
                self.models.push(model);
                self.commit();
            }
            model.emit('put');
            if (callback) callback(model);
        }

        function deleteHandler(record, callback) {
            if (!self._subscribed) return;
            var model = self.find(record.id);
            if (model) {
                // update properties

                for (var key in model) {
                    if (model.hasOwnProperty(key) && [
                        'id',
                        'meta',
                        '$$hashKey',
                        '_endpoint',
                        '_events'
                    ].indexOf(key) == -1) {
                        delete model[key];
                    }
                }

                // extend response meta
                utils.deepExtend(model.meta, record.meta);

                // save into storage
                self.commit();

                // emit events
                model.emit('merge', model);
                self.emit('merge', model);
                if (callback) callback(model);
            }
        }

        function clearHandler(callback) {
            callback = callback || function() {};
            self._storage.clear(function(err) {
                if (err) return utils.handleError(err);
                self.models.splice(0, self.models.length);
                self.emit('clear');
            });
        }

        function listenHandler(channel, callback) {
            self.emit('listen', channel);
            if (callback) callback(channel);
        }

        function unlistenHandler(channel, callback) {
            self.emit('unlisten', channel);
            if (callback) callback(channel);
        }

        function broadcastHandler(data, callback) {
            self.emit('broadcast', data);
            self.emit('broadcast:' + data.channel, data.payload);
            if (callback) callback(data);
        }

        function reconnectHandler() {
            if (self._subscribed) {
                self.subscribe(self._options);
            }
        }

        function serverErrorHandler(error) {
            console.error(error);
        }

        // handle events from other clients
        socket.on('sync', syncHandler);
        socket.on('post', postHandler);
        socket.on('put', putHandler);
        socket.on('delete', deleteHandler);
        socket.on('clear', clearHandler);
        socket.on('broadcast', broadcastHandler);
        socket.on('reconnect', reconnectHandler);
        socket.on('cmderror', serverErrorHandler);

        // handle receipts
        socket.on('sync', function(records) {
            syncHandler(records, function(model) {
                self.emit('receipt:sync');
            });
        });
        socket.on('receipt:post', function(record) {
            postHandler(record, function(model) {
                model.emit('receipt:post', model);
            });
        });
        socket.on('receipt:put', function(data) {
            putHandler(data, function(model) {
                model.emit('receipt:put', model);
            });
        });
        socket.on('receipt:delete', function(record) {
            deleteHandler(record, function(model) {
                model.emit('receipt:delete', model);
            });
        });
        socket.on('receipt:clear', function() {
            clearHandler(function() {
                self.emit('receipt:clear');
            });
        });
        socket.on('receipt:listen', function(channel) {
            listenHandler(channel, function(channel) {
                self.emit('receipt:listen:' + channel, channel);
            });
        });
        socket.on('receipt:unlisten', function(channel) {
            unlistenHandler(channel, function(channel) {
                self.emit('receipt:unlisten:' + channel, channel);
            });
        });
        socket.on('receipt:broadcast', function(data) {
            broadcastHandler(data, function(data) {
                self.emit('receipt:broadcast', data);
            });
        });
    }

    Endpoint.prototype = Object.create(utils.Eev.prototype);

    Endpoint.prototype.load = function(callback) {
        callback = callback || function() {};
        var self = this;
        this._storage.get(function(err, datas) {
            var models = datas.map(function(_model) {
                return new self._Model(self, _model);
            });
            if (self._filter) {
                models = utils.sift(self._filter, models);
            }
            self.models.splice(0, self.models.length);
            self.emit('load', self.models);
            callback();
        });
    };

    Endpoint.prototype.commit = function(callback) {
        var self = this;
        callback = callback || function(){};
        var models = this.models.map(function(model) {
            return model.get();
        });
        this._storage.set(models, function(err){
            if(err) return utils.handleError(err);
            self.emit('commit');
        });
    };

    Endpoint.prototype.subscribe = function(options, callback) {
        if (typeof options == 'function') {
            callback = options;
            options = {};
        }
        var self = this;

        function sub() {
            self._options = options || {};
            self._filter = self._options.filter;
            self._socket.emit('subscribe', self._options);
            self.emit('subscribed');
            self._subscribed = true;
            self.sync(callback);
        }
        if (this._subscribed) {
            this.unsubscribe(sub);
        } else {
            sub();
        }
        return this;
    };

    Endpoint.prototype.unsubscribe = function(callback) {
        if (callback) this._socket.once('unsubscribe', callback);
        this.models.splice(0, this.models.length);
        this._socket.emit('unsubscribe');
        this.emit('unsubscribed');
        this._subscribed = false;
        return this;
    };

    Endpoint.prototype.sync = function(callback) {
        this.load();
        var unsynced = this.models.filter(function(model) {
            return !model.meta.synced;
        }).map(function(model) {
            return model.get();
        });
        if (callback) this.once('receipt:sync', callback);
        this._socket.emit('sync', unsynced);
        return this;
    };

    Endpoint.prototype.post =
    Endpoint.prototype.create =
        function(record, callback) {
            var model = new this._Model(this, record);
            if (callback) model.once('receipt:post', callback);
            model.post();
            return this;
    };

    Endpoint.prototype.put = function(id, record, callback) {
        var model = this.find(id);
        if (model) {
            if (callback) model.once('receipt:put', callback);
            model.put(record);
        }
        return this;
    };

    Endpoint.prototype.delete = function(id, callback) {
        var model = this.find(id);
        if (model) {
            if (callback) model.once('receipt:delete', callback);
            model.delete();
        }
        return this;
    };

    Endpoint.prototype.clear = function(callback) {
        if (callback) this._socket.once('receipt:clear', callback);
        this._socket.emit('clear');
        return this;
    };

    Endpoint.prototype.listen = function(channel, callback) {
        if (callback) this.once('receipt:listen:' + channel, callback);
        this._socket.emit('listen', channel);
        return this;
    };

    Endpoint.prototype.unlisten = function(channel, callback) {
        if (callback) this.once('receipt:unlisten:' + channel, callback);
        this._socket.emit('unlisten', channel);
        return this;
    };

    Endpoint.prototype.broadcast = function(channel, payload, callback) {
        if (callback) this.once('receipt:broadcast', callback);
        this._socket.emit('broadcast', {
            channel: channel,
            payload: payload
        });
        return this;
    };

    Endpoint.prototype.close = function(callback) {
        if (callback) this._socket.once('close', callback);
        this._socket.close('close');
        return this;
    };

    Endpoint.prototype.find = function(id) {
        return this.models.filter(function(model) {
            return model.id == id;
        }).pop();
    };

    Endpoint.prototype.where = function(filter) {
        return new Query(this, filter);
    };

    module.exports = Endpoint;

})(this);