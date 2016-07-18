(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.CastMyData = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){

},{}],2:[function(require,module,exports){
(function(){
    "use strict";

    var utils = require('../utils');

    function getRecord(model) {
        var record = {};
        for(var key in model) {
            if (model.hasOwnProperty(key) && ['$$hashKey', '_endpoint', '_events'].indexOf(key) == -1) {
                record[key] = model[key];
            }
        }
        return record;
    }

    function Model(point, params) {
        params = params || {};
        utils.deepExtend(this, params);
        this.id = this.id || utils.uuid();
        this.meta = this.meta || {};
        this._events = {};
        this._endpoint = point;
    }

    Model.prototype = Object.create(utils.Eev.prototype);

    Model.prototype.get = function() {
        return getRecord(this);
    };

    Model.prototype.post = function(callback) {

        var self = this;

        // register callback
        if (callback) this._endpoint._socket.once('receipt:post', callback);

        // update properties
        var params = {
            meta: {
                synced: false,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                deletedAt: null
            }
        };
        utils.deepExtend(this, params);

        // add to endpoint models
        this._endpoint.models.push(this);

        // save into storage
        this._endpoint.commit();

        // emit events
        this.emit('post', this);
        this._endpoint.emit('post', this);

        // handle acl deny
        this._endpoint._socket.once('denied:post:' + this.id, function(){
            // deregister callback
            self._endpoint._socket.off('receipt:post', callback);
            var index = self._endpoint.models.indexOf(self);
            if(index > -1) {
                self._endpoint.models.splice(index, 1);
                self._endpoint.commit();
                self._endpoint.emit('post', self.id);
            }
        });

        // emit socket
        this._endpoint._socket.emit('post', this.get());
        return this;
    };

    Model.prototype.put = function(params, callback) {

        var self = this;

        // register callback
        if (callback) this._endpoint._socket.once('receipt:put', callback);

        // update properties
        utils.deepExtend(this, params);
        this.meta.synced = false;
        this.meta.updatedAt = Date.now();

        // save into storage
        this._endpoint.commit();

        // emit events
        this.emit('put', this, params);
        this._endpoint.emit('put', this, params);

        // handle acl deny
        this._endpoint._socket.once('denied:put:' + this.id, function(data){
            // deregister callback
            self._endpoint._socket.off('receipt:put', callback);
            utils.deepExtend(self, data);
            self._endpoint.commit();
            self.emit('put');
            self._endpoint.emit('put');
        });

        // emit socket
        this._endpoint._socket.emit('put', this.get());
        return this;
    };

    Model.prototype.delete = function(callback) {

        var self = this;

        // register callback
        if (callback) this._endpoint._socket.once('receipt:delete', callback);

        // clear properties
        for(var key in this) {
            if (this.hasOwnProperty(key) && ['meta', 'id', '_endpoint', '_events'].indexOf(key) == -1) {
                delete this[key];
            }
        }
        this.meta.deletedAt = Date.now();
        this.meta.synced = false;

        // save into storage
        this._endpoint.commit();

        // emit events
        this.emit('delete', this);
        this._endpoint.emit('delete', this);

        // handle acl deny
        this._endpoint._socket.once('denied:delete:' + this.id, function(data){
            // deregister callback
            self._endpoint._socket.off('receipt:delete', callback);
            utils.deepExtend(self, data);
            self._endpoint.commit();
            self.emit('delete');
            self._endpoint.emit('delete');
        });

        // emit socket
        this._endpoint._socket.emit('delete', this.id);
        return this;
    };

    Model.prototype.merge = function(_model) {
        if (JSON.stringify(getRecord(this)) != JSON.stringify(_model)) {
            // update properties
            utils.deepExtend(this, _model);

            // save into storage
            this._endpoint.commit();

            // emit events
            this.emit('merge', this);
            this._endpoint.emit('merge', this);
        }
        return this;
    };

    module.exports = Model;

})(this);

},{"../utils":13}],3:[function(require,module,exports){
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
},{"../utils":13}],4:[function(require,module,exports){
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
},{"../modules/Model":2,"../modules/Query":3,"../storage":7,"../utils":13,"socket.io-client":1}],5:[function(require,module,exports){
arguments[4][2][0].apply(exports,arguments)
},{"../utils":13,"dup":2}],6:[function(require,module,exports){
arguments[4][3][0].apply(exports,arguments)
},{"../utils":13,"dup":3}],7:[function(require,module,exports){
(function() {

    var localWrapperFactory = require('./localWrapperFactory');
    // var indexeddb = require('./indexeddb');
    var memory = require('./memory');
    var jjlc = require('./jjlc');
    var localStorage = (typeof localStorage !== 'undefined') ? localStorage : (require('node-localstorage'));
    var drivers = {
        jjlc: localWrapperFactory(jjlc),
        memory: localWrapperFactory(memory),
        localStorage: localWrapperFactory(localStorage),
    };

    function Storage(path, options) {
        var self = this;
        this.options = options;
        this.booted = false;
        this.driver = new drivers[options.driver](path, options);
        this.driver.boot(function(err) {
            if(err) throw err;
            self.booted = true;
        });
    }

    Storage.prototype.get = function(callback) {
        callback = callback || function() {};
        this.driver.get(callback);
    };

    Storage.prototype.set = function(datas, callback) {
        callback = callback || function() {};
        this.driver.set(datas, callback);
    };

    Storage.prototype.where = function(query, callback) {
        callback = callback || function() {};
        this.driver.where(query, callback);
    };

    Storage.prototype.clear = function(callback) {
        callback = callback || function() {};
        this.driver.clear(callback);
    };

    module.exports = Storage;

})(this);
},{"./jjlc":8,"./localWrapperFactory":9,"./memory":10,"node-localstorage":1}],8:[function(require,module,exports){
(function() {

    var localStorage = (typeof localStorage !== 'undefined') ? localStorage : (require('node-localstorage'));

    // https://github.com/k-yak/JJLC/blob/master/scripts/jjlc.dev.js
    var regex = /\"[a-zA-Z0-9]*\":/g,
        separator = '£',
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
        };
        this.getItem = function(key) {
            var dict;
            var compressed = localStorage.getItem(key);
            if (typeof dicts[key] === 'undefined') {
                dict = JSON.parse(localStorage.getItem('d_' + key));
            } else {
                dict = dicts[key];
            }
            return _decompress(compressed, dict);
        };
        this.getDict = function(key) {
            var dict;
            if (typeof dicts[key] === 'undefined') {
                dict = JSON.parse(localStorage.getItem('d_' + key));
            } else {
                dict = dicts[key];
            }
            return dict;
        };
        this.setDict = function(key, dic, ns) {
            if (typeof ns === 'undefined') {
                localStorage.setItem('d_' + key, dic);
            } else {
                dicts[key] = dic;
            }
        };
    }

    module.exports = new JJLC();

})(this);
},{"node-localstorage":1}],9:[function(require,module,exports){
(function(){
    "use strict";

    function localWrapperFactory(storage) {

        function LocalWrapper(path, options) {
            this.storage = storage;
            this.booted = false;
            this.path = path;
            this.options = options;
        }

        LocalWrapper.prototype.boot = function(callback) {
            this.booted = true;
            if(callback) {
                callback(null);
            }
        };

        LocalWrapper.prototype.get = function(callback) {
            callback = callback || function() {};
            var datas = this.storage.getItem(this.path);
            if (!datas) {
                datas = '[]';
            }
            datas = JSON.parse(datas);
            callback(null, datas);
        };

        LocalWrapper.prototype.set = function(datas, callback) {
            callback = callback || function() {};
            datas = JSON.stringify(datas);
            this.storage.setItem(this.path, datas);
            callback(null);
        };

        LocalWrapper.prototype.where = function(query, callback) {
            callback = callback || function() {};
            this.get(function(err, datas) {
                if (err) return callback(err);
                datas = utils.sift(query, datas);
                callback(null, datas);
            });
        };

        LocalWrapper.prototype.clear = function(callback) {
            callback = callback || function() {};
            this.set([], function(err) {
                if (err) return callback(err);
                callback(null);
            });
        };

        return LocalWrapper;
    }

    module.exports = localWrapperFactory;

})(this);
},{}],10:[function(require,module,exports){
(function(){
    var storage = {};
    module.exports = {
        getItem: function(path) {
            if(!storage[path]) {
                // localStorage saves data in string
                storage[path] = '';
            }
            return storage[path];
        },
        setItem: function(path, value) {
            storage[path] = value;
        }
    };
})(this);
},{}],11:[function(require,module,exports){
(function() {
    "use strict";

    // http://andrewdupont.net/2009/08/28/deep-extending-objects-in-javascript/
    function deepExtend(destination, source) {
        for (var property in source) {
            if (source[property] && source[property].constructor &&
                source[property].constructor === Object) {
                destination[property] = destination[property] || {};
                deepExtend(destination[property], source[property]);
            } else {
                destination[property] = source[property];
            }
        }
        return destination;
    }

    module.exports = deepExtend;
})(this);
},{}],12:[function(require,module,exports){
(function(){
    "use strict";

    function Eev () {
        this._events = {};
    }

    Eev.prototype = {
        on: function(names, fn) {
            var me = this;
            names.split(/\s+/g).forEach(function(name) {
                                if(!me._events[name]) me._events[name] = [];
                me._events[name].push(fn);
            });
            return this;
        },

        off: function(names, fn) {
            var me = this;
            names.split(/\s+/g).forEach(function(name) {
                var list = me._events[name];
                if(list) {
                    me._events[name] = me._events[name].filter(function(fn){
                        return fn !== fn;
                    });
                }
            });
            return this;
        },

        once: function(names, fn) {
            var me = this;
            names.split(/\s+/g).forEach(function(name) {
                                if(!me._events[name]) me._events[name] = [];
                fn._callOnce = true;
                me._events[name].push(fn);
            });
            return this;
        },

        emit: function(name, data, context) {
            var me = this;
            context = context || this;
            var evt = this._events[name] || (this._events[name] = []);
            evt.forEach(function(fn){
                if(fn._callOnce) {
                    delete fn._callOnce;
                    fn.call(context, data);
                    me.off(name, fn);
                    return me;
                }
                fn.call(context, data);
            });
            return this;
        }
    };

    module.exports = Eev;
})(this);
},{}],13:[function(require,module,exports){
(function() {
    "use strict";

    var utils = {};

    utils.sift = require('./sift');

    utils.uuid = require('./uuid');

    utils.Eev = require('./eev');

    utils.deepExtend = require('./deepExtend');

    module.exports = utils;

})(this);
},{"./deepExtend":11,"./eev":12,"./sift":14,"./uuid":15}],14:[function(require,module,exports){
(function() {
    "use strict";

    // https://github.com/crcn/sift.js/tree/master

    function isFunction(value) {
        return typeof value === 'function';
    }

    function isArray(value) {
        return Object.prototype.toString.call(value) === '[object Array]';
    }

    function comparable(value) {
        if (value instanceof Date) {
            return value.getTime();
        } else if (value instanceof Array) {
            return value.map(comparable);
        } else {
            return value;
        }
    }

    function get(obj, key) {
        if (obj.get) return obj.get(key);
        return obj[key];
    }

    function or(validator) {
        return function(a, b) {
            if (!isArray(b) || !b.length) return validator(a, b);
            for (var i = 0, n = b.length; i < n; i++)
                if (validator(a, get(b, i))) return true;
            return false;
        };
    }

    function and(validator) {
        return function(a, b) {
            if (!isArray(b) || !b.length) return validator(a, b);
            for (var i = 0, n = b.length; i < n; i++)
                if (!validator(a, get(b, i))) return false;
            return true;
        };
    }

    function validate(validator, b) {
        return validator.v(validator.a, b);
    }


    var operator = {

        /**
         */

        $eq: or(function(a, b) {
            return a(b);
        }),

        /**
         */

        $ne: and(function(a, b) {
            return !a(b);
        }),

        /**
         */

        $or: function(a, b) {
            for (var i = 0, n = a.length; i < n; i++)
                if (validate(get(a, i), b)) return true;
            return false;
        },

        /**
         */

        $gt: or(function(a, b) {
            return sift.compare(comparable(b), a) > 0;
        }),

        /**
         */

        $gte: or(function(a, b) {
            return sift.compare(comparable(b), a) >= 0;
        }),

        /**
         */

        $lt: or(function(a, b) {
            return sift.compare(comparable(b), a) < 0;
        }),

        /**
         */

        $lte: or(function(a, b) {
            return sift.compare(comparable(b), a) <= 0;
        }),

        /**
         */

        $mod: or(function(a, b) {
            return b % a[0] == a[1];
        }),

        /**
         */

        $in: function(a, b) {

            if (b instanceof Array) {
                for (var i = b.length; i--;) {
                    if (~a.indexOf(comparable(get(b, i)))) return true;
                }
            } else {
                return !!~a.indexOf(comparable(b));
            }

            return false;
        },

        /**
         */

        $nin: function(a, b) {
            return !operator.$in(a, b);
        },

        /**
         */

        $not: function(a, b) {
            return !validate(a, b);
        },

        /**
         */

        $type: function(a, b) {
            return b != void 0 ? b instanceof a || b.constructor == a : false;
        },

        /**
         */

        $all: function(a, b) {
            if (!b) b = [];
            for (var i = a.length; i--;) {
                if (!~comparable(b).indexOf(get(a, i))) return false;
            }
            return true;
        },

        /**
         */

        $size: function(a, b) {
            return b ? a === b.length : false;
        },

        /**
         */

        $nor: function(a, b) {
            // todo - this suffice? return !operator.$in(a)
            for (var i = 0, n = a.length; i < n; i++)
                if (validate(get(a, i), b)) return false;
            return true;
        },

        /**
         */

        $and: function(a, b) {
            for (var i = 0, n = a.length; i < n; i++)
                if (!validate(get(a, i), b)) return false;
            return true;
        },

        /**
         */

        $regex: or(function(a, b) {
            return typeof b === 'string' && a.test(b);
        }),

        /**
         */

        $where: function(a, b) {
            return a.call(b, b);
        },

        /**
         */

        $elemMatch: function(a, b) {
            if (isArray(b)) return !!~search(b, a);
            return validate(a, b);
        },

        /**
         */

        $exists: function(a, b) {
            return (b != void 0) === a;
        }
    };

    var prepare = {

        /**
         */

        $eq: function(a) {

            if (a instanceof RegExp) {
                return function(b) {
                    return typeof b === 'string' && a.test(b);
                };
            } else if (a instanceof Function) {
                return a;
            } else if (isArray(a) && !a.length) {
                // Special case of a == []
                return function(b) {
                    return (isArray(b) && !b.length);
                };
            } else if (a === null) {
                return function(b) {
                    //will match both null and undefined
                    return (b === null || b === undefined);
                };
            }

            return function(b) {
                return sift.compare(comparable(b), a) === 0;
            };
        },

        /**
         */

        $ne: function(a) {
            return prepare.$eq(a);
        },

        /**
         */

        $and: function(a) {
            return a.map(parse);
        },

        /**
         */

        $or: function(a) {
            return a.map(parse);
        },

        /**
         */

        $nor: function(a) {
            return a.map(parse);
        },

        /**
         */

        $not: function(a) {
            return parse(a);
        },

        /**
         */

        $regex: function(a, query) {
            return new RegExp(a, query.$options);
        },

        /**
         */

        $where: function(a) {
            return a;
        },

        /**
         */

        $elemMatch: function(a) {
            return parse(a);
        },

        /**
         */

        $exists: function(a) {
            return !!a;
        }
    };

    function search(array, validator) {

        for (var i = 0; i < array.length; i++) {
            if (validate(validator, get(array, i))) {
                return i;
            }
        }

        return -1;
    }

    function createValidator(a, validate) {
        return {
            a: a,
            v: validate
        };
    }

    function nestedValidator(a, b) {
        var values = [];
        findValues(b, a.k, 0, values);

        if (values.length === 1) {
            return validate(a.nv, values[0]);
        }

        return !!~search(values, a.nv);
    }

    function findValues(current, keypath, index, values) {

        if (index === keypath.length || current == void 0) {
            values.push(current);
            return;
        }

        var k = get(keypath, index);

        // ensure that if current is an array, that the current key
        // is NOT an array index. This sort of thing needs to work:
        // sift({'foo.0':42}, [{foo: [42]}]);
        if (isArray(current) && isNaN(Number(k))) {
            for (var i = 0, n = current.length; i < n; i++) {
                findValues(get(current, i), keypath, index, values);
            }
        } else {
            findValues(get(current, k), keypath, index + 1, values);
        }
    }

    function createNestedValidator(keypath, a) {
        return {
            a: {
                k: keypath,
                nv: a
            },
            v: nestedValidator
        };
    }

    /**
     * flatten the query
     */

    function parse(query) {
        query = comparable(query);

        if (!query || (query.constructor.toString() !== 'Object' &&
            query.constructor.toString().replace(/\n/g, '').replace(/ /g, '') !== 'functionObject(){[nativecode]}')) { // cross browser support
            query = {
                $eq: query
            };
        }

        var validators = [];

        for (var key in query) {
            var a = query[key];

            if (key === '$options') continue;

            if (operator[key]) {
                if (prepare[key]) a = prepare[key](a, query);
                validators.push(createValidator(comparable(a), operator[key]));
            } else {

                if (key.charCodeAt(0) === 36) {
                    throw new Error('Unknown operation ' + key);
                }

                validators.push(createNestedValidator(key.split('.'), parse(a)));
            }
        }

        return validators.length === 1 ? validators[0] : createValidator(validators, operator.$and);
    }

    function createRootValidator(query, getter) {
        var validator = parse(query);
        if (getter) {
            validator = {
                a: validator,
                v: function(a, b) {
                    return validate(a, getter(b));
                }
            };
        }
        return validator;
    }

    function sift(query, array, getter) {

        if (isFunction(array)) {
            getter = array;
            array = void 0;
        }

        var validator = createRootValidator(query, getter);

        function filter(b) {
            return validate(validator, b);
        }

        if (array) {
            return array.filter(filter);
        }

        return filter;
    }

    sift.use = function(plugin) {
        if (isFunction(plugin)) return plugin(sift);
        for (var key in plugin) {
            if (key.charCodeAt(0) === 36) operator[key] = plugin[key];
        }
    };

    sift.indexOf = function(query, array, getter) {
        return search(array, createRootValidator(query, getter));
    };

    sift.compare = function(a, b) {
        if (a === b) return 0;
        if (typeof a === typeof b) {
            if (a > b) return 1;
            if (a < b) return -1;
        }
    };

    module.exports = sift;

})(this);
},{}],15:[function(require,module,exports){
(function(){
    "use strict";

    // https://github.com/makeable/uuid-v4.js
    var dec2hex = [];
    for (var i = 0; i <= 15; i++) {
        dec2hex[i] = i.toString(16);
    }
    function uuid() {
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

    module.exports = uuid;

})(this);
},{}],"castmydata-jsclient":[function(require,module,exports){
(function() {
    'use strict';

    var storage = require('./storage');
    var utils = require('./utils');

    /**
     * Model Start
     */

    var Model = require('./modules/model');

    /**
     * Query start
     */

    var Query = require('./modules/query');

    /**
     * Endpoint start
     */

    var Endpoint = require('./modules/endpoint');

    // Exports

    var CastMyData = {
        Model: Model,
        Query: Query,
        Endpoint: Endpoint,
        Utils: utils,
    };

    module.exports = CastMyData;

})(this);
},{"./modules/endpoint":4,"./modules/model":5,"./modules/query":6,"./storage":7,"./utils":13}]},{},[])("castmydata-jsclient")
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9saWIvX2VtcHR5LmpzIiwic3JjL21vZHVsZXMvTW9kZWwuanMiLCJzcmMvbW9kdWxlcy9RdWVyeS5qcyIsInNyYy9tb2R1bGVzL2VuZHBvaW50LmpzIiwic3JjL3N0b3JhZ2UvaW5kZXguanMiLCJzcmMvc3RvcmFnZS9qamxjLmpzIiwic3JjL3N0b3JhZ2UvbG9jYWxXcmFwcGVyRmFjdG9yeS5qcyIsInNyYy9zdG9yYWdlL21lbW9yeS5qcyIsInNyYy91dGlscy9kZWVwRXh0ZW5kLmpzIiwic3JjL3V0aWxzL2Vldi5qcyIsInNyYy91dGlscy9pbmRleC5qcyIsInNyYy91dGlscy9zaWZ0LmpzIiwic3JjL3V0aWxzL3V1aWQuanMiLCJzcmMvY2FzdG15ZGF0YS5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBOztBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7OztBQzNXQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3SUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNmQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVjQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIiLCIoZnVuY3Rpb24oKXtcbiAgICBcInVzZSBzdHJpY3RcIjtcblxuICAgIHZhciB1dGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzJyk7XG5cbiAgICBmdW5jdGlvbiBnZXRSZWNvcmQobW9kZWwpIHtcbiAgICAgICAgdmFyIHJlY29yZCA9IHt9O1xuICAgICAgICBmb3IodmFyIGtleSBpbiBtb2RlbCkge1xuICAgICAgICAgICAgaWYgKG1vZGVsLmhhc093blByb3BlcnR5KGtleSkgJiYgWyckJGhhc2hLZXknLCAnX2VuZHBvaW50JywgJ19ldmVudHMnXS5pbmRleE9mKGtleSkgPT0gLTEpIHtcbiAgICAgICAgICAgICAgICByZWNvcmRba2V5XSA9IG1vZGVsW2tleV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlY29yZDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBNb2RlbChwb2ludCwgcGFyYW1zKSB7XG4gICAgICAgIHBhcmFtcyA9IHBhcmFtcyB8fCB7fTtcbiAgICAgICAgdXRpbHMuZGVlcEV4dGVuZCh0aGlzLCBwYXJhbXMpO1xuICAgICAgICB0aGlzLmlkID0gdGhpcy5pZCB8fCB1dGlscy51dWlkKCk7XG4gICAgICAgIHRoaXMubWV0YSA9IHRoaXMubWV0YSB8fCB7fTtcbiAgICAgICAgdGhpcy5fZXZlbnRzID0ge307XG4gICAgICAgIHRoaXMuX2VuZHBvaW50ID0gcG9pbnQ7XG4gICAgfVxuXG4gICAgTW9kZWwucHJvdG90eXBlID0gT2JqZWN0LmNyZWF0ZSh1dGlscy5FZXYucHJvdG90eXBlKTtcblxuICAgIE1vZGVsLnByb3RvdHlwZS5nZXQgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIGdldFJlY29yZCh0aGlzKTtcbiAgICB9O1xuXG4gICAgTW9kZWwucHJvdG90eXBlLnBvc3QgPSBmdW5jdGlvbihjYWxsYmFjaykge1xuXG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgICAgICAvLyByZWdpc3RlciBjYWxsYmFja1xuICAgICAgICBpZiAoY2FsbGJhY2spIHRoaXMuX2VuZHBvaW50Ll9zb2NrZXQub25jZSgncmVjZWlwdDpwb3N0JywgY2FsbGJhY2spO1xuXG4gICAgICAgIC8vIHVwZGF0ZSBwcm9wZXJ0aWVzXG4gICAgICAgIHZhciBwYXJhbXMgPSB7XG4gICAgICAgICAgICBtZXRhOiB7XG4gICAgICAgICAgICAgICAgc3luY2VkOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBjcmVhdGVkQXQ6IERhdGUubm93KCksXG4gICAgICAgICAgICAgICAgdXBkYXRlZEF0OiBEYXRlLm5vdygpLFxuICAgICAgICAgICAgICAgIGRlbGV0ZWRBdDogbnVsbFxuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICB1dGlscy5kZWVwRXh0ZW5kKHRoaXMsIHBhcmFtcyk7XG5cbiAgICAgICAgLy8gYWRkIHRvIGVuZHBvaW50IG1vZGVsc1xuICAgICAgICB0aGlzLl9lbmRwb2ludC5tb2RlbHMucHVzaCh0aGlzKTtcblxuICAgICAgICAvLyBzYXZlIGludG8gc3RvcmFnZVxuICAgICAgICB0aGlzLl9lbmRwb2ludC5jb21taXQoKTtcblxuICAgICAgICAvLyBlbWl0IGV2ZW50c1xuICAgICAgICB0aGlzLmVtaXQoJ3Bvc3QnLCB0aGlzKTtcbiAgICAgICAgdGhpcy5fZW5kcG9pbnQuZW1pdCgncG9zdCcsIHRoaXMpO1xuXG4gICAgICAgIC8vIGhhbmRsZSBhY2wgZGVueVxuICAgICAgICB0aGlzLl9lbmRwb2ludC5fc29ja2V0Lm9uY2UoJ2RlbmllZDpwb3N0OicgKyB0aGlzLmlkLCBmdW5jdGlvbigpe1xuICAgICAgICAgICAgLy8gZGVyZWdpc3RlciBjYWxsYmFja1xuICAgICAgICAgICAgc2VsZi5fZW5kcG9pbnQuX3NvY2tldC5vZmYoJ3JlY2VpcHQ6cG9zdCcsIGNhbGxiYWNrKTtcbiAgICAgICAgICAgIHZhciBpbmRleCA9IHNlbGYuX2VuZHBvaW50Lm1vZGVscy5pbmRleE9mKHNlbGYpO1xuICAgICAgICAgICAgaWYoaW5kZXggPiAtMSkge1xuICAgICAgICAgICAgICAgIHNlbGYuX2VuZHBvaW50Lm1vZGVscy5zcGxpY2UoaW5kZXgsIDEpO1xuICAgICAgICAgICAgICAgIHNlbGYuX2VuZHBvaW50LmNvbW1pdCgpO1xuICAgICAgICAgICAgICAgIHNlbGYuX2VuZHBvaW50LmVtaXQoJ3Bvc3QnLCBzZWxmLmlkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gZW1pdCBzb2NrZXRcbiAgICAgICAgdGhpcy5fZW5kcG9pbnQuX3NvY2tldC5lbWl0KCdwb3N0JywgdGhpcy5nZXQoKSk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH07XG5cbiAgICBNb2RlbC5wcm90b3R5cGUucHV0ID0gZnVuY3Rpb24ocGFyYW1zLCBjYWxsYmFjaykge1xuXG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgICAgICAvLyByZWdpc3RlciBjYWxsYmFja1xuICAgICAgICBpZiAoY2FsbGJhY2spIHRoaXMuX2VuZHBvaW50Ll9zb2NrZXQub25jZSgncmVjZWlwdDpwdXQnLCBjYWxsYmFjayk7XG5cbiAgICAgICAgLy8gdXBkYXRlIHByb3BlcnRpZXNcbiAgICAgICAgdXRpbHMuZGVlcEV4dGVuZCh0aGlzLCBwYXJhbXMpO1xuICAgICAgICB0aGlzLm1ldGEuc3luY2VkID0gZmFsc2U7XG4gICAgICAgIHRoaXMubWV0YS51cGRhdGVkQXQgPSBEYXRlLm5vdygpO1xuXG4gICAgICAgIC8vIHNhdmUgaW50byBzdG9yYWdlXG4gICAgICAgIHRoaXMuX2VuZHBvaW50LmNvbW1pdCgpO1xuXG4gICAgICAgIC8vIGVtaXQgZXZlbnRzXG4gICAgICAgIHRoaXMuZW1pdCgncHV0JywgdGhpcywgcGFyYW1zKTtcbiAgICAgICAgdGhpcy5fZW5kcG9pbnQuZW1pdCgncHV0JywgdGhpcywgcGFyYW1zKTtcblxuICAgICAgICAvLyBoYW5kbGUgYWNsIGRlbnlcbiAgICAgICAgdGhpcy5fZW5kcG9pbnQuX3NvY2tldC5vbmNlKCdkZW5pZWQ6cHV0OicgKyB0aGlzLmlkLCBmdW5jdGlvbihkYXRhKXtcbiAgICAgICAgICAgIC8vIGRlcmVnaXN0ZXIgY2FsbGJhY2tcbiAgICAgICAgICAgIHNlbGYuX2VuZHBvaW50Ll9zb2NrZXQub2ZmKCdyZWNlaXB0OnB1dCcsIGNhbGxiYWNrKTtcbiAgICAgICAgICAgIHV0aWxzLmRlZXBFeHRlbmQoc2VsZiwgZGF0YSk7XG4gICAgICAgICAgICBzZWxmLl9lbmRwb2ludC5jb21taXQoKTtcbiAgICAgICAgICAgIHNlbGYuZW1pdCgncHV0Jyk7XG4gICAgICAgICAgICBzZWxmLl9lbmRwb2ludC5lbWl0KCdwdXQnKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gZW1pdCBzb2NrZXRcbiAgICAgICAgdGhpcy5fZW5kcG9pbnQuX3NvY2tldC5lbWl0KCdwdXQnLCB0aGlzLmdldCgpKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfTtcblxuICAgIE1vZGVsLnByb3RvdHlwZS5kZWxldGUgPSBmdW5jdGlvbihjYWxsYmFjaykge1xuXG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgICAgICAvLyByZWdpc3RlciBjYWxsYmFja1xuICAgICAgICBpZiAoY2FsbGJhY2spIHRoaXMuX2VuZHBvaW50Ll9zb2NrZXQub25jZSgncmVjZWlwdDpkZWxldGUnLCBjYWxsYmFjayk7XG5cbiAgICAgICAgLy8gY2xlYXIgcHJvcGVydGllc1xuICAgICAgICBmb3IodmFyIGtleSBpbiB0aGlzKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5oYXNPd25Qcm9wZXJ0eShrZXkpICYmIFsnbWV0YScsICdpZCcsICdfZW5kcG9pbnQnLCAnX2V2ZW50cyddLmluZGV4T2Yoa2V5KSA9PSAtMSkge1xuICAgICAgICAgICAgICAgIGRlbGV0ZSB0aGlzW2tleV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5tZXRhLmRlbGV0ZWRBdCA9IERhdGUubm93KCk7XG4gICAgICAgIHRoaXMubWV0YS5zeW5jZWQgPSBmYWxzZTtcblxuICAgICAgICAvLyBzYXZlIGludG8gc3RvcmFnZVxuICAgICAgICB0aGlzLl9lbmRwb2ludC5jb21taXQoKTtcblxuICAgICAgICAvLyBlbWl0IGV2ZW50c1xuICAgICAgICB0aGlzLmVtaXQoJ2RlbGV0ZScsIHRoaXMpO1xuICAgICAgICB0aGlzLl9lbmRwb2ludC5lbWl0KCdkZWxldGUnLCB0aGlzKTtcblxuICAgICAgICAvLyBoYW5kbGUgYWNsIGRlbnlcbiAgICAgICAgdGhpcy5fZW5kcG9pbnQuX3NvY2tldC5vbmNlKCdkZW5pZWQ6ZGVsZXRlOicgKyB0aGlzLmlkLCBmdW5jdGlvbihkYXRhKXtcbiAgICAgICAgICAgIC8vIGRlcmVnaXN0ZXIgY2FsbGJhY2tcbiAgICAgICAgICAgIHNlbGYuX2VuZHBvaW50Ll9zb2NrZXQub2ZmKCdyZWNlaXB0OmRlbGV0ZScsIGNhbGxiYWNrKTtcbiAgICAgICAgICAgIHV0aWxzLmRlZXBFeHRlbmQoc2VsZiwgZGF0YSk7XG4gICAgICAgICAgICBzZWxmLl9lbmRwb2ludC5jb21taXQoKTtcbiAgICAgICAgICAgIHNlbGYuZW1pdCgnZGVsZXRlJyk7XG4gICAgICAgICAgICBzZWxmLl9lbmRwb2ludC5lbWl0KCdkZWxldGUnKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gZW1pdCBzb2NrZXRcbiAgICAgICAgdGhpcy5fZW5kcG9pbnQuX3NvY2tldC5lbWl0KCdkZWxldGUnLCB0aGlzLmlkKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfTtcblxuICAgIE1vZGVsLnByb3RvdHlwZS5tZXJnZSA9IGZ1bmN0aW9uKF9tb2RlbCkge1xuICAgICAgICBpZiAoSlNPTi5zdHJpbmdpZnkoZ2V0UmVjb3JkKHRoaXMpKSAhPSBKU09OLnN0cmluZ2lmeShfbW9kZWwpKSB7XG4gICAgICAgICAgICAvLyB1cGRhdGUgcHJvcGVydGllc1xuICAgICAgICAgICAgdXRpbHMuZGVlcEV4dGVuZCh0aGlzLCBfbW9kZWwpO1xuXG4gICAgICAgICAgICAvLyBzYXZlIGludG8gc3RvcmFnZVxuICAgICAgICAgICAgdGhpcy5fZW5kcG9pbnQuY29tbWl0KCk7XG5cbiAgICAgICAgICAgIC8vIGVtaXQgZXZlbnRzXG4gICAgICAgICAgICB0aGlzLmVtaXQoJ21lcmdlJywgdGhpcyk7XG4gICAgICAgICAgICB0aGlzLl9lbmRwb2ludC5lbWl0KCdtZXJnZScsIHRoaXMpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH07XG5cbiAgICBtb2R1bGUuZXhwb3J0cyA9IE1vZGVsO1xuXG59KSh0aGlzKTtcbiIsIihmdW5jdGlvbigpIHtcbiAgICBcInVzZSBzdHJpY3RcIjtcblxuICAgIHZhciB1dGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzJyk7XG5cbiAgICBmdW5jdGlvbiBRdWVyeShlbmRwb2ludCwgZmlsdGVyKSB7XG4gICAgICAgIHRoaXMubW9kZWxzID0gW107XG4gICAgICAgIHRoaXMuX2ZpbHRlciA9IGZpbHRlcjtcbiAgICAgICAgdGhpcy5fZW5kcG9pbnQgPSBlbmRwb2ludDtcbiAgICAgICAgdGhpcy5fZXZlbnRzID0ge307XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdGhpcy5fZW5kcG9pbnQub24oJ3N1YnNjcmliZWQnLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHNlbGYucnVuKCk7XG4gICAgICAgICAgICBzZWxmLmVtaXQoJ3N1YnNjcmliZWQnKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuX2VuZHBvaW50Lm9uKCd1bnN1YnNjcmliZWQnLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHNlbGYucnVuKCk7XG4gICAgICAgICAgICBzZWxmLmVtaXQoJ3Vuc3Vic2NyaWJlZCcpO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5fZW5kcG9pbnQub24oJ3N5bmMnLCBmdW5jdGlvbihtb2RlbHMpIHtcbiAgICAgICAgICAgIHNlbGYucnVuKCk7XG4gICAgICAgICAgICBzZWxmLmVtaXQoJ3N5bmMnLCBtb2RlbHMpO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5fZW5kcG9pbnQub24oJ3Bvc3QnLCBmdW5jdGlvbihtb2RlbCkge1xuICAgICAgICAgICAgc2VsZi5ydW4oKTtcbiAgICAgICAgICAgIHNlbGYuZW1pdCgncG9zdCcsIG1vZGVsKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuX2VuZHBvaW50Lm9uKCdwdXQnLCBmdW5jdGlvbihtb2RlbCkge1xuICAgICAgICAgICAgc2VsZi5ydW4oKTtcbiAgICAgICAgICAgIHNlbGYuZW1pdCgncHV0JywgbW9kZWwpO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5fZW5kcG9pbnQub24oJ2RlbGV0ZScsIGZ1bmN0aW9uKG1vZGVsKSB7XG4gICAgICAgICAgICBzZWxmLnJ1bigpO1xuICAgICAgICAgICAgc2VsZi5lbWl0KCdwdXQnLCBtb2RlbCk7XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLl9lbmRwb2ludC5vbignY2xlYXInLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHNlbGYucnVuKCk7XG4gICAgICAgICAgICBzZWxmLmVtaXQoJ2NsZWFyJyk7XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLl9lbmRwb2ludC5vbignbWVyZ2UnLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHNlbGYucnVuKCk7XG4gICAgICAgICAgICBzZWxmLmVtaXQoJ21lcmdlJyk7XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLnJ1bi5jYWxsKHNlbGYpO1xuICAgIH1cblxuICAgIFF1ZXJ5LnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUodXRpbHMuRWV2LnByb3RvdHlwZSk7XG5cbiAgICBRdWVyeS5wcm90b3R5cGUucnVuID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHRoaXMubW9kZWxzID0gdXRpbHMuc2lmdCh0aGlzLl9maWx0ZXIsIHRoaXMuX2VuZHBvaW50Lm1vZGVscyk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH07XG5cbiAgICBRdWVyeS5wcm90b3R5cGUucHV0ID0gZnVuY3Rpb24ocmVjb3JkKSB7XG4gICAgICAgIHRoaXMubW9kZWxzLmZvckVhY2goZnVuY3Rpb24obW9kZWwpIHtcbiAgICAgICAgICAgIG1vZGVsLnB1dChyZWNvcmQpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfTtcblxuICAgIFF1ZXJ5LnByb3RvdHlwZS5kZWxldGUgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgdGhpcy5tb2RlbHMuZm9yRWFjaChmdW5jdGlvbihtb2RlbCkge1xuICAgICAgICAgICAgbW9kZWwuZGVsZXRlKCk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9O1xuXG4gICAgbW9kdWxlLmV4cG9ydHMgPSBRdWVyeTtcblxufSkodGhpcyk7IiwiKGZ1bmN0aW9uKCkge1xuICAgIFwidXNlIHN0cmljdFwiO1xuXG4gICAgdmFyIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMnKTtcbiAgICB2YXIgc3RvcmFnZSA9IHJlcXVpcmUoJy4uL3N0b3JhZ2UnKTtcbiAgICB2YXIgTW9kZWwgPSByZXF1aXJlKCcuLi9tb2R1bGVzL01vZGVsJyk7XG4gICAgdmFyIFF1ZXJ5ID0gcmVxdWlyZSgnLi4vbW9kdWxlcy9RdWVyeScpO1xuICAgIHZhciBpbyA9ICh0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJykgPyB3aW5kb3cuaW8gOiBudWxsO1xuXG4gICAgZnVuY3Rpb24gRW5kcG9pbnQoQ2FzdE15RGF0YVNlcnZlciwgcGF0aCwgb3B0aW9ucykge1xuXG4gICAgICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgaWYgKCgvW15hLXpBLVowLTktX1xcLl0vZykudGVzdChwYXRoKSkge1xuICAgICAgICAgICAgdGhyb3cgJ0ludmFsaWQgY2hhcmFjdGVycyBpbiBwYXRoLiBBbGxvd2VkIGNoYXJhY3RlcnMgYXJlIGEteiwgQS1aLCAwLTksIC0sIF8sIC4nO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYoIWlvKSB7XG4gICAgICAgICAgICBpbyA9IHJlcXVpcmUoJ3NvY2tldC5pby1jbGllbnQnKTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgc29ja2V0ID0gaW8oQ2FzdE15RGF0YVNlcnZlciArICc/cGF0aD0nICsgcGF0aCwge1xuICAgICAgICAgICAgbXVsdGlwbGV4OiBmYWxzZVxuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLl9vcHRpb25zID0ge1xuICAgICAgICAgICAgc3RvcmFnZTogJ2pqbGMnXG4gICAgICAgIH07XG4gICAgICAgIHV0aWxzLmRlZXBFeHRlbmQodGhpcy5fb3B0aW9ucywgb3B0aW9ucyk7XG5cbiAgICAgICAgdGhpcy5fc29ja2V0ID0gc29ja2V0O1xuICAgICAgICB0aGlzLl9Nb2RlbCA9IHRoaXMuX29wdGlvbnMubW9kZWwgfHwgTW9kZWw7XG4gICAgICAgIHRoaXMubW9kZWxzID0gW107XG4gICAgICAgIHRoaXMuX2V2ZW50cyA9IHt9O1xuICAgICAgICB0aGlzLl9maWx0ZXIgPSB7fTtcbiAgICAgICAgdGhpcy5fc3Vic2NyaWJlZCA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9zdG9yYWdlID0gbmV3IHN0b3JhZ2UoJ2NtZF8nICsgcGF0aCwge1xuICAgICAgICAgICAgZHJpdmVyOiB0aGlzLl9vcHRpb25zLnN0b3JhZ2VcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gY3JlYXRlIHRoZSBzb2NrZXRcbiAgICAgICAgc29ja2V0LnBhdGggPSBwYXRoO1xuXG4gICAgICAgIC8vIEFkZCBoYW5kbGVyc1xuICAgICAgICBmdW5jdGlvbiBzeW5jSGFuZGxlcihkYXRhLCBjYWxsYmFjaykge1xuICAgICAgICAgICAgaWYgKCFzZWxmLl9zdWJzY3JpYmVkKSByZXR1cm47XG4gICAgICAgICAgICBkYXRhLmZvckVhY2goZnVuY3Rpb24oX21vZGVsKSB7XG4gICAgICAgICAgICAgICAgcG9zdEhhbmRsZXIoX21vZGVsKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgc2VsZi5lbWl0KCdzeW5jJywgc2VsZi5tb2RlbHMpO1xuICAgICAgICAgICAgaWYgKGNhbGxiYWNrKSBjYWxsYmFjaygpO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gcG9zdEhhbmRsZXIoX21vZGVsLCBjYWxsYmFjaykge1xuICAgICAgICAgICAgaWYgKCFzZWxmLl9zdWJzY3JpYmVkKSByZXR1cm47XG4gICAgICAgICAgICB2YXIgbW9kZWwgPSBzZWxmLmZpbmQoX21vZGVsLmlkKTtcbiAgICAgICAgICAgIGlmIChtb2RlbCkge1xuICAgICAgICAgICAgICAgIG1vZGVsLm1lcmdlKF9tb2RlbCk7XG4gICAgICAgICAgICAgICAgbW9kZWwuZW1pdCgnbWVyZ2UnLCBtb2RlbCk7XG4gICAgICAgICAgICAgICAgc2VsZi5lbWl0KCdtZXJnZScsIG1vZGVsKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gY3JlYXRlIG1vZGVsXG4gICAgICAgICAgICAgICAgbW9kZWwgPSBuZXcgc2VsZi5fTW9kZWwoc2VsZiwgX21vZGVsKTtcblxuICAgICAgICAgICAgICAgIC8vIGFkZCB0byBtb2RlbHNcbiAgICAgICAgICAgICAgICBzZWxmLm1vZGVscy5wdXNoKG1vZGVsKTtcblxuICAgICAgICAgICAgICAgIC8vIHNhdmUgaW50byBzdG9yYWdlXG4gICAgICAgICAgICAgICAgc2VsZi5jb21taXQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIGVtaXQgZXZlbnRzXG4gICAgICAgICAgICBtb2RlbC5lbWl0KCdwb3N0JywgbW9kZWwpO1xuICAgICAgICAgICAgc2VsZi5lbWl0KCdwb3N0JywgbW9kZWwpO1xuICAgICAgICAgICAgaWYgKGNhbGxiYWNrKSBjYWxsYmFjayhtb2RlbCk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBwdXRIYW5kbGVyKHJlY29yZCwgY2FsbGJhY2spIHtcbiAgICAgICAgICAgIGlmICghc2VsZi5fc3Vic2NyaWJlZCkgcmV0dXJuO1xuICAgICAgICAgICAgdmFyIG1vZGVsID0gc2VsZi5maW5kKHJlY29yZC5pZCk7XG4gICAgICAgICAgICBpZiAobW9kZWwpIHtcbiAgICAgICAgICAgICAgICAvLyB1cGRhdGUgbW9kZWwgcHJvcGVydGllc1xuICAgICAgICAgICAgICAgIHV0aWxzLmRlZXBFeHRlbmQobW9kZWwsIHJlY29yZCk7XG5cbiAgICAgICAgICAgICAgICAvLyBzYXZlIGludG8gc3RvcmFnZVxuICAgICAgICAgICAgICAgIHNlbGYuY29tbWl0KCk7XG5cbiAgICAgICAgICAgICAgICAvLyBlbWl0IGV2ZW50c1xuICAgICAgICAgICAgICAgIG1vZGVsLmVtaXQoJ21lcmdlJywgbW9kZWwpO1xuICAgICAgICAgICAgICAgIHNlbGYuZW1pdCgnbWVyZ2UnLCBtb2RlbCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIG1vZGVsID0gbmV3IHNlbGYuX01vZGVsKHNlbGYsIHJlY29yZCk7XG4gICAgICAgICAgICAgICAgc2VsZi5tb2RlbHMucHVzaChtb2RlbCk7XG4gICAgICAgICAgICAgICAgc2VsZi5jb21taXQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG1vZGVsLmVtaXQoJ3B1dCcpO1xuICAgICAgICAgICAgaWYgKGNhbGxiYWNrKSBjYWxsYmFjayhtb2RlbCk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBkZWxldGVIYW5kbGVyKHJlY29yZCwgY2FsbGJhY2spIHtcbiAgICAgICAgICAgIGlmICghc2VsZi5fc3Vic2NyaWJlZCkgcmV0dXJuO1xuICAgICAgICAgICAgdmFyIG1vZGVsID0gc2VsZi5maW5kKHJlY29yZC5pZCk7XG4gICAgICAgICAgICBpZiAobW9kZWwpIHtcbiAgICAgICAgICAgICAgICAvLyB1cGRhdGUgcHJvcGVydGllc1xuXG4gICAgICAgICAgICAgICAgZm9yICh2YXIga2V5IGluIG1vZGVsKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChtb2RlbC5oYXNPd25Qcm9wZXJ0eShrZXkpICYmIFtcbiAgICAgICAgICAgICAgICAgICAgICAgICdpZCcsXG4gICAgICAgICAgICAgICAgICAgICAgICAnbWV0YScsXG4gICAgICAgICAgICAgICAgICAgICAgICAnJCRoYXNoS2V5JyxcbiAgICAgICAgICAgICAgICAgICAgICAgICdfZW5kcG9pbnQnLFxuICAgICAgICAgICAgICAgICAgICAgICAgJ19ldmVudHMnXG4gICAgICAgICAgICAgICAgICAgIF0uaW5kZXhPZihrZXkpID09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWxldGUgbW9kZWxba2V5XTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIGV4dGVuZCByZXNwb25zZSBtZXRhXG4gICAgICAgICAgICAgICAgdXRpbHMuZGVlcEV4dGVuZChtb2RlbC5tZXRhLCByZWNvcmQubWV0YSk7XG5cbiAgICAgICAgICAgICAgICAvLyBzYXZlIGludG8gc3RvcmFnZVxuICAgICAgICAgICAgICAgIHNlbGYuY29tbWl0KCk7XG5cbiAgICAgICAgICAgICAgICAvLyBlbWl0IGV2ZW50c1xuICAgICAgICAgICAgICAgIG1vZGVsLmVtaXQoJ21lcmdlJywgbW9kZWwpO1xuICAgICAgICAgICAgICAgIHNlbGYuZW1pdCgnbWVyZ2UnLCBtb2RlbCk7XG4gICAgICAgICAgICAgICAgaWYgKGNhbGxiYWNrKSBjYWxsYmFjayhtb2RlbCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBjbGVhckhhbmRsZXIoY2FsbGJhY2spIHtcbiAgICAgICAgICAgIGNhbGxiYWNrID0gY2FsbGJhY2sgfHwgZnVuY3Rpb24oKSB7fTtcbiAgICAgICAgICAgIHNlbGYuX3N0b3JhZ2UuY2xlYXIoZnVuY3Rpb24oZXJyKSB7XG4gICAgICAgICAgICAgICAgaWYgKGVycikgcmV0dXJuIHV0aWxzLmhhbmRsZUVycm9yKGVycik7XG4gICAgICAgICAgICAgICAgc2VsZi5tb2RlbHMuc3BsaWNlKDAsIHNlbGYubW9kZWxzLmxlbmd0aCk7XG4gICAgICAgICAgICAgICAgc2VsZi5lbWl0KCdjbGVhcicpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBsaXN0ZW5IYW5kbGVyKGNoYW5uZWwsIGNhbGxiYWNrKSB7XG4gICAgICAgICAgICBzZWxmLmVtaXQoJ2xpc3RlbicsIGNoYW5uZWwpO1xuICAgICAgICAgICAgaWYgKGNhbGxiYWNrKSBjYWxsYmFjayhjaGFubmVsKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIHVubGlzdGVuSGFuZGxlcihjaGFubmVsLCBjYWxsYmFjaykge1xuICAgICAgICAgICAgc2VsZi5lbWl0KCd1bmxpc3RlbicsIGNoYW5uZWwpO1xuICAgICAgICAgICAgaWYgKGNhbGxiYWNrKSBjYWxsYmFjayhjaGFubmVsKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGJyb2FkY2FzdEhhbmRsZXIoZGF0YSwgY2FsbGJhY2spIHtcbiAgICAgICAgICAgIHNlbGYuZW1pdCgnYnJvYWRjYXN0JywgZGF0YSk7XG4gICAgICAgICAgICBzZWxmLmVtaXQoJ2Jyb2FkY2FzdDonICsgZGF0YS5jaGFubmVsLCBkYXRhLnBheWxvYWQpO1xuICAgICAgICAgICAgaWYgKGNhbGxiYWNrKSBjYWxsYmFjayhkYXRhKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIHJlY29ubmVjdEhhbmRsZXIoKSB7XG4gICAgICAgICAgICBpZiAoc2VsZi5fc3Vic2NyaWJlZCkge1xuICAgICAgICAgICAgICAgIHNlbGYuc3Vic2NyaWJlKHNlbGYuX29wdGlvbnMpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gc2VydmVyRXJyb3JIYW5kbGVyKGVycm9yKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKGVycm9yKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGhhbmRsZSBldmVudHMgZnJvbSBvdGhlciBjbGllbnRzXG4gICAgICAgIHNvY2tldC5vbignc3luYycsIHN5bmNIYW5kbGVyKTtcbiAgICAgICAgc29ja2V0Lm9uKCdwb3N0JywgcG9zdEhhbmRsZXIpO1xuICAgICAgICBzb2NrZXQub24oJ3B1dCcsIHB1dEhhbmRsZXIpO1xuICAgICAgICBzb2NrZXQub24oJ2RlbGV0ZScsIGRlbGV0ZUhhbmRsZXIpO1xuICAgICAgICBzb2NrZXQub24oJ2NsZWFyJywgY2xlYXJIYW5kbGVyKTtcbiAgICAgICAgc29ja2V0Lm9uKCdicm9hZGNhc3QnLCBicm9hZGNhc3RIYW5kbGVyKTtcbiAgICAgICAgc29ja2V0Lm9uKCdyZWNvbm5lY3QnLCByZWNvbm5lY3RIYW5kbGVyKTtcbiAgICAgICAgc29ja2V0Lm9uKCdjbWRlcnJvcicsIHNlcnZlckVycm9ySGFuZGxlcik7XG5cbiAgICAgICAgLy8gaGFuZGxlIHJlY2VpcHRzXG4gICAgICAgIHNvY2tldC5vbignc3luYycsIGZ1bmN0aW9uKHJlY29yZHMpIHtcbiAgICAgICAgICAgIHN5bmNIYW5kbGVyKHJlY29yZHMsIGZ1bmN0aW9uKG1vZGVsKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5lbWl0KCdyZWNlaXB0OnN5bmMnKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICAgICAgc29ja2V0Lm9uKCdyZWNlaXB0OnBvc3QnLCBmdW5jdGlvbihyZWNvcmQpIHtcbiAgICAgICAgICAgIHBvc3RIYW5kbGVyKHJlY29yZCwgZnVuY3Rpb24obW9kZWwpIHtcbiAgICAgICAgICAgICAgICBtb2RlbC5lbWl0KCdyZWNlaXB0OnBvc3QnLCBtb2RlbCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgICAgIHNvY2tldC5vbigncmVjZWlwdDpwdXQnLCBmdW5jdGlvbihkYXRhKSB7XG4gICAgICAgICAgICBwdXRIYW5kbGVyKGRhdGEsIGZ1bmN0aW9uKG1vZGVsKSB7XG4gICAgICAgICAgICAgICAgbW9kZWwuZW1pdCgncmVjZWlwdDpwdXQnLCBtb2RlbCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgICAgIHNvY2tldC5vbigncmVjZWlwdDpkZWxldGUnLCBmdW5jdGlvbihyZWNvcmQpIHtcbiAgICAgICAgICAgIGRlbGV0ZUhhbmRsZXIocmVjb3JkLCBmdW5jdGlvbihtb2RlbCkge1xuICAgICAgICAgICAgICAgIG1vZGVsLmVtaXQoJ3JlY2VpcHQ6ZGVsZXRlJywgbW9kZWwpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgICAgICBzb2NrZXQub24oJ3JlY2VpcHQ6Y2xlYXInLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGNsZWFySGFuZGxlcihmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICBzZWxmLmVtaXQoJ3JlY2VpcHQ6Y2xlYXInKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICAgICAgc29ja2V0Lm9uKCdyZWNlaXB0Omxpc3RlbicsIGZ1bmN0aW9uKGNoYW5uZWwpIHtcbiAgICAgICAgICAgIGxpc3RlbkhhbmRsZXIoY2hhbm5lbCwgZnVuY3Rpb24oY2hhbm5lbCkge1xuICAgICAgICAgICAgICAgIHNlbGYuZW1pdCgncmVjZWlwdDpsaXN0ZW46JyArIGNoYW5uZWwsIGNoYW5uZWwpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgICAgICBzb2NrZXQub24oJ3JlY2VpcHQ6dW5saXN0ZW4nLCBmdW5jdGlvbihjaGFubmVsKSB7XG4gICAgICAgICAgICB1bmxpc3RlbkhhbmRsZXIoY2hhbm5lbCwgZnVuY3Rpb24oY2hhbm5lbCkge1xuICAgICAgICAgICAgICAgIHNlbGYuZW1pdCgncmVjZWlwdDp1bmxpc3RlbjonICsgY2hhbm5lbCwgY2hhbm5lbCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgICAgIHNvY2tldC5vbigncmVjZWlwdDpicm9hZGNhc3QnLCBmdW5jdGlvbihkYXRhKSB7XG4gICAgICAgICAgICBicm9hZGNhc3RIYW5kbGVyKGRhdGEsIGZ1bmN0aW9uKGRhdGEpIHtcbiAgICAgICAgICAgICAgICBzZWxmLmVtaXQoJ3JlY2VpcHQ6YnJvYWRjYXN0JywgZGF0YSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgRW5kcG9pbnQucHJvdG90eXBlID0gT2JqZWN0LmNyZWF0ZSh1dGlscy5FZXYucHJvdG90eXBlKTtcblxuICAgIEVuZHBvaW50LnByb3RvdHlwZS5sb2FkID0gZnVuY3Rpb24oY2FsbGJhY2spIHtcbiAgICAgICAgY2FsbGJhY2sgPSBjYWxsYmFjayB8fCBmdW5jdGlvbigpIHt9O1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHRoaXMuX3N0b3JhZ2UuZ2V0KGZ1bmN0aW9uKGVyciwgZGF0YXMpIHtcbiAgICAgICAgICAgIHZhciBtb2RlbHMgPSBkYXRhcy5tYXAoZnVuY3Rpb24oX21vZGVsKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBzZWxmLl9Nb2RlbChzZWxmLCBfbW9kZWwpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBpZiAoc2VsZi5fZmlsdGVyKSB7XG4gICAgICAgICAgICAgICAgbW9kZWxzID0gdXRpbHMuc2lmdChzZWxmLl9maWx0ZXIsIG1vZGVscyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBzZWxmLm1vZGVscy5zcGxpY2UoMCwgc2VsZi5tb2RlbHMubGVuZ3RoKTtcbiAgICAgICAgICAgIHNlbGYuZW1pdCgnbG9hZCcsIHNlbGYubW9kZWxzKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKCk7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICBFbmRwb2ludC5wcm90b3R5cGUuY29tbWl0ID0gZnVuY3Rpb24oY2FsbGJhY2spIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICBjYWxsYmFjayA9IGNhbGxiYWNrIHx8IGZ1bmN0aW9uKCl7fTtcbiAgICAgICAgdmFyIG1vZGVscyA9IHRoaXMubW9kZWxzLm1hcChmdW5jdGlvbihtb2RlbCkge1xuICAgICAgICAgICAgcmV0dXJuIG1vZGVsLmdldCgpO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5fc3RvcmFnZS5zZXQobW9kZWxzLCBmdW5jdGlvbihlcnIpe1xuICAgICAgICAgICAgaWYoZXJyKSByZXR1cm4gdXRpbHMuaGFuZGxlRXJyb3IoZXJyKTtcbiAgICAgICAgICAgIHNlbGYuZW1pdCgnY29tbWl0Jyk7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICBFbmRwb2ludC5wcm90b3R5cGUuc3Vic2NyaWJlID0gZnVuY3Rpb24ob3B0aW9ucywgY2FsbGJhY2spIHtcbiAgICAgICAgaWYgKHR5cGVvZiBvcHRpb25zID09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIGNhbGxiYWNrID0gb3B0aW9ucztcbiAgICAgICAgICAgIG9wdGlvbnMgPSB7fTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICAgICAgZnVuY3Rpb24gc3ViKCkge1xuICAgICAgICAgICAgc2VsZi5fb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgICAgICAgICBzZWxmLl9maWx0ZXIgPSBzZWxmLl9vcHRpb25zLmZpbHRlcjtcbiAgICAgICAgICAgIHNlbGYuX3NvY2tldC5lbWl0KCdzdWJzY3JpYmUnLCBzZWxmLl9vcHRpb25zKTtcbiAgICAgICAgICAgIHNlbGYuZW1pdCgnc3Vic2NyaWJlZCcpO1xuICAgICAgICAgICAgc2VsZi5fc3Vic2NyaWJlZCA9IHRydWU7XG4gICAgICAgICAgICBzZWxmLnN5bmMoY2FsbGJhY2spO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLl9zdWJzY3JpYmVkKSB7XG4gICAgICAgICAgICB0aGlzLnVuc3Vic2NyaWJlKHN1Yik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzdWIoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9O1xuXG4gICAgRW5kcG9pbnQucHJvdG90eXBlLnVuc3Vic2NyaWJlID0gZnVuY3Rpb24oY2FsbGJhY2spIHtcbiAgICAgICAgaWYgKGNhbGxiYWNrKSB0aGlzLl9zb2NrZXQub25jZSgndW5zdWJzY3JpYmUnLCBjYWxsYmFjayk7XG4gICAgICAgIHRoaXMubW9kZWxzLnNwbGljZSgwLCB0aGlzLm1vZGVscy5sZW5ndGgpO1xuICAgICAgICB0aGlzLl9zb2NrZXQuZW1pdCgndW5zdWJzY3JpYmUnKTtcbiAgICAgICAgdGhpcy5lbWl0KCd1bnN1YnNjcmliZWQnKTtcbiAgICAgICAgdGhpcy5fc3Vic2NyaWJlZCA9IGZhbHNlO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9O1xuXG4gICAgRW5kcG9pbnQucHJvdG90eXBlLnN5bmMgPSBmdW5jdGlvbihjYWxsYmFjaykge1xuICAgICAgICB0aGlzLmxvYWQoKTtcbiAgICAgICAgdmFyIHVuc3luY2VkID0gdGhpcy5tb2RlbHMuZmlsdGVyKGZ1bmN0aW9uKG1vZGVsKSB7XG4gICAgICAgICAgICByZXR1cm4gIW1vZGVsLm1ldGEuc3luY2VkO1xuICAgICAgICB9KS5tYXAoZnVuY3Rpb24obW9kZWwpIHtcbiAgICAgICAgICAgIHJldHVybiBtb2RlbC5nZXQoKTtcbiAgICAgICAgfSk7XG4gICAgICAgIGlmIChjYWxsYmFjaykgdGhpcy5vbmNlKCdyZWNlaXB0OnN5bmMnLCBjYWxsYmFjayk7XG4gICAgICAgIHRoaXMuX3NvY2tldC5lbWl0KCdzeW5jJywgdW5zeW5jZWQpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9O1xuXG4gICAgRW5kcG9pbnQucHJvdG90eXBlLnBvc3QgPVxuICAgIEVuZHBvaW50LnByb3RvdHlwZS5jcmVhdGUgPVxuICAgICAgICBmdW5jdGlvbihyZWNvcmQsIGNhbGxiYWNrKSB7XG4gICAgICAgICAgICB2YXIgbW9kZWwgPSBuZXcgdGhpcy5fTW9kZWwodGhpcywgcmVjb3JkKTtcbiAgICAgICAgICAgIGlmIChjYWxsYmFjaykgbW9kZWwub25jZSgncmVjZWlwdDpwb3N0JywgY2FsbGJhY2spO1xuICAgICAgICAgICAgbW9kZWwucG9zdCgpO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfTtcblxuICAgIEVuZHBvaW50LnByb3RvdHlwZS5wdXQgPSBmdW5jdGlvbihpZCwgcmVjb3JkLCBjYWxsYmFjaykge1xuICAgICAgICB2YXIgbW9kZWwgPSB0aGlzLmZpbmQoaWQpO1xuICAgICAgICBpZiAobW9kZWwpIHtcbiAgICAgICAgICAgIGlmIChjYWxsYmFjaykgbW9kZWwub25jZSgncmVjZWlwdDpwdXQnLCBjYWxsYmFjayk7XG4gICAgICAgICAgICBtb2RlbC5wdXQocmVjb3JkKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9O1xuXG4gICAgRW5kcG9pbnQucHJvdG90eXBlLmRlbGV0ZSA9IGZ1bmN0aW9uKGlkLCBjYWxsYmFjaykge1xuICAgICAgICB2YXIgbW9kZWwgPSB0aGlzLmZpbmQoaWQpO1xuICAgICAgICBpZiAobW9kZWwpIHtcbiAgICAgICAgICAgIGlmIChjYWxsYmFjaykgbW9kZWwub25jZSgncmVjZWlwdDpkZWxldGUnLCBjYWxsYmFjayk7XG4gICAgICAgICAgICBtb2RlbC5kZWxldGUoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9O1xuXG4gICAgRW5kcG9pbnQucHJvdG90eXBlLmNsZWFyID0gZnVuY3Rpb24oY2FsbGJhY2spIHtcbiAgICAgICAgaWYgKGNhbGxiYWNrKSB0aGlzLl9zb2NrZXQub25jZSgncmVjZWlwdDpjbGVhcicsIGNhbGxiYWNrKTtcbiAgICAgICAgdGhpcy5fc29ja2V0LmVtaXQoJ2NsZWFyJyk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH07XG5cbiAgICBFbmRwb2ludC5wcm90b3R5cGUubGlzdGVuID0gZnVuY3Rpb24oY2hhbm5lbCwgY2FsbGJhY2spIHtcbiAgICAgICAgaWYgKGNhbGxiYWNrKSB0aGlzLm9uY2UoJ3JlY2VpcHQ6bGlzdGVuOicgKyBjaGFubmVsLCBjYWxsYmFjayk7XG4gICAgICAgIHRoaXMuX3NvY2tldC5lbWl0KCdsaXN0ZW4nLCBjaGFubmVsKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfTtcblxuICAgIEVuZHBvaW50LnByb3RvdHlwZS51bmxpc3RlbiA9IGZ1bmN0aW9uKGNoYW5uZWwsIGNhbGxiYWNrKSB7XG4gICAgICAgIGlmIChjYWxsYmFjaykgdGhpcy5vbmNlKCdyZWNlaXB0OnVubGlzdGVuOicgKyBjaGFubmVsLCBjYWxsYmFjayk7XG4gICAgICAgIHRoaXMuX3NvY2tldC5lbWl0KCd1bmxpc3RlbicsIGNoYW5uZWwpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9O1xuXG4gICAgRW5kcG9pbnQucHJvdG90eXBlLmJyb2FkY2FzdCA9IGZ1bmN0aW9uKGNoYW5uZWwsIHBheWxvYWQsIGNhbGxiYWNrKSB7XG4gICAgICAgIGlmIChjYWxsYmFjaykgdGhpcy5vbmNlKCdyZWNlaXB0OmJyb2FkY2FzdCcsIGNhbGxiYWNrKTtcbiAgICAgICAgdGhpcy5fc29ja2V0LmVtaXQoJ2Jyb2FkY2FzdCcsIHtcbiAgICAgICAgICAgIGNoYW5uZWw6IGNoYW5uZWwsXG4gICAgICAgICAgICBwYXlsb2FkOiBwYXlsb2FkXG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9O1xuXG4gICAgRW5kcG9pbnQucHJvdG90eXBlLmNsb3NlID0gZnVuY3Rpb24oY2FsbGJhY2spIHtcbiAgICAgICAgaWYgKGNhbGxiYWNrKSB0aGlzLl9zb2NrZXQub25jZSgnY2xvc2UnLCBjYWxsYmFjayk7XG4gICAgICAgIHRoaXMuX3NvY2tldC5jbG9zZSgnY2xvc2UnKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfTtcblxuICAgIEVuZHBvaW50LnByb3RvdHlwZS5maW5kID0gZnVuY3Rpb24oaWQpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMubW9kZWxzLmZpbHRlcihmdW5jdGlvbihtb2RlbCkge1xuICAgICAgICAgICAgcmV0dXJuIG1vZGVsLmlkID09IGlkO1xuICAgICAgICB9KS5wb3AoKTtcbiAgICB9O1xuXG4gICAgRW5kcG9pbnQucHJvdG90eXBlLndoZXJlID0gZnVuY3Rpb24oZmlsdGVyKSB7XG4gICAgICAgIHJldHVybiBuZXcgUXVlcnkodGhpcywgZmlsdGVyKTtcbiAgICB9O1xuXG4gICAgbW9kdWxlLmV4cG9ydHMgPSBFbmRwb2ludDtcblxufSkodGhpcyk7IiwiKGZ1bmN0aW9uKCkge1xuXG4gICAgdmFyIGxvY2FsV3JhcHBlckZhY3RvcnkgPSByZXF1aXJlKCcuL2xvY2FsV3JhcHBlckZhY3RvcnknKTtcbiAgICAvLyB2YXIgaW5kZXhlZGRiID0gcmVxdWlyZSgnLi9pbmRleGVkZGInKTtcbiAgICB2YXIgbWVtb3J5ID0gcmVxdWlyZSgnLi9tZW1vcnknKTtcbiAgICB2YXIgampsYyA9IHJlcXVpcmUoJy4vampsYycpO1xuICAgIHZhciBsb2NhbFN0b3JhZ2UgPSAodHlwZW9mIGxvY2FsU3RvcmFnZSAhPT0gJ3VuZGVmaW5lZCcpID8gbG9jYWxTdG9yYWdlIDogKHJlcXVpcmUoJ25vZGUtbG9jYWxzdG9yYWdlJykpO1xuICAgIHZhciBkcml2ZXJzID0ge1xuICAgICAgICBqamxjOiBsb2NhbFdyYXBwZXJGYWN0b3J5KGpqbGMpLFxuICAgICAgICBtZW1vcnk6IGxvY2FsV3JhcHBlckZhY3RvcnkobWVtb3J5KSxcbiAgICAgICAgbG9jYWxTdG9yYWdlOiBsb2NhbFdyYXBwZXJGYWN0b3J5KGxvY2FsU3RvcmFnZSksXG4gICAgfTtcblxuICAgIGZ1bmN0aW9uIFN0b3JhZ2UocGF0aCwgb3B0aW9ucykge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHRoaXMub3B0aW9ucyA9IG9wdGlvbnM7XG4gICAgICAgIHRoaXMuYm9vdGVkID0gZmFsc2U7XG4gICAgICAgIHRoaXMuZHJpdmVyID0gbmV3IGRyaXZlcnNbb3B0aW9ucy5kcml2ZXJdKHBhdGgsIG9wdGlvbnMpO1xuICAgICAgICB0aGlzLmRyaXZlci5ib290KGZ1bmN0aW9uKGVycikge1xuICAgICAgICAgICAgaWYoZXJyKSB0aHJvdyBlcnI7XG4gICAgICAgICAgICBzZWxmLmJvb3RlZCA9IHRydWU7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIFN0b3JhZ2UucHJvdG90eXBlLmdldCA9IGZ1bmN0aW9uKGNhbGxiYWNrKSB7XG4gICAgICAgIGNhbGxiYWNrID0gY2FsbGJhY2sgfHwgZnVuY3Rpb24oKSB7fTtcbiAgICAgICAgdGhpcy5kcml2ZXIuZ2V0KGNhbGxiYWNrKTtcbiAgICB9O1xuXG4gICAgU3RvcmFnZS5wcm90b3R5cGUuc2V0ID0gZnVuY3Rpb24oZGF0YXMsIGNhbGxiYWNrKSB7XG4gICAgICAgIGNhbGxiYWNrID0gY2FsbGJhY2sgfHwgZnVuY3Rpb24oKSB7fTtcbiAgICAgICAgdGhpcy5kcml2ZXIuc2V0KGRhdGFzLCBjYWxsYmFjayk7XG4gICAgfTtcblxuICAgIFN0b3JhZ2UucHJvdG90eXBlLndoZXJlID0gZnVuY3Rpb24ocXVlcnksIGNhbGxiYWNrKSB7XG4gICAgICAgIGNhbGxiYWNrID0gY2FsbGJhY2sgfHwgZnVuY3Rpb24oKSB7fTtcbiAgICAgICAgdGhpcy5kcml2ZXIud2hlcmUocXVlcnksIGNhbGxiYWNrKTtcbiAgICB9O1xuXG4gICAgU3RvcmFnZS5wcm90b3R5cGUuY2xlYXIgPSBmdW5jdGlvbihjYWxsYmFjaykge1xuICAgICAgICBjYWxsYmFjayA9IGNhbGxiYWNrIHx8IGZ1bmN0aW9uKCkge307XG4gICAgICAgIHRoaXMuZHJpdmVyLmNsZWFyKGNhbGxiYWNrKTtcbiAgICB9O1xuXG4gICAgbW9kdWxlLmV4cG9ydHMgPSBTdG9yYWdlO1xuXG59KSh0aGlzKTsiLCIoZnVuY3Rpb24oKSB7XG5cbiAgICB2YXIgbG9jYWxTdG9yYWdlID0gKHR5cGVvZiBsb2NhbFN0b3JhZ2UgIT09ICd1bmRlZmluZWQnKSA/IGxvY2FsU3RvcmFnZSA6IChyZXF1aXJlKCdub2RlLWxvY2Fsc3RvcmFnZScpKTtcblxuICAgIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9rLXlhay9KSkxDL2Jsb2IvbWFzdGVyL3NjcmlwdHMvampsYy5kZXYuanNcbiAgICB2YXIgcmVnZXggPSAvXFxcIlthLXpBLVowLTldKlxcXCI6L2csXG4gICAgICAgIHNlcGFyYXRvciA9ICfCoycsXG4gICAgICAgIGRpY3RzID0ge307XG5cbiAgICBmdW5jdGlvbiBfc29ydGVkQnlWYWx1ZShvYmopIHtcbiAgICAgICAgdmFyIHR1cGxlcyA9IFtdLFxuICAgICAgICAgICAgbmV3T2JqID0ge30sXG4gICAgICAgICAgICBrZXk7XG4gICAgICAgIGZvciAoa2V5IGluIG9iaikge1xuICAgICAgICAgICAgdHVwbGVzLnB1c2goW2tleSwgb2JqW2tleV1dKTtcbiAgICAgICAgfVxuICAgICAgICB0dXBsZXMuc29ydChmdW5jdGlvbihhLCBiKSB7XG4gICAgICAgICAgICByZXR1cm4gYlsxXSAtIGFbMV07XG4gICAgICAgIH0pO1xuICAgICAgICBmb3IgKGtleSBpbiB0dXBsZXMpIHtcbiAgICAgICAgICAgIG5ld09ialt0dXBsZXNba2V5XVswXV0gPSB0dXBsZXNba2V5XVsxXTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmV3T2JqO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIF9pbmNDaGFyKHMpIHtcbiAgICAgICAgdmFyIGMgPSBzW3MubGVuZ3RoIC0gMV0sXG4gICAgICAgICAgICBwID0gcy5zdWJzdHJpbmcoMCwgcy5sZW5ndGggLSAxKSxcbiAgICAgICAgICAgIG5leHRJZDtcbiAgICAgICAgaWYgKHR5cGVvZiBjID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgbmV4dElkID0gJ2EnO1xuICAgICAgICB9IGVsc2UgaWYgKGMgPT09ICd6Jykge1xuICAgICAgICAgICAgbmV4dElkID0gJ0EnO1xuICAgICAgICB9IGVsc2UgaWYgKGMgPT09ICdaJykge1xuICAgICAgICAgICAgbmV4dElkID0gJ2EnO1xuICAgICAgICAgICAgaWYgKHAgIT09ICcnKSB7XG4gICAgICAgICAgICAgICAgcCA9IF9pbmNDaGFyKHApO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBwID0gJ2EnO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbmV4dElkID0gU3RyaW5nLmZyb21DaGFyQ29kZShjLmNoYXJDb2RlQXQoMCkgKyAxKTtcbiAgICAgICAgfVxuICAgICAgICBjID0gbmV4dElkO1xuICAgICAgICByZXR1cm4gcCArIGM7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gX2NyZWF0ZURpY3Qocykge1xuICAgICAgICB2YXIgZGljdCA9IHt9LFxuICAgICAgICAgICAgY3VySWQgPSAnJyxcbiAgICAgICAgICAgIG0gPSBzLm1hdGNoKHJlZ2V4KSxcbiAgICAgICAgICAgIGtleSxcbiAgICAgICAgICAgIHNidjtcbiAgICAgICAgZm9yIChrZXkgaW4gbSkge1xuICAgICAgICAgICAgaWYgKG1ba2V5XS5sZW5ndGggPiAoY3VySWQubGVuZ3RoICsgMikpIHtcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGRpY3RbbVtrZXldXSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgICAgICAgICAgZGljdFttW2tleV1dICs9IDE7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgZGljdFttW2tleV1dID0gMDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgc2J2ID0gX3NvcnRlZEJ5VmFsdWUoZGljdCk7XG4gICAgICAgIGZvciAoa2V5IGluIHNidikge1xuICAgICAgICAgICAgY3VySWQgPSBfaW5jQ2hhcihjdXJJZCk7XG4gICAgICAgICAgICBzYnZba2V5XSA9IHNlcGFyYXRvciArIGN1cklkICsgc2VwYXJhdG9yO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBzYnY7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gX2NvbXByZXNzKHYsIGRpY3QpIHtcbiAgICAgICAgdmFyIGlkLFxuICAgICAgICAgICAgcmU7XG4gICAgICAgIGZvciAoaWQgaW4gZGljdCkge1xuICAgICAgICAgICAgcmUgPSBuZXcgUmVnRXhwKGlkLCAnZycpO1xuICAgICAgICAgICAgdiA9IHYucmVwbGFjZShyZSwgZGljdFtpZF0pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB2O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIF9kZWNvbXByZXNzKHYsIGRpY3QpIHtcbiAgICAgICAgdmFyIGlkLFxuICAgICAgICAgICAgcmU7XG4gICAgICAgIGZvciAoaWQgaW4gZGljdCkge1xuICAgICAgICAgICAgcmUgPSBuZXcgUmVnRXhwKGRpY3RbaWRdLCAnZycpO1xuICAgICAgICAgICAgdiA9IHYucmVwbGFjZShyZSwgaWQpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB2O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIEpKTEMoKSB7XG4gICAgICAgIHRoaXMuc2V0SXRlbSA9IGZ1bmN0aW9uKGtleSwgc3RyLCBucykge1xuICAgICAgICAgICAgdmFyIGNvbXByZXNzZWQsXG4gICAgICAgICAgICAgICAgc09iamVjdCxcbiAgICAgICAgICAgICAgICBkaWN0O1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBucyA9PT0gJ3VuZGVmaW5lZCcgfHwgbnMgIT09ICduby1iZWF1dGlmeScpIHtcbiAgICAgICAgICAgICAgICBzT2JqZWN0ID0gSlNPTi5wYXJzZShzdHIpO1xuICAgICAgICAgICAgICAgIHN0ciA9IEpTT04uc3RyaW5naWZ5KHNPYmplY3QpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZGljdCA9IF9jcmVhdGVEaWN0KHN0cik7XG4gICAgICAgICAgICBjb21wcmVzc2VkID0gX2NvbXByZXNzKHN0ciwgZGljdCk7XG4gICAgICAgICAgICBpZiAodHlwZW9mIG5zICE9PSAndW5kZWZpbmVkJyAmJiBucyA9PT0gJ2xvY2FsLWRpY3QnKSB7XG4gICAgICAgICAgICAgICAgZGljdHNba2V5XSA9IGRpY3Q7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKGtleSwgY29tcHJlc3NlZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodHlwZW9mIGRpY3RzW2tleV0gPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ2RfJyArIGtleSwgSlNPTi5zdHJpbmdpZnkoZGljdCkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGNvbXByZXNzZWQ7XG4gICAgICAgIH07XG4gICAgICAgIHRoaXMuZ2V0SXRlbSA9IGZ1bmN0aW9uKGtleSkge1xuICAgICAgICAgICAgdmFyIGRpY3Q7XG4gICAgICAgICAgICB2YXIgY29tcHJlc3NlZCA9IGxvY2FsU3RvcmFnZS5nZXRJdGVtKGtleSk7XG4gICAgICAgICAgICBpZiAodHlwZW9mIGRpY3RzW2tleV0gPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICAgICAgZGljdCA9IEpTT04ucGFyc2UobG9jYWxTdG9yYWdlLmdldEl0ZW0oJ2RfJyArIGtleSkpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBkaWN0ID0gZGljdHNba2V5XTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBfZGVjb21wcmVzcyhjb21wcmVzc2VkLCBkaWN0KTtcbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy5nZXREaWN0ID0gZnVuY3Rpb24oa2V5KSB7XG4gICAgICAgICAgICB2YXIgZGljdDtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgZGljdHNba2V5XSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgICAgICBkaWN0ID0gSlNPTi5wYXJzZShsb2NhbFN0b3JhZ2UuZ2V0SXRlbSgnZF8nICsga2V5KSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGRpY3QgPSBkaWN0c1trZXldO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGRpY3Q7XG4gICAgICAgIH07XG4gICAgICAgIHRoaXMuc2V0RGljdCA9IGZ1bmN0aW9uKGtleSwgZGljLCBucykge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBucyA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnZF8nICsga2V5LCBkaWMpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBkaWN0c1trZXldID0gZGljO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgIH1cblxuICAgIG1vZHVsZS5leHBvcnRzID0gbmV3IEpKTEMoKTtcblxufSkodGhpcyk7IiwiKGZ1bmN0aW9uKCl7XG4gICAgXCJ1c2Ugc3RyaWN0XCI7XG5cbiAgICBmdW5jdGlvbiBsb2NhbFdyYXBwZXJGYWN0b3J5KHN0b3JhZ2UpIHtcblxuICAgICAgICBmdW5jdGlvbiBMb2NhbFdyYXBwZXIocGF0aCwgb3B0aW9ucykge1xuICAgICAgICAgICAgdGhpcy5zdG9yYWdlID0gc3RvcmFnZTtcbiAgICAgICAgICAgIHRoaXMuYm9vdGVkID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLnBhdGggPSBwYXRoO1xuICAgICAgICAgICAgdGhpcy5vcHRpb25zID0gb3B0aW9ucztcbiAgICAgICAgfVxuXG4gICAgICAgIExvY2FsV3JhcHBlci5wcm90b3R5cGUuYm9vdCA9IGZ1bmN0aW9uKGNhbGxiYWNrKSB7XG4gICAgICAgICAgICB0aGlzLmJvb3RlZCA9IHRydWU7XG4gICAgICAgICAgICBpZihjYWxsYmFjaykge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKG51bGwpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIExvY2FsV3JhcHBlci5wcm90b3R5cGUuZ2V0ID0gZnVuY3Rpb24oY2FsbGJhY2spIHtcbiAgICAgICAgICAgIGNhbGxiYWNrID0gY2FsbGJhY2sgfHwgZnVuY3Rpb24oKSB7fTtcbiAgICAgICAgICAgIHZhciBkYXRhcyA9IHRoaXMuc3RvcmFnZS5nZXRJdGVtKHRoaXMucGF0aCk7XG4gICAgICAgICAgICBpZiAoIWRhdGFzKSB7XG4gICAgICAgICAgICAgICAgZGF0YXMgPSAnW10nO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZGF0YXMgPSBKU09OLnBhcnNlKGRhdGFzKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIGRhdGFzKTtcbiAgICAgICAgfTtcblxuICAgICAgICBMb2NhbFdyYXBwZXIucHJvdG90eXBlLnNldCA9IGZ1bmN0aW9uKGRhdGFzLCBjYWxsYmFjaykge1xuICAgICAgICAgICAgY2FsbGJhY2sgPSBjYWxsYmFjayB8fCBmdW5jdGlvbigpIHt9O1xuICAgICAgICAgICAgZGF0YXMgPSBKU09OLnN0cmluZ2lmeShkYXRhcyk7XG4gICAgICAgICAgICB0aGlzLnN0b3JhZ2Uuc2V0SXRlbSh0aGlzLnBhdGgsIGRhdGFzKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwpO1xuICAgICAgICB9O1xuXG4gICAgICAgIExvY2FsV3JhcHBlci5wcm90b3R5cGUud2hlcmUgPSBmdW5jdGlvbihxdWVyeSwgY2FsbGJhY2spIHtcbiAgICAgICAgICAgIGNhbGxiYWNrID0gY2FsbGJhY2sgfHwgZnVuY3Rpb24oKSB7fTtcbiAgICAgICAgICAgIHRoaXMuZ2V0KGZ1bmN0aW9uKGVyciwgZGF0YXMpIHtcbiAgICAgICAgICAgICAgICBpZiAoZXJyKSByZXR1cm4gY2FsbGJhY2soZXJyKTtcbiAgICAgICAgICAgICAgICBkYXRhcyA9IHV0aWxzLnNpZnQocXVlcnksIGRhdGFzKTtcbiAgICAgICAgICAgICAgICBjYWxsYmFjayhudWxsLCBkYXRhcyk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfTtcblxuICAgICAgICBMb2NhbFdyYXBwZXIucHJvdG90eXBlLmNsZWFyID0gZnVuY3Rpb24oY2FsbGJhY2spIHtcbiAgICAgICAgICAgIGNhbGxiYWNrID0gY2FsbGJhY2sgfHwgZnVuY3Rpb24oKSB7fTtcbiAgICAgICAgICAgIHRoaXMuc2V0KFtdLCBmdW5jdGlvbihlcnIpIHtcbiAgICAgICAgICAgICAgICBpZiAoZXJyKSByZXR1cm4gY2FsbGJhY2soZXJyKTtcbiAgICAgICAgICAgICAgICBjYWxsYmFjayhudWxsKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9O1xuXG4gICAgICAgIHJldHVybiBMb2NhbFdyYXBwZXI7XG4gICAgfVxuXG4gICAgbW9kdWxlLmV4cG9ydHMgPSBsb2NhbFdyYXBwZXJGYWN0b3J5O1xuXG59KSh0aGlzKTsiLCIoZnVuY3Rpb24oKXtcbiAgICB2YXIgc3RvcmFnZSA9IHt9O1xuICAgIG1vZHVsZS5leHBvcnRzID0ge1xuICAgICAgICBnZXRJdGVtOiBmdW5jdGlvbihwYXRoKSB7XG4gICAgICAgICAgICBpZighc3RvcmFnZVtwYXRoXSkge1xuICAgICAgICAgICAgICAgIC8vIGxvY2FsU3RvcmFnZSBzYXZlcyBkYXRhIGluIHN0cmluZ1xuICAgICAgICAgICAgICAgIHN0b3JhZ2VbcGF0aF0gPSAnJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBzdG9yYWdlW3BhdGhdO1xuICAgICAgICB9LFxuICAgICAgICBzZXRJdGVtOiBmdW5jdGlvbihwYXRoLCB2YWx1ZSkge1xuICAgICAgICAgICAgc3RvcmFnZVtwYXRoXSA9IHZhbHVlO1xuICAgICAgICB9XG4gICAgfTtcbn0pKHRoaXMpOyIsIihmdW5jdGlvbigpIHtcbiAgICBcInVzZSBzdHJpY3RcIjtcblxuICAgIC8vIGh0dHA6Ly9hbmRyZXdkdXBvbnQubmV0LzIwMDkvMDgvMjgvZGVlcC1leHRlbmRpbmctb2JqZWN0cy1pbi1qYXZhc2NyaXB0L1xuICAgIGZ1bmN0aW9uIGRlZXBFeHRlbmQoZGVzdGluYXRpb24sIHNvdXJjZSkge1xuICAgICAgICBmb3IgKHZhciBwcm9wZXJ0eSBpbiBzb3VyY2UpIHtcbiAgICAgICAgICAgIGlmIChzb3VyY2VbcHJvcGVydHldICYmIHNvdXJjZVtwcm9wZXJ0eV0uY29uc3RydWN0b3IgJiZcbiAgICAgICAgICAgICAgICBzb3VyY2VbcHJvcGVydHldLmNvbnN0cnVjdG9yID09PSBPYmplY3QpIHtcbiAgICAgICAgICAgICAgICBkZXN0aW5hdGlvbltwcm9wZXJ0eV0gPSBkZXN0aW5hdGlvbltwcm9wZXJ0eV0gfHwge307XG4gICAgICAgICAgICAgICAgZGVlcEV4dGVuZChkZXN0aW5hdGlvbltwcm9wZXJ0eV0sIHNvdXJjZVtwcm9wZXJ0eV0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBkZXN0aW5hdGlvbltwcm9wZXJ0eV0gPSBzb3VyY2VbcHJvcGVydHldO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBkZXN0aW5hdGlvbjtcbiAgICB9XG5cbiAgICBtb2R1bGUuZXhwb3J0cyA9IGRlZXBFeHRlbmQ7XG59KSh0aGlzKTsiLCIoZnVuY3Rpb24oKXtcbiAgICBcInVzZSBzdHJpY3RcIjtcblxuICAgIGZ1bmN0aW9uIEVldiAoKSB7XG4gICAgICAgIHRoaXMuX2V2ZW50cyA9IHt9O1xuICAgIH1cblxuICAgIEVldi5wcm90b3R5cGUgPSB7XG4gICAgICAgIG9uOiBmdW5jdGlvbihuYW1lcywgZm4pIHtcbiAgICAgICAgICAgIHZhciBtZSA9IHRoaXM7XG4gICAgICAgICAgICBuYW1lcy5zcGxpdCgvXFxzKy9nKS5mb3JFYWNoKGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYoIW1lLl9ldmVudHNbbmFtZV0pIG1lLl9ldmVudHNbbmFtZV0gPSBbXTtcbiAgICAgICAgICAgICAgICBtZS5fZXZlbnRzW25hbWVdLnB1c2goZm4pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgfSxcblxuICAgICAgICBvZmY6IGZ1bmN0aW9uKG5hbWVzLCBmbikge1xuICAgICAgICAgICAgdmFyIG1lID0gdGhpcztcbiAgICAgICAgICAgIG5hbWVzLnNwbGl0KC9cXHMrL2cpLmZvckVhY2goZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgICAgICAgIHZhciBsaXN0ID0gbWUuX2V2ZW50c1tuYW1lXTtcbiAgICAgICAgICAgICAgICBpZihsaXN0KSB7XG4gICAgICAgICAgICAgICAgICAgIG1lLl9ldmVudHNbbmFtZV0gPSBtZS5fZXZlbnRzW25hbWVdLmZpbHRlcihmdW5jdGlvbihmbil7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZm4gIT09IGZuO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICB9LFxuXG4gICAgICAgIG9uY2U6IGZ1bmN0aW9uKG5hbWVzLCBmbikge1xuICAgICAgICAgICAgdmFyIG1lID0gdGhpcztcbiAgICAgICAgICAgIG5hbWVzLnNwbGl0KC9cXHMrL2cpLmZvckVhY2goZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZighbWUuX2V2ZW50c1tuYW1lXSkgbWUuX2V2ZW50c1tuYW1lXSA9IFtdO1xuICAgICAgICAgICAgICAgIGZuLl9jYWxsT25jZSA9IHRydWU7XG4gICAgICAgICAgICAgICAgbWUuX2V2ZW50c1tuYW1lXS5wdXNoKGZuKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIH0sXG5cbiAgICAgICAgZW1pdDogZnVuY3Rpb24obmFtZSwgZGF0YSwgY29udGV4dCkge1xuICAgICAgICAgICAgdmFyIG1lID0gdGhpcztcbiAgICAgICAgICAgIGNvbnRleHQgPSBjb250ZXh0IHx8IHRoaXM7XG4gICAgICAgICAgICB2YXIgZXZ0ID0gdGhpcy5fZXZlbnRzW25hbWVdIHx8ICh0aGlzLl9ldmVudHNbbmFtZV0gPSBbXSk7XG4gICAgICAgICAgICBldnQuZm9yRWFjaChmdW5jdGlvbihmbil7XG4gICAgICAgICAgICAgICAgaWYoZm4uX2NhbGxPbmNlKSB7XG4gICAgICAgICAgICAgICAgICAgIGRlbGV0ZSBmbi5fY2FsbE9uY2U7XG4gICAgICAgICAgICAgICAgICAgIGZuLmNhbGwoY29udGV4dCwgZGF0YSk7XG4gICAgICAgICAgICAgICAgICAgIG1lLm9mZihuYW1lLCBmbik7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBtZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZm4uY2FsbChjb250ZXh0LCBkYXRhKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgbW9kdWxlLmV4cG9ydHMgPSBFZXY7XG59KSh0aGlzKTsiLCIoZnVuY3Rpb24oKSB7XG4gICAgXCJ1c2Ugc3RyaWN0XCI7XG5cbiAgICB2YXIgdXRpbHMgPSB7fTtcblxuICAgIHV0aWxzLnNpZnQgPSByZXF1aXJlKCcuL3NpZnQnKTtcblxuICAgIHV0aWxzLnV1aWQgPSByZXF1aXJlKCcuL3V1aWQnKTtcblxuICAgIHV0aWxzLkVldiA9IHJlcXVpcmUoJy4vZWV2Jyk7XG5cbiAgICB1dGlscy5kZWVwRXh0ZW5kID0gcmVxdWlyZSgnLi9kZWVwRXh0ZW5kJyk7XG5cbiAgICBtb2R1bGUuZXhwb3J0cyA9IHV0aWxzO1xuXG59KSh0aGlzKTsiLCIoZnVuY3Rpb24oKSB7XG4gICAgXCJ1c2Ugc3RyaWN0XCI7XG5cbiAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vY3Jjbi9zaWZ0LmpzL3RyZWUvbWFzdGVyXG5cbiAgICBmdW5jdGlvbiBpc0Z1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdmdW5jdGlvbic7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaXNBcnJheSh2YWx1ZSkge1xuICAgICAgICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHZhbHVlKSA9PT0gJ1tvYmplY3QgQXJyYXldJztcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjb21wYXJhYmxlKHZhbHVlKSB7XG4gICAgICAgIGlmICh2YWx1ZSBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZS5nZXRUaW1lKCk7XG4gICAgICAgIH0gZWxzZSBpZiAodmFsdWUgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgICAgICAgcmV0dXJuIHZhbHVlLm1hcChjb21wYXJhYmxlKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdldChvYmosIGtleSkge1xuICAgICAgICBpZiAob2JqLmdldCkgcmV0dXJuIG9iai5nZXQoa2V5KTtcbiAgICAgICAgcmV0dXJuIG9ialtrZXldO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIG9yKHZhbGlkYXRvcikge1xuICAgICAgICByZXR1cm4gZnVuY3Rpb24oYSwgYikge1xuICAgICAgICAgICAgaWYgKCFpc0FycmF5KGIpIHx8ICFiLmxlbmd0aCkgcmV0dXJuIHZhbGlkYXRvcihhLCBiKTtcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwLCBuID0gYi5sZW5ndGg7IGkgPCBuOyBpKyspXG4gICAgICAgICAgICAgICAgaWYgKHZhbGlkYXRvcihhLCBnZXQoYiwgaSkpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBhbmQodmFsaWRhdG9yKSB7XG4gICAgICAgIHJldHVybiBmdW5jdGlvbihhLCBiKSB7XG4gICAgICAgICAgICBpZiAoIWlzQXJyYXkoYikgfHwgIWIubGVuZ3RoKSByZXR1cm4gdmFsaWRhdG9yKGEsIGIpO1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDAsIG4gPSBiLmxlbmd0aDsgaSA8IG47IGkrKylcbiAgICAgICAgICAgICAgICBpZiAoIXZhbGlkYXRvcihhLCBnZXQoYiwgaSkpKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiB2YWxpZGF0ZSh2YWxpZGF0b3IsIGIpIHtcbiAgICAgICAgcmV0dXJuIHZhbGlkYXRvci52KHZhbGlkYXRvci5hLCBiKTtcbiAgICB9XG5cblxuICAgIHZhciBvcGVyYXRvciA9IHtcblxuICAgICAgICAvKipcbiAgICAgICAgICovXG5cbiAgICAgICAgJGVxOiBvcihmdW5jdGlvbihhLCBiKSB7XG4gICAgICAgICAgICByZXR1cm4gYShiKTtcbiAgICAgICAgfSksXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqL1xuXG4gICAgICAgICRuZTogYW5kKGZ1bmN0aW9uKGEsIGIpIHtcbiAgICAgICAgICAgIHJldHVybiAhYShiKTtcbiAgICAgICAgfSksXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqL1xuXG4gICAgICAgICRvcjogZnVuY3Rpb24oYSwgYikge1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDAsIG4gPSBhLmxlbmd0aDsgaSA8IG47IGkrKylcbiAgICAgICAgICAgICAgICBpZiAodmFsaWRhdGUoZ2V0KGEsIGkpLCBiKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqL1xuXG4gICAgICAgICRndDogb3IoZnVuY3Rpb24oYSwgYikge1xuICAgICAgICAgICAgcmV0dXJuIHNpZnQuY29tcGFyZShjb21wYXJhYmxlKGIpLCBhKSA+IDA7XG4gICAgICAgIH0pLFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKi9cblxuICAgICAgICAkZ3RlOiBvcihmdW5jdGlvbihhLCBiKSB7XG4gICAgICAgICAgICByZXR1cm4gc2lmdC5jb21wYXJlKGNvbXBhcmFibGUoYiksIGEpID49IDA7XG4gICAgICAgIH0pLFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKi9cblxuICAgICAgICAkbHQ6IG9yKGZ1bmN0aW9uKGEsIGIpIHtcbiAgICAgICAgICAgIHJldHVybiBzaWZ0LmNvbXBhcmUoY29tcGFyYWJsZShiKSwgYSkgPCAwO1xuICAgICAgICB9KSxcblxuICAgICAgICAvKipcbiAgICAgICAgICovXG5cbiAgICAgICAgJGx0ZTogb3IoZnVuY3Rpb24oYSwgYikge1xuICAgICAgICAgICAgcmV0dXJuIHNpZnQuY29tcGFyZShjb21wYXJhYmxlKGIpLCBhKSA8PSAwO1xuICAgICAgICB9KSxcblxuICAgICAgICAvKipcbiAgICAgICAgICovXG5cbiAgICAgICAgJG1vZDogb3IoZnVuY3Rpb24oYSwgYikge1xuICAgICAgICAgICAgcmV0dXJuIGIgJSBhWzBdID09IGFbMV07XG4gICAgICAgIH0pLFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKi9cblxuICAgICAgICAkaW46IGZ1bmN0aW9uKGEsIGIpIHtcblxuICAgICAgICAgICAgaWYgKGIgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgICAgICAgICAgIGZvciAodmFyIGkgPSBiLmxlbmd0aDsgaS0tOykge1xuICAgICAgICAgICAgICAgICAgICBpZiAofmEuaW5kZXhPZihjb21wYXJhYmxlKGdldChiLCBpKSkpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiAhIX5hLmluZGV4T2YoY29tcGFyYWJsZShiKSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICovXG5cbiAgICAgICAgJG5pbjogZnVuY3Rpb24oYSwgYikge1xuICAgICAgICAgICAgcmV0dXJuICFvcGVyYXRvci4kaW4oYSwgYik7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqL1xuXG4gICAgICAgICRub3Q6IGZ1bmN0aW9uKGEsIGIpIHtcbiAgICAgICAgICAgIHJldHVybiAhdmFsaWRhdGUoYSwgYik7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqL1xuXG4gICAgICAgICR0eXBlOiBmdW5jdGlvbihhLCBiKSB7XG4gICAgICAgICAgICByZXR1cm4gYiAhPSB2b2lkIDAgPyBiIGluc3RhbmNlb2YgYSB8fCBiLmNvbnN0cnVjdG9yID09IGEgOiBmYWxzZTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICovXG5cbiAgICAgICAgJGFsbDogZnVuY3Rpb24oYSwgYikge1xuICAgICAgICAgICAgaWYgKCFiKSBiID0gW107XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gYS5sZW5ndGg7IGktLTspIHtcbiAgICAgICAgICAgICAgICBpZiAoIX5jb21wYXJhYmxlKGIpLmluZGV4T2YoZ2V0KGEsIGkpKSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqL1xuXG4gICAgICAgICRzaXplOiBmdW5jdGlvbihhLCBiKSB7XG4gICAgICAgICAgICByZXR1cm4gYiA/IGEgPT09IGIubGVuZ3RoIDogZmFsc2U7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqL1xuXG4gICAgICAgICRub3I6IGZ1bmN0aW9uKGEsIGIpIHtcbiAgICAgICAgICAgIC8vIHRvZG8gLSB0aGlzIHN1ZmZpY2U/IHJldHVybiAhb3BlcmF0b3IuJGluKGEpXG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMCwgbiA9IGEubGVuZ3RoOyBpIDwgbjsgaSsrKVxuICAgICAgICAgICAgICAgIGlmICh2YWxpZGF0ZShnZXQoYSwgaSksIGIpKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICovXG5cbiAgICAgICAgJGFuZDogZnVuY3Rpb24oYSwgYikge1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDAsIG4gPSBhLmxlbmd0aDsgaSA8IG47IGkrKylcbiAgICAgICAgICAgICAgICBpZiAoIXZhbGlkYXRlKGdldChhLCBpKSwgYikpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKi9cblxuICAgICAgICAkcmVnZXg6IG9yKGZ1bmN0aW9uKGEsIGIpIHtcbiAgICAgICAgICAgIHJldHVybiB0eXBlb2YgYiA9PT0gJ3N0cmluZycgJiYgYS50ZXN0KGIpO1xuICAgICAgICB9KSxcblxuICAgICAgICAvKipcbiAgICAgICAgICovXG5cbiAgICAgICAgJHdoZXJlOiBmdW5jdGlvbihhLCBiKSB7XG4gICAgICAgICAgICByZXR1cm4gYS5jYWxsKGIsIGIpO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKi9cblxuICAgICAgICAkZWxlbU1hdGNoOiBmdW5jdGlvbihhLCBiKSB7XG4gICAgICAgICAgICBpZiAoaXNBcnJheShiKSkgcmV0dXJuICEhfnNlYXJjaChiLCBhKTtcbiAgICAgICAgICAgIHJldHVybiB2YWxpZGF0ZShhLCBiKTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICovXG5cbiAgICAgICAgJGV4aXN0czogZnVuY3Rpb24oYSwgYikge1xuICAgICAgICAgICAgcmV0dXJuIChiICE9IHZvaWQgMCkgPT09IGE7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgdmFyIHByZXBhcmUgPSB7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqL1xuXG4gICAgICAgICRlcTogZnVuY3Rpb24oYSkge1xuXG4gICAgICAgICAgICBpZiAoYSBpbnN0YW5jZW9mIFJlZ0V4cCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmdW5jdGlvbihiKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0eXBlb2YgYiA9PT0gJ3N0cmluZycgJiYgYS50ZXN0KGIpO1xuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGEgaW5zdGFuY2VvZiBGdW5jdGlvbikge1xuICAgICAgICAgICAgICAgIHJldHVybiBhO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChpc0FycmF5KGEpICYmICFhLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIC8vIFNwZWNpYWwgY2FzZSBvZiBhID09IFtdXG4gICAgICAgICAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKGIpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIChpc0FycmF5KGIpICYmICFiLmxlbmd0aCk7XG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoYSA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmdW5jdGlvbihiKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vd2lsbCBtYXRjaCBib3RoIG51bGwgYW5kIHVuZGVmaW5lZFxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gKGIgPT09IG51bGwgfHwgYiA9PT0gdW5kZWZpbmVkKTtcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gZnVuY3Rpb24oYikge1xuICAgICAgICAgICAgICAgIHJldHVybiBzaWZ0LmNvbXBhcmUoY29tcGFyYWJsZShiKSwgYSkgPT09IDA7XG4gICAgICAgICAgICB9O1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKi9cblxuICAgICAgICAkbmU6IGZ1bmN0aW9uKGEpIHtcbiAgICAgICAgICAgIHJldHVybiBwcmVwYXJlLiRlcShhKTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICovXG5cbiAgICAgICAgJGFuZDogZnVuY3Rpb24oYSkge1xuICAgICAgICAgICAgcmV0dXJuIGEubWFwKHBhcnNlKTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICovXG5cbiAgICAgICAgJG9yOiBmdW5jdGlvbihhKSB7XG4gICAgICAgICAgICByZXR1cm4gYS5tYXAocGFyc2UpO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKi9cblxuICAgICAgICAkbm9yOiBmdW5jdGlvbihhKSB7XG4gICAgICAgICAgICByZXR1cm4gYS5tYXAocGFyc2UpO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKi9cblxuICAgICAgICAkbm90OiBmdW5jdGlvbihhKSB7XG4gICAgICAgICAgICByZXR1cm4gcGFyc2UoYSk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqL1xuXG4gICAgICAgICRyZWdleDogZnVuY3Rpb24oYSwgcXVlcnkpIHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgUmVnRXhwKGEsIHF1ZXJ5LiRvcHRpb25zKTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICovXG5cbiAgICAgICAgJHdoZXJlOiBmdW5jdGlvbihhKSB7XG4gICAgICAgICAgICByZXR1cm4gYTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICovXG5cbiAgICAgICAgJGVsZW1NYXRjaDogZnVuY3Rpb24oYSkge1xuICAgICAgICAgICAgcmV0dXJuIHBhcnNlKGEpO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKi9cblxuICAgICAgICAkZXhpc3RzOiBmdW5jdGlvbihhKSB7XG4gICAgICAgICAgICByZXR1cm4gISFhO1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIGZ1bmN0aW9uIHNlYXJjaChhcnJheSwgdmFsaWRhdG9yKSB7XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcnJheS5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgaWYgKHZhbGlkYXRlKHZhbGlkYXRvciwgZ2V0KGFycmF5LCBpKSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gaTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiAtMTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjcmVhdGVWYWxpZGF0b3IoYSwgdmFsaWRhdGUpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGE6IGEsXG4gICAgICAgICAgICB2OiB2YWxpZGF0ZVxuICAgICAgICB9O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIG5lc3RlZFZhbGlkYXRvcihhLCBiKSB7XG4gICAgICAgIHZhciB2YWx1ZXMgPSBbXTtcbiAgICAgICAgZmluZFZhbHVlcyhiLCBhLmssIDAsIHZhbHVlcyk7XG5cbiAgICAgICAgaWYgKHZhbHVlcy5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICAgIHJldHVybiB2YWxpZGF0ZShhLm52LCB2YWx1ZXNbMF0pO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuICEhfnNlYXJjaCh2YWx1ZXMsIGEubnYpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGZpbmRWYWx1ZXMoY3VycmVudCwga2V5cGF0aCwgaW5kZXgsIHZhbHVlcykge1xuXG4gICAgICAgIGlmIChpbmRleCA9PT0ga2V5cGF0aC5sZW5ndGggfHwgY3VycmVudCA9PSB2b2lkIDApIHtcbiAgICAgICAgICAgIHZhbHVlcy5wdXNoKGN1cnJlbnQpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGsgPSBnZXQoa2V5cGF0aCwgaW5kZXgpO1xuXG4gICAgICAgIC8vIGVuc3VyZSB0aGF0IGlmIGN1cnJlbnQgaXMgYW4gYXJyYXksIHRoYXQgdGhlIGN1cnJlbnQga2V5XG4gICAgICAgIC8vIGlzIE5PVCBhbiBhcnJheSBpbmRleC4gVGhpcyBzb3J0IG9mIHRoaW5nIG5lZWRzIHRvIHdvcms6XG4gICAgICAgIC8vIHNpZnQoeydmb28uMCc6NDJ9LCBbe2ZvbzogWzQyXX1dKTtcbiAgICAgICAgaWYgKGlzQXJyYXkoY3VycmVudCkgJiYgaXNOYU4oTnVtYmVyKGspKSkge1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDAsIG4gPSBjdXJyZW50Lmxlbmd0aDsgaSA8IG47IGkrKykge1xuICAgICAgICAgICAgICAgIGZpbmRWYWx1ZXMoZ2V0KGN1cnJlbnQsIGkpLCBrZXlwYXRoLCBpbmRleCwgdmFsdWVzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGZpbmRWYWx1ZXMoZ2V0KGN1cnJlbnQsIGspLCBrZXlwYXRoLCBpbmRleCArIDEsIHZhbHVlcyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjcmVhdGVOZXN0ZWRWYWxpZGF0b3Ioa2V5cGF0aCwgYSkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgYToge1xuICAgICAgICAgICAgICAgIGs6IGtleXBhdGgsXG4gICAgICAgICAgICAgICAgbnY6IGFcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB2OiBuZXN0ZWRWYWxpZGF0b3JcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBmbGF0dGVuIHRoZSBxdWVyeVxuICAgICAqL1xuXG4gICAgZnVuY3Rpb24gcGFyc2UocXVlcnkpIHtcbiAgICAgICAgcXVlcnkgPSBjb21wYXJhYmxlKHF1ZXJ5KTtcblxuICAgICAgICBpZiAoIXF1ZXJ5IHx8IChxdWVyeS5jb25zdHJ1Y3Rvci50b1N0cmluZygpICE9PSAnT2JqZWN0JyAmJlxuICAgICAgICAgICAgcXVlcnkuY29uc3RydWN0b3IudG9TdHJpbmcoKS5yZXBsYWNlKC9cXG4vZywgJycpLnJlcGxhY2UoLyAvZywgJycpICE9PSAnZnVuY3Rpb25PYmplY3QoKXtbbmF0aXZlY29kZV19JykpIHsgLy8gY3Jvc3MgYnJvd3NlciBzdXBwb3J0XG4gICAgICAgICAgICBxdWVyeSA9IHtcbiAgICAgICAgICAgICAgICAkZXE6IHF1ZXJ5XG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHZhbGlkYXRvcnMgPSBbXTtcblxuICAgICAgICBmb3IgKHZhciBrZXkgaW4gcXVlcnkpIHtcbiAgICAgICAgICAgIHZhciBhID0gcXVlcnlba2V5XTtcblxuICAgICAgICAgICAgaWYgKGtleSA9PT0gJyRvcHRpb25zJykgY29udGludWU7XG5cbiAgICAgICAgICAgIGlmIChvcGVyYXRvcltrZXldKSB7XG4gICAgICAgICAgICAgICAgaWYgKHByZXBhcmVba2V5XSkgYSA9IHByZXBhcmVba2V5XShhLCBxdWVyeSk7XG4gICAgICAgICAgICAgICAgdmFsaWRhdG9ycy5wdXNoKGNyZWF0ZVZhbGlkYXRvcihjb21wYXJhYmxlKGEpLCBvcGVyYXRvcltrZXldKSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuXG4gICAgICAgICAgICAgICAgaWYgKGtleS5jaGFyQ29kZUF0KDApID09PSAzNikge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Vua25vd24gb3BlcmF0aW9uICcgKyBrZXkpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHZhbGlkYXRvcnMucHVzaChjcmVhdGVOZXN0ZWRWYWxpZGF0b3Ioa2V5LnNwbGl0KCcuJyksIHBhcnNlKGEpKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdmFsaWRhdG9ycy5sZW5ndGggPT09IDEgPyB2YWxpZGF0b3JzWzBdIDogY3JlYXRlVmFsaWRhdG9yKHZhbGlkYXRvcnMsIG9wZXJhdG9yLiRhbmQpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNyZWF0ZVJvb3RWYWxpZGF0b3IocXVlcnksIGdldHRlcikge1xuICAgICAgICB2YXIgdmFsaWRhdG9yID0gcGFyc2UocXVlcnkpO1xuICAgICAgICBpZiAoZ2V0dGVyKSB7XG4gICAgICAgICAgICB2YWxpZGF0b3IgPSB7XG4gICAgICAgICAgICAgICAgYTogdmFsaWRhdG9yLFxuICAgICAgICAgICAgICAgIHY6IGZ1bmN0aW9uKGEsIGIpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHZhbGlkYXRlKGEsIGdldHRlcihiKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdmFsaWRhdG9yO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHNpZnQocXVlcnksIGFycmF5LCBnZXR0ZXIpIHtcblxuICAgICAgICBpZiAoaXNGdW5jdGlvbihhcnJheSkpIHtcbiAgICAgICAgICAgIGdldHRlciA9IGFycmF5O1xuICAgICAgICAgICAgYXJyYXkgPSB2b2lkIDA7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgdmFsaWRhdG9yID0gY3JlYXRlUm9vdFZhbGlkYXRvcihxdWVyeSwgZ2V0dGVyKTtcblxuICAgICAgICBmdW5jdGlvbiBmaWx0ZXIoYikge1xuICAgICAgICAgICAgcmV0dXJuIHZhbGlkYXRlKHZhbGlkYXRvciwgYik7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoYXJyYXkpIHtcbiAgICAgICAgICAgIHJldHVybiBhcnJheS5maWx0ZXIoZmlsdGVyKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBmaWx0ZXI7XG4gICAgfVxuXG4gICAgc2lmdC51c2UgPSBmdW5jdGlvbihwbHVnaW4pIHtcbiAgICAgICAgaWYgKGlzRnVuY3Rpb24ocGx1Z2luKSkgcmV0dXJuIHBsdWdpbihzaWZ0KTtcbiAgICAgICAgZm9yICh2YXIga2V5IGluIHBsdWdpbikge1xuICAgICAgICAgICAgaWYgKGtleS5jaGFyQ29kZUF0KDApID09PSAzNikgb3BlcmF0b3Jba2V5XSA9IHBsdWdpbltrZXldO1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIHNpZnQuaW5kZXhPZiA9IGZ1bmN0aW9uKHF1ZXJ5LCBhcnJheSwgZ2V0dGVyKSB7XG4gICAgICAgIHJldHVybiBzZWFyY2goYXJyYXksIGNyZWF0ZVJvb3RWYWxpZGF0b3IocXVlcnksIGdldHRlcikpO1xuICAgIH07XG5cbiAgICBzaWZ0LmNvbXBhcmUgPSBmdW5jdGlvbihhLCBiKSB7XG4gICAgICAgIGlmIChhID09PSBiKSByZXR1cm4gMDtcbiAgICAgICAgaWYgKHR5cGVvZiBhID09PSB0eXBlb2YgYikge1xuICAgICAgICAgICAgaWYgKGEgPiBiKSByZXR1cm4gMTtcbiAgICAgICAgICAgIGlmIChhIDwgYikgcmV0dXJuIC0xO1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIG1vZHVsZS5leHBvcnRzID0gc2lmdDtcblxufSkodGhpcyk7IiwiKGZ1bmN0aW9uKCl7XG4gICAgXCJ1c2Ugc3RyaWN0XCI7XG5cbiAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vbWFrZWFibGUvdXVpZC12NC5qc1xuICAgIHZhciBkZWMyaGV4ID0gW107XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPD0gMTU7IGkrKykge1xuICAgICAgICBkZWMyaGV4W2ldID0gaS50b1N0cmluZygxNik7XG4gICAgfVxuICAgIGZ1bmN0aW9uIHV1aWQoKSB7XG4gICAgICAgIHZhciB1dWlkID0gJyc7XG4gICAgICAgIGZvciAodmFyIGkgPSAxOyBpIDw9IDM2OyBpKyspIHtcbiAgICAgICAgICAgIGlmIChpID09PSA5IHx8IGkgPT09IDE0IHx8IGkgPT09IDE5IHx8IGkgPT09IDI0KSB7XG4gICAgICAgICAgICAgICAgdXVpZCArPSAnLSc7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGkgPT09IDE1KSB7XG4gICAgICAgICAgICAgICAgdXVpZCArPSA0O1xuICAgICAgICAgICAgfSBlbHNlIGlmIChpID09PSAyMCkge1xuICAgICAgICAgICAgICAgIHV1aWQgKz0gZGVjMmhleFsoTWF0aC5yYW5kb20oKSAqIDQgfCAwICsgOCldO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB1dWlkICs9IGRlYzJoZXhbKE1hdGgucmFuZG9tKCkgKiAxNSB8IDApXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdXVpZDtcbiAgICB9XG5cbiAgICBtb2R1bGUuZXhwb3J0cyA9IHV1aWQ7XG5cbn0pKHRoaXMpOyIsIihmdW5jdGlvbigpIHtcbiAgICAndXNlIHN0cmljdCc7XG5cbiAgICB2YXIgc3RvcmFnZSA9IHJlcXVpcmUoJy4vc3RvcmFnZScpO1xuICAgIHZhciB1dGlscyA9IHJlcXVpcmUoJy4vdXRpbHMnKTtcblxuICAgIC8qKlxuICAgICAqIE1vZGVsIFN0YXJ0XG4gICAgICovXG5cbiAgICB2YXIgTW9kZWwgPSByZXF1aXJlKCcuL21vZHVsZXMvbW9kZWwnKTtcblxuICAgIC8qKlxuICAgICAqIFF1ZXJ5IHN0YXJ0XG4gICAgICovXG5cbiAgICB2YXIgUXVlcnkgPSByZXF1aXJlKCcuL21vZHVsZXMvcXVlcnknKTtcblxuICAgIC8qKlxuICAgICAqIEVuZHBvaW50IHN0YXJ0XG4gICAgICovXG5cbiAgICB2YXIgRW5kcG9pbnQgPSByZXF1aXJlKCcuL21vZHVsZXMvZW5kcG9pbnQnKTtcblxuICAgIC8vIEV4cG9ydHNcblxuICAgIHZhciBDYXN0TXlEYXRhID0ge1xuICAgICAgICBNb2RlbDogTW9kZWwsXG4gICAgICAgIFF1ZXJ5OiBRdWVyeSxcbiAgICAgICAgRW5kcG9pbnQ6IEVuZHBvaW50LFxuICAgICAgICBVdGlsczogdXRpbHMsXG4gICAgfTtcblxuICAgIG1vZHVsZS5leHBvcnRzID0gQ2FzdE15RGF0YTtcblxufSkodGhpcyk7Il19
