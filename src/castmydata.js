(function(global, factory) {
    if (typeof exports === 'object' && typeof module !== 'undefined') {
        factory(exports);
    } else if (typeof define === 'function' && define.amd) {
        define(['exports'], factory);
    } else {
        factory((global.CastMyData = global.CastMyData || {}));
    }
}(this, function(exports) {

    var utils = {};
    var localStorage;

    if (typeof exports === 'object' && typeof module !== 'undefined') {
        var LocalStorage = require('node-localstorage').LocalStorage;
        localStorage = new LocalStorage('./scratch');
    } 

    // https://github.com/k-yak/JJLC/blob/master/scripts/jjlc.dev.js
    (function(root) {
        "use strict";
        var regex = /\"[a-zA-Z0-9]*\":/g,
            separator = '£',
            seed = 0xABCD,
            dicts = {};
        function _sortedByValue(obj) {
            var tuples = [],
                newObj = {},
                key;

            for (key in obj) {
                tuples.push([key, obj[key]]);
            }
            tuples.sort(function(a, b) {
                return b[1] - a[1];
            });
            for (key in tuples) {
                newObj[tuples[key][0]] = tuples[key][1];
            }
            return newObj;
        }
        function _incChar(s) {
            var c = s[s.length - 1],
                p = s.substring(0, s.length - 1),
                nextId;

            if (typeof c === 'undefined') {
                nextId = 'a';
            } else if (c === 'z') {
                nextId = 'A';
            } else if (c === 'Z') {
                nextId = 'a';
                if (p !== '') {
                    p = _incChar(p);
                } else {
                    p = 'a';
                }
            } else {
                nextId = String.fromCharCode(c.charCodeAt(0) + 1);
            }
            c = nextId;
            return p + c;
        }
        function _createDict(s) {
            var dict = {},
                curId = '',
                m = s.match(regex),
                key,
                sbv;

            for (key in m) {
                if (m[key].length > (curId.length + 2)) {
                    if (typeof dict[m[key]] !== 'undefined') {
                        dict[m[key]] += 1;
                    } else {
                        dict[m[key]] = 0;
                    }
                }
            }
            sbv = _sortedByValue(dict);
            for (key in sbv) {
                curId = _incChar(curId);
                sbv[key] = separator + curId + separator;
            }
            return sbv;
        }
        function _compress(v, dict) {
            var id,
                re;
            for (id in dict) {
                re = new RegExp(id, 'g');
                v = v.replace(re, dict[id]);
            }
            return v;
        }
        function _decompress(v, dict) {
            var id,
                re;
            for (id in dict) {
                re = new RegExp(dict[id], 'g');
                v = v.replace(re, id);
            }
            return v;
        }
        function JJLC() {
            this.setItem = function(key, str, ns) {
                var compressed,
                    sObject,
                    dict;

                if (typeof ns === 'undefined' || ns !== 'no-beautify') {
                    sObject = JSON.parse(str);
                    str = JSON.stringify(sObject);
                }
                dict = _createDict(str);
                compressed = _compress(str, dict);

                if (typeof ns !== 'undefined' && ns === 'local-dict') {
                    dicts[key] = dict;
                } else {
                    localStorage.setItem(key, compressed);
                }

                if (typeof dicts[key] === 'undefined') {
                    localStorage.setItem('d_' + key, JSON.stringify(dict));
                }

                return compressed;
            }
            this.getItem = function(key) {
                var compressed,
                    dict;

                compressed = localStorage.getItem(key);

                if (typeof dicts[key] === 'undefined') {
                    dict = JSON.parse(localStorage.getItem('d_' + key));
                } else {
                    dict = dicts[key];
                }
                return _decompress(compressed, dict);
            }
            this.getDict = function(key) {
                var compressed,
                    dict;

                if (typeof dicts[key] === 'undefined') {
                    dict = JSON.parse(localStorage.getItem('d_' + key));
                } else {
                    dict = dicts[key];
                }

                return dict;
            }
            this.setDict = function(key, dic, ns) {
                var compressed,
                    h,
                    dict;

                if (typeof ns === 'undefined') {
                    localStorage.setItem('d_' + key, dic);
                } else {
                    dicts[key] = dic;
                }
            }
        }
        root.JJLC = new JJLC();
    }(utils));
    utils.localStorage = utils.JJLC;
    // utils.localStorage = window.localStorage;

    // https://github.com/makeable/uuid-v4.js
    (function(scope) {
        var dec2hex = [];
        for (var i = 0; i <= 15; i++) {
            dec2hex[i] = i.toString(16);
        }
        var uuid = {
            v4: function() {
                var uuid = '';
                for (var i = 1; i <= 36; i++) {
                    if (i === 9 || i === 14 || i === 19 || i === 24) {
                        uuid += '-';
                    } else if (i === 15) {
                        uuid += 4;
                    } else if (i === 20) {
                        uuid += dec2hex[(Math.random() * 4 | 0 + 8)];
                    } else {
                        uuid += dec2hex[(Math.random() * 15 | 0)];
                    }
                }
                return uuid;
            }
        };
        scope.uuid = uuid;
    })(utils);

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

    // http://andrewdupont.net/2009/08/28/deep-extending-objects-in-javascript/
    Object.deepExtend = function(destination, source) {
        for (var property in source) {
            if (source[property] && source[property].constructor &&
                source[property].constructor === Object) {
                destination[property] = destination[property] || {};
                arguments.callee(destination[property], source[property]);
            } else {
                destination[property] = source[property];
            }
        }
        return destination;
    }

    var each = function(obj, callback) {
        for (var key in obj) {
            if (obj.hasOwnProperty(key)) {
                callback(obj[key], key);
            }
        }
    };


    /**
     * Model Start
     */

    var Model = function(point, params) {
        var that = this;
        params = params || {};
        this.id = params.id || utils.uuid.v4();
        this.attributes = params.attributes || {};
        this.meta = params.meta || {};
        this._events = {};
        this._endpoint = point;
    }

    Model.prototype = Object.create(Eev.prototype);

    Model.prototype.get = function() {
        return JSON.parse(JSON.stringify({
            id: this.id,
            attributes: this.attributes,
            meta: this.meta
        }));
    }

    Model.prototype.post = function(params) {
        // update properties
        params.meta = {
            synced: false,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            deletedAt: null
        };
        Object.deepExtend(this, params);

        // add to endpoint models
        this._endpoint.models.push(this);

        // save into storage
        this._endpoint.commit();

        // emit events
        this.emit('post', this);
        this._endpoint.emit('post', this);

        // emit socket
        this._endpoint._socket.emit('post', this.get());
    }

    Model.prototype.put = function(params) {
        // update properties
        Object.deepExtend(this, params);
        this.meta.synced = false;
        this.meta.updatedAt = Date.now();

        // save into storage
        this._endpoint.commit();

        // emit events
        this.emit('put', this, params);
        this._endpoint.emit('put', this, params);

        // emit socket
        this._endpoint._socket.emit('put', this.get());
    }

    Model.prototype.delete = function() {
        // update properties
        this.attributes = {};
        this.meta.deletedAt = Date.now();
        this.meta.synced = false;

        // save into storage
        this._endpoint.commit();

        // emit events
        this.emit('delete', this);
        this._endpoint.emit('delete', this);

        // emit socket
        this._endpoint._socket.emit('delete', this.id);
    }

    Model.prototype.merge = function(_model) {
        if (
            (JSON.stringify(this.attributes) != JSON.stringify(_model.attributes)) ||
            (JSON.stringify(this.meta) != JSON.stringify(_model.meta))
        ) {
            // update properties
            Object.deepExtend(this, _model);

            // save into storage
            this._endpoint.commit();

            // emit events
            this.emit('merge', this);
            this._endpoint.emit('merge', this);

            return true;
        }
        return false;
    }

    /**
     * Endpoint start
     */

    var Endpoint = function(CastMyDataServer, path, options) {

        this._options = {};
        Object.deepExtend(this._options, (options || {}))

        var that = this;
        var key = 'cmd_' + path;

        if ((/[^a-zA-Z0-9-_\.]/g).test(path)) {
            throw 'Invalid characters in path. Allowed characters are a-z, A-Z, 0-9, -, _, .';
        }

        this.models = [];
        this._socket = [];
        this._events = {};
        this._subscribed = false;

        // create the socket
        var socket = this._socket = ((typeof io !== 'undefined') ? io : require('socket.io-client'))
            (CastMyDataServer + '?path=' + path, {
                multiplex: false
            });
        socket.path = path;

        // Add incoming listeners

        function postHandler(_model) {
            if (!that._subscribed) return;
            var model = that.find(_model.id);
            if (model) {
                model.merge(_model);
            } else {
                // create model
                model = new Model(that, _model);

                // add to models
                that.models.push(model);

                // save into storage
                that.commit();

                // emit events
                model.emit('post', model);
                that.emit('post', model);
            }
        }

        socket.on('post', postHandler);

        socket.on('sync', function(data) {
            if (!that._subscribed) return;
            var datas = data.forEach(function(_model) {
                postHandler(_model);
            });
            that.emit('sync', that.models);
        });

        socket.on('put', function(record) {
            if (!that._subscribed) return;
            var model = that.find(record.id);
            if (model) {
                // update model properties
                Object.deepExtend(model, record);

                // save into storage
                that.commit();

                // emit events
                model.emit('merge', model);
                that.emit('merge', model);
            } else {
                postHandler(record);
            }
        });

        socket.on('delete', function(record) {
            if (!that._subscribed) return;
            var model = that.find(record.id);
            if (model) {
                // update properties
                Object.deepExtend(model, record);

                // save into storage
                that.commit();

                // emit events
                model.emit('merge', model);
                that.emit('merge', model);
            }
            var index = that.models.indexOf(model);
            if (index > -1) {
                // save into storage
                that.commit();

                // emit events
                model.emit('delete', model);
                that.emit('delete', model);
            }
        });

        socket.on('clear', function() {
            utils.localStorage.setItem(key, '[]');
            that.models.splice(0, that.models.length);
            that.emit('clear');
        });

        socket.on('broadcast', function(data) {
            that.emit('broadcast', data.payload);
        });

        socket.on('reconnect', function() {
            console.log('reconnected');
            if (that._subscribed) {
                that.subscribe(that._options);
            }
        });

        // load data
        var datas = utils.localStorage.getItem(key);
        if (datas) {
            this.models = JSON.parse(datas).map(function(_model) {
                return new Model(that, _model);
            });
            this.emit('load', this.models);
        }

        // save data
        this.commit = function() {
            var models = this.models.map(function(model) {
                return model.get();
            });
            utils.localStorage.setItem(key, JSON.stringify(models));
        }
    };

    Endpoint.prototype = Object.create(Eev.prototype);

    Endpoint.prototype.subscribe = function(options) {
        this._options = options || {};
        this._socket.emit('subscribe', this._options);
        this.emit('subscribed');
        this._subscribed = true;
        this.sync();
        return this;
    }

    Endpoint.prototype.unsubscribe = function() {
        this._socket.emit('unsubscribe');
        this.emit('unsubscribed');
        this._subscribed = false;
        return this;
    }

    Endpoint.prototype.sync = function(record) {
        var unsynced = this.models.filter(function(model) {
            return !model.meta.synced;
        }).map(function(model) {
            return model.get();
        });
        this._socket.emit('sync', unsynced);
        return this;
    }

    Endpoint.prototype.find = function(id) {
        return this.models.filter(function(model) {
            return model.id == id;
        }).pop();
    }

    Endpoint.prototype.post = function(record) {
        var model = new Model(this);
        model.post(record);
        return this;
    }

    Endpoint.prototype.create = function(attributes) {
        this.post({
            attributes: attributes
        });
        return this;
    }

    Endpoint.prototype.put = function(record) {
        var model = this.find(record.id);
        if (model) {
            model.put(record);
        }
        return this;
    }

    Endpoint.prototype.delete = function(id) {
        var model = this.find(id);
        if (model) {
            model.delete();
        }
        return this;
    }

    Endpoint.prototype.clear = function() {
        this._socket.emit('clear');
    }

    Endpoint.prototype.broadcast = function(payload) {
        this._socket.emit('broadcast', {
            payload: payload
        });
        return this;
    }

    Endpoint.prototype.close = function() {
        this._socket.close('close');
        return this;
    }

    /**
     * Endpoint start
     */

    var Query = function(endpoint, filter) {
        this.models = [];
        this._filter = filter;
        this._endpoint = endpoint;
        this._events = {};
        var that = this;
        this._endpoint.on('subscribed', function() {
            that.run.call(that);
            that.emit('subscribed');
        });
        this._endpoint.on('unsubscribed', function() {
            that.run.call(that);
            that.emit('unsubscribed');
        });
        this._endpoint.on('sync', function() {
            that.run.call(that);
            var args = Array.prototype.slice.call(arguments);
            args.unshift('sync');
            that.emit.apply(that, args);
        });
        this._endpoint.on('post', function() {
            that.run.call(that);
            var args = Array.prototype.slice.call(arguments);
            args.unshift('post');
            that.emit.apply(that, args);
        });
        this._endpoint.on('put', function() {
            that.run.call(that);
            var args = Array.prototype.slice.call(arguments);
            args.unshift('put');
            that.emit.apply(that, args);
        });
        this._endpoint.on('delete', function() {
            that.run.call(that);
            var args = Array.prototype.slice.call(arguments);
            args.unshift('delete');
            that.emit.apply(that, args);
        });
        this._endpoint.on('clear', function() {
            that.run.call(that);
            that.emit('clear');
        });
        this._endpoint.on('merge', function() {
            that.run.call(that);
            that.emit('merge');
        });
        this.run.call(that);
    }

    Query.prototype = Object.create(Eev.prototype);

    Query.prototype.run = function() {
        this.models = this._endpoint.models.filter(this._filter);
        return this;
    }

    Query.prototype.put = function(record) {
        this.models.forEach(function(model) {
            model.put(record);
        });
        return this;
    }

    Query.prototype.delete = function() {
        this.models.forEach(function(model) {
            model.delete();
        });
        return this;
    }

    exports.Model = Model;
    exports.Query = Query;
    exports.Endpoint = Endpoint;
    exports.Utils = utils;
}));