(function (global, factory) {
    if(typeof exports === 'object' && typeof module !== 'undefined') {
        factory(exports);
    } else if (typeof define === 'function' && define.amd) {
        define(['exports'], factory);
    } else {
        factory((global.CastMyData = global.CastMyData || {}));
    }
}(this, function (exports) { 'use strict';

    // https://github.com/chrisdavies/eev
    var Eev = (function() {
        var id = 0;

        // A relatively generic LinkedList impl
        function LinkedList(linkConstructor) {
            this.head = new RunnableLink();
            this.tail = new RunnableLink(this.head);
            this.head.next = this.tail;
            this.linkConstructor = linkConstructor;
            this.reg = {};
        }

        LinkedList.prototype = {
            insert: function(data) {
                var link = new RunnableLink(this.tail.prev, this.tail, data);
                link.next.prev = link.prev.next = link;
                return link;
            },

            remove: function(link) {
                link.prev.next = link.next;
                link.next.prev = link.prev;
            }
        };

        // A link in the linked list which allows
        // for efficient execution of the callbacks
        function RunnableLink(prev, next, fn) {
            this.prev = prev;
            this.next = next;
            this.fn = fn || noop;
        }

        RunnableLink.prototype.run = function(data) {
            this.fn(data);
            this.next && this.next.run(data);
        };

        function noop() {}

        function Eev() {
            this._events = {};
        }

        Eev.prototype = {
            on: function(names, fn) {
                var me = this;
                names.split(/\W+/g).forEach(function(name) {
                    var list = me._events[name] || (me._events[name] = new LinkedList());
                    var eev = fn._eev || (fn._eev = (++id));

                    list.reg[eev] || (list.reg[eev] = list.insert(fn));
                });
                return this;
            },

            off: function(names, fn) {
                var me = this;
                names.split(/\W+/g).forEach(function(name) {
                    var list = me._events[name];
                    var link = list.reg[fn._eev];

                    list.reg[fn._eev] = undefined;

                    list && link && list.remove(link);
                });
                return this;
            },

            emit: function(name, data) {
                var evt = this._events[name];
                evt && evt.head.run(data);
                return this;
            }
        };

        return Eev;
    }());

    var each = function(obj, callback) {
        for (var key in obj) {
            if (obj.hasOwnProperty(key)) {
                callback(obj[key], key);
            }
        }
    };

    var Model = function(point, params) {
        var params = params || {};
        var that = this;

        each(params, function(val, key) {
            that[key] = val;
        });

        this._events = {};
        this._endpoint = point;
    }

    Model.prototype = Object.create(Eev.prototype);

    Model.prototype.delete = function() {
        this._endpoint.delete(this.id);
    },
    Model.prototype.put = function(params) {
        var params = params || {};
        var that = this;

        each(params, function(val, key) {
            that[key] = val;
        });
        this._endpoint.put(this.id, params);
    }

    var Endpoint = function(CastMyDataServer, path) {
        var socketioClient = ((typeof io !== 'undefined') ? io : require('socket.io-client'));
        var socket = this._socket = socketioClient(CastMyDataServer, {
            multiplex: false
        });
        var models = this.models = [];
        var that = this;

        this._events = {};
        socket.path = path;

        socket.on('records', function(data) {
            models.splice(0, models.length);
            var datas = data.forEach(function(model) {
                model = new Model(that, model);
                model.emit('post', model);
                models.push(model);
            });
            that.emit('records', models);
        });

        socket.on('post', function(data) {
            var model = new Model(that, data.payload);
            models.push(model);
            that.emit('post', model);
        });

        socket.on('put', function(data) {
            var model = models.filter(function(model) {
                return model.id == data.id;
            }).pop();
            if (model) {
                each(data.payload, function(val, key) {
                    model[key] = val;
                });
                model.emit('put', data.payload);
                that.emit('put', model, data.payload);
            }
        });

        socket.on('delete', function(data) {
            var model = models.filter(function(model) {
                return model.id == data.id;
            }).pop();
            var index = models.indexOf(model);
            if (model) {
                models.splice(index, 1);
                model.emit('delete');
                that.emit('delete', model);
            }
        });

        socket.on('broadcast', function(data){
            that.emit('broadcast', data.payload);
        });
    };

    Endpoint.prototype = Object.create(Eev.prototype);

    Endpoint.prototype.subscribe = function(options) {
        var options = options || {};
        this._socket.options = options;
        this._socket.emit('join', {
            path: this._socket.path,
            options: options
        });
        return this;
    }

    Endpoint.prototype.unsubscribe = function() {
        this._socket.emit('leave', {
            path: this._socket.path
        });
        return this;
    }

    Endpoint.prototype.all = function(record) {
        this._socket.emit('all', this._socket.path);
        return this;
    }

    Endpoint.prototype.find = function(id) {
        return this.models.filter(function(model){
            return model.id == id;
        }).pop();
    }

    Endpoint.prototype.post = function(record) {
        this._socket.emit('post', {
            path: this._socket.path,
            payload: record
        });
        return this;
    }

    Endpoint.prototype.put = function(id, record) {
        this._socket.emit('put', {
            path: this._socket.path,
            payload: record,
            id: id
        });
        return this;
    }

    Endpoint.prototype.delete = function(id) {
        this._socket.emit('delete', {
            path: this._socket.path,
            id: id
        });
        return this;
    }

    Endpoint.prototype.broadcast = function(payload) {
        this._socket.emit('broadcast', {
            path: this._socket.path,
            payload: payload
        });
        return this;
    }

    Endpoint.prototype.close = function() {
        this._socket.close();
        return this;
    }

    exports.Model = Model;
    exports.Endpoint = Endpoint;
}));