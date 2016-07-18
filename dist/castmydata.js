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
},{}],9:[function(require,module,exports){
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9saWIvX2VtcHR5LmpzIiwic3JjL21vZHVsZXMvTW9kZWwuanMiLCJzcmMvbW9kdWxlcy9RdWVyeS5qcyIsInNyYy9tb2R1bGVzL2VuZHBvaW50LmpzIiwic3JjL3N0b3JhZ2UvaW5kZXguanMiLCJzcmMvc3RvcmFnZS9qamxjLmpzIiwic3JjL3N0b3JhZ2UvbG9jYWxXcmFwcGVyRmFjdG9yeS5qcyIsInNyYy9zdG9yYWdlL21lbW9yeS5qcyIsInNyYy91dGlscy9kZWVwRXh0ZW5kLmpzIiwic3JjL3V0aWxzL2Vldi5qcyIsInNyYy91dGlscy9pbmRleC5qcyIsInNyYy91dGlscy9zaWZ0LmpzIiwic3JjL3V0aWxzL3V1aWQuanMiLCJzcmMvY2FzdG15ZGF0YS5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBOztBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7OztBQzNXQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNmQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVjQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIiLCIoZnVuY3Rpb24oKXtcbiAgICBcInVzZSBzdHJpY3RcIjtcblxuICAgIHZhciB1dGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzJyk7XG5cbiAgICBmdW5jdGlvbiBnZXRSZWNvcmQobW9kZWwpIHtcbiAgICAgICAgdmFyIHJlY29yZCA9IHt9O1xuICAgICAgICBmb3IodmFyIGtleSBpbiBtb2RlbCkge1xuICAgICAgICAgICAgaWYgKG1vZGVsLmhhc093blByb3BlcnR5KGtleSkgJiYgWyckJGhhc2hLZXknLCAnX2VuZHBvaW50JywgJ19ldmVudHMnXS5pbmRleE9mKGtleSkgPT0gLTEpIHtcbiAgICAgICAgICAgICAgICByZWNvcmRba2V5XSA9IG1vZGVsW2tleV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlY29yZDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBNb2RlbChwb2ludCwgcGFyYW1zKSB7XG4gICAgICAgIHBhcmFtcyA9IHBhcmFtcyB8fCB7fTtcbiAgICAgICAgdXRpbHMuZGVlcEV4dGVuZCh0aGlzLCBwYXJhbXMpO1xuICAgICAgICB0aGlzLmlkID0gdGhpcy5pZCB8fCB1dGlscy51dWlkKCk7XG4gICAgICAgIHRoaXMubWV0YSA9IHRoaXMubWV0YSB8fCB7fTtcbiAgICAgICAgdGhpcy5fZXZlbnRzID0ge307XG4gICAgICAgIHRoaXMuX2VuZHBvaW50ID0gcG9pbnQ7XG4gICAgfVxuXG4gICAgTW9kZWwucHJvdG90eXBlID0gT2JqZWN0LmNyZWF0ZSh1dGlscy5FZXYucHJvdG90eXBlKTtcblxuICAgIE1vZGVsLnByb3RvdHlwZS5nZXQgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIGdldFJlY29yZCh0aGlzKTtcbiAgICB9O1xuXG4gICAgTW9kZWwucHJvdG90eXBlLnBvc3QgPSBmdW5jdGlvbihjYWxsYmFjaykge1xuXG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgICAgICAvLyByZWdpc3RlciBjYWxsYmFja1xuICAgICAgICBpZiAoY2FsbGJhY2spIHRoaXMuX2VuZHBvaW50Ll9zb2NrZXQub25jZSgncmVjZWlwdDpwb3N0JywgY2FsbGJhY2spO1xuXG4gICAgICAgIC8vIHVwZGF0ZSBwcm9wZXJ0aWVzXG4gICAgICAgIHZhciBwYXJhbXMgPSB7XG4gICAgICAgICAgICBtZXRhOiB7XG4gICAgICAgICAgICAgICAgc3luY2VkOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBjcmVhdGVkQXQ6IERhdGUubm93KCksXG4gICAgICAgICAgICAgICAgdXBkYXRlZEF0OiBEYXRlLm5vdygpLFxuICAgICAgICAgICAgICAgIGRlbGV0ZWRBdDogbnVsbFxuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICB1dGlscy5kZWVwRXh0ZW5kKHRoaXMsIHBhcmFtcyk7XG5cbiAgICAgICAgLy8gYWRkIHRvIGVuZHBvaW50IG1vZGVsc1xuICAgICAgICB0aGlzLl9lbmRwb2ludC5tb2RlbHMucHVzaCh0aGlzKTtcblxuICAgICAgICAvLyBzYXZlIGludG8gc3RvcmFnZVxuICAgICAgICB0aGlzLl9lbmRwb2ludC5jb21taXQoKTtcblxuICAgICAgICAvLyBlbWl0IGV2ZW50c1xuICAgICAgICB0aGlzLmVtaXQoJ3Bvc3QnLCB0aGlzKTtcbiAgICAgICAgdGhpcy5fZW5kcG9pbnQuZW1pdCgncG9zdCcsIHRoaXMpO1xuXG4gICAgICAgIC8vIGhhbmRsZSBhY2wgZGVueVxuICAgICAgICB0aGlzLl9lbmRwb2ludC5fc29ja2V0Lm9uY2UoJ2RlbmllZDpwb3N0OicgKyB0aGlzLmlkLCBmdW5jdGlvbigpe1xuICAgICAgICAgICAgLy8gZGVyZWdpc3RlciBjYWxsYmFja1xuICAgICAgICAgICAgc2VsZi5fZW5kcG9pbnQuX3NvY2tldC5vZmYoJ3JlY2VpcHQ6cG9zdCcsIGNhbGxiYWNrKTtcbiAgICAgICAgICAgIHZhciBpbmRleCA9IHNlbGYuX2VuZHBvaW50Lm1vZGVscy5pbmRleE9mKHNlbGYpO1xuICAgICAgICAgICAgaWYoaW5kZXggPiAtMSkge1xuICAgICAgICAgICAgICAgIHNlbGYuX2VuZHBvaW50Lm1vZGVscy5zcGxpY2UoaW5kZXgsIDEpO1xuICAgICAgICAgICAgICAgIHNlbGYuX2VuZHBvaW50LmNvbW1pdCgpO1xuICAgICAgICAgICAgICAgIHNlbGYuX2VuZHBvaW50LmVtaXQoJ3Bvc3QnLCBzZWxmLmlkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gZW1pdCBzb2NrZXRcbiAgICAgICAgdGhpcy5fZW5kcG9pbnQuX3NvY2tldC5lbWl0KCdwb3N0JywgdGhpcy5nZXQoKSk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH07XG5cbiAgICBNb2RlbC5wcm90b3R5cGUucHV0ID0gZnVuY3Rpb24ocGFyYW1zLCBjYWxsYmFjaykge1xuXG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgICAgICAvLyByZWdpc3RlciBjYWxsYmFja1xuICAgICAgICBpZiAoY2FsbGJhY2spIHRoaXMuX2VuZHBvaW50Ll9zb2NrZXQub25jZSgncmVjZWlwdDpwdXQnLCBjYWxsYmFjayk7XG5cbiAgICAgICAgLy8gdXBkYXRlIHByb3BlcnRpZXNcbiAgICAgICAgdXRpbHMuZGVlcEV4dGVuZCh0aGlzLCBwYXJhbXMpO1xuICAgICAgICB0aGlzLm1ldGEuc3luY2VkID0gZmFsc2U7XG4gICAgICAgIHRoaXMubWV0YS51cGRhdGVkQXQgPSBEYXRlLm5vdygpO1xuXG4gICAgICAgIC8vIHNhdmUgaW50byBzdG9yYWdlXG4gICAgICAgIHRoaXMuX2VuZHBvaW50LmNvbW1pdCgpO1xuXG4gICAgICAgIC8vIGVtaXQgZXZlbnRzXG4gICAgICAgIHRoaXMuZW1pdCgncHV0JywgdGhpcywgcGFyYW1zKTtcbiAgICAgICAgdGhpcy5fZW5kcG9pbnQuZW1pdCgncHV0JywgdGhpcywgcGFyYW1zKTtcblxuICAgICAgICAvLyBoYW5kbGUgYWNsIGRlbnlcbiAgICAgICAgdGhpcy5fZW5kcG9pbnQuX3NvY2tldC5vbmNlKCdkZW5pZWQ6cHV0OicgKyB0aGlzLmlkLCBmdW5jdGlvbihkYXRhKXtcbiAgICAgICAgICAgIC8vIGRlcmVnaXN0ZXIgY2FsbGJhY2tcbiAgICAgICAgICAgIHNlbGYuX2VuZHBvaW50Ll9zb2NrZXQub2ZmKCdyZWNlaXB0OnB1dCcsIGNhbGxiYWNrKTtcbiAgICAgICAgICAgIHV0aWxzLmRlZXBFeHRlbmQoc2VsZiwgZGF0YSk7XG4gICAgICAgICAgICBzZWxmLl9lbmRwb2ludC5jb21taXQoKTtcbiAgICAgICAgICAgIHNlbGYuZW1pdCgncHV0Jyk7XG4gICAgICAgICAgICBzZWxmLl9lbmRwb2ludC5lbWl0KCdwdXQnKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gZW1pdCBzb2NrZXRcbiAgICAgICAgdGhpcy5fZW5kcG9pbnQuX3NvY2tldC5lbWl0KCdwdXQnLCB0aGlzLmdldCgpKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfTtcblxuICAgIE1vZGVsLnByb3RvdHlwZS5kZWxldGUgPSBmdW5jdGlvbihjYWxsYmFjaykge1xuXG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgICAgICAvLyByZWdpc3RlciBjYWxsYmFja1xuICAgICAgICBpZiAoY2FsbGJhY2spIHRoaXMuX2VuZHBvaW50Ll9zb2NrZXQub25jZSgncmVjZWlwdDpkZWxldGUnLCBjYWxsYmFjayk7XG5cbiAgICAgICAgLy8gY2xlYXIgcHJvcGVydGllc1xuICAgICAgICBmb3IodmFyIGtleSBpbiB0aGlzKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5oYXNPd25Qcm9wZXJ0eShrZXkpICYmIFsnbWV0YScsICdpZCcsICdfZW5kcG9pbnQnLCAnX2V2ZW50cyddLmluZGV4T2Yoa2V5KSA9PSAtMSkge1xuICAgICAgICAgICAgICAgIGRlbGV0ZSB0aGlzW2tleV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5tZXRhLmRlbGV0ZWRBdCA9IERhdGUubm93KCk7XG4gICAgICAgIHRoaXMubWV0YS5zeW5jZWQgPSBmYWxzZTtcblxuICAgICAgICAvLyBzYXZlIGludG8gc3RvcmFnZVxuICAgICAgICB0aGlzLl9lbmRwb2ludC5jb21taXQoKTtcblxuICAgICAgICAvLyBlbWl0IGV2ZW50c1xuICAgICAgICB0aGlzLmVtaXQoJ2RlbGV0ZScsIHRoaXMpO1xuICAgICAgICB0aGlzLl9lbmRwb2ludC5lbWl0KCdkZWxldGUnLCB0aGlzKTtcblxuICAgICAgICAvLyBoYW5kbGUgYWNsIGRlbnlcbiAgICAgICAgdGhpcy5fZW5kcG9pbnQuX3NvY2tldC5vbmNlKCdkZW5pZWQ6ZGVsZXRlOicgKyB0aGlzLmlkLCBmdW5jdGlvbihkYXRhKXtcbiAgICAgICAgICAgIC8vIGRlcmVnaXN0ZXIgY2FsbGJhY2tcbiAgICAgICAgICAgIHNlbGYuX2VuZHBvaW50Ll9zb2NrZXQub2ZmKCdyZWNlaXB0OmRlbGV0ZScsIGNhbGxiYWNrKTtcbiAgICAgICAgICAgIHV0aWxzLmRlZXBFeHRlbmQoc2VsZiwgZGF0YSk7XG4gICAgICAgICAgICBzZWxmLl9lbmRwb2ludC5jb21taXQoKTtcbiAgICAgICAgICAgIHNlbGYuZW1pdCgnZGVsZXRlJyk7XG4gICAgICAgICAgICBzZWxmLl9lbmRwb2ludC5lbWl0KCdkZWxldGUnKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gZW1pdCBzb2NrZXRcbiAgICAgICAgdGhpcy5fZW5kcG9pbnQuX3NvY2tldC5lbWl0KCdkZWxldGUnLCB0aGlzLmlkKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfTtcblxuICAgIE1vZGVsLnByb3RvdHlwZS5tZXJnZSA9IGZ1bmN0aW9uKF9tb2RlbCkge1xuICAgICAgICBpZiAoSlNPTi5zdHJpbmdpZnkoZ2V0UmVjb3JkKHRoaXMpKSAhPSBKU09OLnN0cmluZ2lmeShfbW9kZWwpKSB7XG4gICAgICAgICAgICAvLyB1cGRhdGUgcHJvcGVydGllc1xuICAgICAgICAgICAgdXRpbHMuZGVlcEV4dGVuZCh0aGlzLCBfbW9kZWwpO1xuXG4gICAgICAgICAgICAvLyBzYXZlIGludG8gc3RvcmFnZVxuICAgICAgICAgICAgdGhpcy5fZW5kcG9pbnQuY29tbWl0KCk7XG5cbiAgICAgICAgICAgIC8vIGVtaXQgZXZlbnRzXG4gICAgICAgICAgICB0aGlzLmVtaXQoJ21lcmdlJywgdGhpcyk7XG4gICAgICAgICAgICB0aGlzLl9lbmRwb2ludC5lbWl0KCdtZXJnZScsIHRoaXMpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH07XG5cbiAgICBtb2R1bGUuZXhwb3J0cyA9IE1vZGVsO1xuXG59KSh0aGlzKTtcbiIsIihmdW5jdGlvbigpIHtcbiAgICBcInVzZSBzdHJpY3RcIjtcblxuICAgIHZhciB1dGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzJyk7XG5cbiAgICBmdW5jdGlvbiBRdWVyeShlbmRwb2ludCwgZmlsdGVyKSB7XG4gICAgICAgIHRoaXMubW9kZWxzID0gW107XG4gICAgICAgIHRoaXMuX2ZpbHRlciA9IGZpbHRlcjtcbiAgICAgICAgdGhpcy5fZW5kcG9pbnQgPSBlbmRwb2ludDtcbiAgICAgICAgdGhpcy5fZXZlbnRzID0ge307XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdGhpcy5fZW5kcG9pbnQub24oJ3N1YnNjcmliZWQnLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHNlbGYucnVuKCk7XG4gICAgICAgICAgICBzZWxmLmVtaXQoJ3N1YnNjcmliZWQnKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuX2VuZHBvaW50Lm9uKCd1bnN1YnNjcmliZWQnLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHNlbGYucnVuKCk7XG4gICAgICAgICAgICBzZWxmLmVtaXQoJ3Vuc3Vic2NyaWJlZCcpO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5fZW5kcG9pbnQub24oJ3N5bmMnLCBmdW5jdGlvbihtb2RlbHMpIHtcbiAgICAgICAgICAgIHNlbGYucnVuKCk7XG4gICAgICAgICAgICBzZWxmLmVtaXQoJ3N5bmMnLCBtb2RlbHMpO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5fZW5kcG9pbnQub24oJ3Bvc3QnLCBmdW5jdGlvbihtb2RlbCkge1xuICAgICAgICAgICAgc2VsZi5ydW4oKTtcbiAgICAgICAgICAgIHNlbGYuZW1pdCgncG9zdCcsIG1vZGVsKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuX2VuZHBvaW50Lm9uKCdwdXQnLCBmdW5jdGlvbihtb2RlbCkge1xuICAgICAgICAgICAgc2VsZi5ydW4oKTtcbiAgICAgICAgICAgIHNlbGYuZW1pdCgncHV0JywgbW9kZWwpO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5fZW5kcG9pbnQub24oJ2RlbGV0ZScsIGZ1bmN0aW9uKG1vZGVsKSB7XG4gICAgICAgICAgICBzZWxmLnJ1bigpO1xuICAgICAgICAgICAgc2VsZi5lbWl0KCdwdXQnLCBtb2RlbCk7XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLl9lbmRwb2ludC5vbignY2xlYXInLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHNlbGYucnVuKCk7XG4gICAgICAgICAgICBzZWxmLmVtaXQoJ2NsZWFyJyk7XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLl9lbmRwb2ludC5vbignbWVyZ2UnLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHNlbGYucnVuKCk7XG4gICAgICAgICAgICBzZWxmLmVtaXQoJ21lcmdlJyk7XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLnJ1bi5jYWxsKHNlbGYpO1xuICAgIH1cblxuICAgIFF1ZXJ5LnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUodXRpbHMuRWV2LnByb3RvdHlwZSk7XG5cbiAgICBRdWVyeS5wcm90b3R5cGUucnVuID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHRoaXMubW9kZWxzID0gdXRpbHMuc2lmdCh0aGlzLl9maWx0ZXIsIHRoaXMuX2VuZHBvaW50Lm1vZGVscyk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH07XG5cbiAgICBRdWVyeS5wcm90b3R5cGUucHV0ID0gZnVuY3Rpb24ocmVjb3JkKSB7XG4gICAgICAgIHRoaXMubW9kZWxzLmZvckVhY2goZnVuY3Rpb24obW9kZWwpIHtcbiAgICAgICAgICAgIG1vZGVsLnB1dChyZWNvcmQpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfTtcblxuICAgIFF1ZXJ5LnByb3RvdHlwZS5kZWxldGUgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgdGhpcy5tb2RlbHMuZm9yRWFjaChmdW5jdGlvbihtb2RlbCkge1xuICAgICAgICAgICAgbW9kZWwuZGVsZXRlKCk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9O1xuXG4gICAgbW9kdWxlLmV4cG9ydHMgPSBRdWVyeTtcblxufSkodGhpcyk7IiwiKGZ1bmN0aW9uKCkge1xuICAgIFwidXNlIHN0cmljdFwiO1xuXG4gICAgdmFyIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMnKTtcbiAgICB2YXIgc3RvcmFnZSA9IHJlcXVpcmUoJy4uL3N0b3JhZ2UnKTtcbiAgICB2YXIgTW9kZWwgPSByZXF1aXJlKCcuLi9tb2R1bGVzL01vZGVsJyk7XG4gICAgdmFyIFF1ZXJ5ID0gcmVxdWlyZSgnLi4vbW9kdWxlcy9RdWVyeScpO1xuICAgIHZhciBpbyA9ICh0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJykgPyB3aW5kb3cuaW8gOiBudWxsO1xuXG4gICAgZnVuY3Rpb24gRW5kcG9pbnQoQ2FzdE15RGF0YVNlcnZlciwgcGF0aCwgb3B0aW9ucykge1xuXG4gICAgICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgaWYgKCgvW15hLXpBLVowLTktX1xcLl0vZykudGVzdChwYXRoKSkge1xuICAgICAgICAgICAgdGhyb3cgJ0ludmFsaWQgY2hhcmFjdGVycyBpbiBwYXRoLiBBbGxvd2VkIGNoYXJhY3RlcnMgYXJlIGEteiwgQS1aLCAwLTksIC0sIF8sIC4nO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYoIWlvKSB7XG4gICAgICAgICAgICBpbyA9IHJlcXVpcmUoJ3NvY2tldC5pby1jbGllbnQnKTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgc29ja2V0ID0gaW8oQ2FzdE15RGF0YVNlcnZlciArICc/cGF0aD0nICsgcGF0aCwge1xuICAgICAgICAgICAgbXVsdGlwbGV4OiBmYWxzZVxuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLl9vcHRpb25zID0ge1xuICAgICAgICAgICAgc3RvcmFnZTogJ2pqbGMnXG4gICAgICAgIH07XG4gICAgICAgIHV0aWxzLmRlZXBFeHRlbmQodGhpcy5fb3B0aW9ucywgb3B0aW9ucyk7XG5cbiAgICAgICAgdGhpcy5fc29ja2V0ID0gc29ja2V0O1xuICAgICAgICB0aGlzLl9Nb2RlbCA9IHRoaXMuX29wdGlvbnMubW9kZWwgfHwgTW9kZWw7XG4gICAgICAgIHRoaXMubW9kZWxzID0gW107XG4gICAgICAgIHRoaXMuX2V2ZW50cyA9IHt9O1xuICAgICAgICB0aGlzLl9maWx0ZXIgPSB7fTtcbiAgICAgICAgdGhpcy5fc3Vic2NyaWJlZCA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9zdG9yYWdlID0gbmV3IHN0b3JhZ2UoJ2NtZF8nICsgcGF0aCwge1xuICAgICAgICAgICAgZHJpdmVyOiB0aGlzLl9vcHRpb25zLnN0b3JhZ2VcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gY3JlYXRlIHRoZSBzb2NrZXRcbiAgICAgICAgc29ja2V0LnBhdGggPSBwYXRoO1xuXG4gICAgICAgIC8vIEFkZCBoYW5kbGVyc1xuICAgICAgICBmdW5jdGlvbiBzeW5jSGFuZGxlcihkYXRhLCBjYWxsYmFjaykge1xuICAgICAgICAgICAgaWYgKCFzZWxmLl9zdWJzY3JpYmVkKSByZXR1cm47XG4gICAgICAgICAgICBkYXRhLmZvckVhY2goZnVuY3Rpb24oX21vZGVsKSB7XG4gICAgICAgICAgICAgICAgcG9zdEhhbmRsZXIoX21vZGVsKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgc2VsZi5lbWl0KCdzeW5jJywgc2VsZi5tb2RlbHMpO1xuICAgICAgICAgICAgaWYgKGNhbGxiYWNrKSBjYWxsYmFjaygpO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gcG9zdEhhbmRsZXIoX21vZGVsLCBjYWxsYmFjaykge1xuICAgICAgICAgICAgaWYgKCFzZWxmLl9zdWJzY3JpYmVkKSByZXR1cm47XG4gICAgICAgICAgICB2YXIgbW9kZWwgPSBzZWxmLmZpbmQoX21vZGVsLmlkKTtcbiAgICAgICAgICAgIGlmIChtb2RlbCkge1xuICAgICAgICAgICAgICAgIG1vZGVsLm1lcmdlKF9tb2RlbCk7XG4gICAgICAgICAgICAgICAgbW9kZWwuZW1pdCgnbWVyZ2UnLCBtb2RlbCk7XG4gICAgICAgICAgICAgICAgc2VsZi5lbWl0KCdtZXJnZScsIG1vZGVsKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gY3JlYXRlIG1vZGVsXG4gICAgICAgICAgICAgICAgbW9kZWwgPSBuZXcgc2VsZi5fTW9kZWwoc2VsZiwgX21vZGVsKTtcblxuICAgICAgICAgICAgICAgIC8vIGFkZCB0byBtb2RlbHNcbiAgICAgICAgICAgICAgICBzZWxmLm1vZGVscy5wdXNoKG1vZGVsKTtcblxuICAgICAgICAgICAgICAgIC8vIHNhdmUgaW50byBzdG9yYWdlXG4gICAgICAgICAgICAgICAgc2VsZi5jb21taXQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIGVtaXQgZXZlbnRzXG4gICAgICAgICAgICBtb2RlbC5lbWl0KCdwb3N0JywgbW9kZWwpO1xuICAgICAgICAgICAgc2VsZi5lbWl0KCdwb3N0JywgbW9kZWwpO1xuICAgICAgICAgICAgaWYgKGNhbGxiYWNrKSBjYWxsYmFjayhtb2RlbCk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBwdXRIYW5kbGVyKHJlY29yZCwgY2FsbGJhY2spIHtcbiAgICAgICAgICAgIGlmICghc2VsZi5fc3Vic2NyaWJlZCkgcmV0dXJuO1xuICAgICAgICAgICAgdmFyIG1vZGVsID0gc2VsZi5maW5kKHJlY29yZC5pZCk7XG4gICAgICAgICAgICBpZiAobW9kZWwpIHtcbiAgICAgICAgICAgICAgICAvLyB1cGRhdGUgbW9kZWwgcHJvcGVydGllc1xuICAgICAgICAgICAgICAgIHV0aWxzLmRlZXBFeHRlbmQobW9kZWwsIHJlY29yZCk7XG5cbiAgICAgICAgICAgICAgICAvLyBzYXZlIGludG8gc3RvcmFnZVxuICAgICAgICAgICAgICAgIHNlbGYuY29tbWl0KCk7XG5cbiAgICAgICAgICAgICAgICAvLyBlbWl0IGV2ZW50c1xuICAgICAgICAgICAgICAgIG1vZGVsLmVtaXQoJ21lcmdlJywgbW9kZWwpO1xuICAgICAgICAgICAgICAgIHNlbGYuZW1pdCgnbWVyZ2UnLCBtb2RlbCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIG1vZGVsID0gbmV3IHNlbGYuX01vZGVsKHNlbGYsIHJlY29yZCk7XG4gICAgICAgICAgICAgICAgc2VsZi5tb2RlbHMucHVzaChtb2RlbCk7XG4gICAgICAgICAgICAgICAgc2VsZi5jb21taXQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG1vZGVsLmVtaXQoJ3B1dCcpO1xuICAgICAgICAgICAgaWYgKGNhbGxiYWNrKSBjYWxsYmFjayhtb2RlbCk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBkZWxldGVIYW5kbGVyKHJlY29yZCwgY2FsbGJhY2spIHtcbiAgICAgICAgICAgIGlmICghc2VsZi5fc3Vic2NyaWJlZCkgcmV0dXJuO1xuICAgICAgICAgICAgdmFyIG1vZGVsID0gc2VsZi5maW5kKHJlY29yZC5pZCk7XG4gICAgICAgICAgICBpZiAobW9kZWwpIHtcbiAgICAgICAgICAgICAgICAvLyB1cGRhdGUgcHJvcGVydGllc1xuXG4gICAgICAgICAgICAgICAgZm9yICh2YXIga2V5IGluIG1vZGVsKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChtb2RlbC5oYXNPd25Qcm9wZXJ0eShrZXkpICYmIFtcbiAgICAgICAgICAgICAgICAgICAgICAgICdpZCcsXG4gICAgICAgICAgICAgICAgICAgICAgICAnbWV0YScsXG4gICAgICAgICAgICAgICAgICAgICAgICAnJCRoYXNoS2V5JyxcbiAgICAgICAgICAgICAgICAgICAgICAgICdfZW5kcG9pbnQnLFxuICAgICAgICAgICAgICAgICAgICAgICAgJ19ldmVudHMnXG4gICAgICAgICAgICAgICAgICAgIF0uaW5kZXhPZihrZXkpID09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWxldGUgbW9kZWxba2V5XTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIGV4dGVuZCByZXNwb25zZSBtZXRhXG4gICAgICAgICAgICAgICAgdXRpbHMuZGVlcEV4dGVuZChtb2RlbC5tZXRhLCByZWNvcmQubWV0YSk7XG5cbiAgICAgICAgICAgICAgICAvLyBzYXZlIGludG8gc3RvcmFnZVxuICAgICAgICAgICAgICAgIHNlbGYuY29tbWl0KCk7XG5cbiAgICAgICAgICAgICAgICAvLyBlbWl0IGV2ZW50c1xuICAgICAgICAgICAgICAgIG1vZGVsLmVtaXQoJ21lcmdlJywgbW9kZWwpO1xuICAgICAgICAgICAgICAgIHNlbGYuZW1pdCgnbWVyZ2UnLCBtb2RlbCk7XG4gICAgICAgICAgICAgICAgaWYgKGNhbGxiYWNrKSBjYWxsYmFjayhtb2RlbCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBjbGVhckhhbmRsZXIoY2FsbGJhY2spIHtcbiAgICAgICAgICAgIGNhbGxiYWNrID0gY2FsbGJhY2sgfHwgZnVuY3Rpb24oKSB7fTtcbiAgICAgICAgICAgIHNlbGYuX3N0b3JhZ2UuY2xlYXIoZnVuY3Rpb24oZXJyKSB7XG4gICAgICAgICAgICAgICAgaWYgKGVycikgcmV0dXJuIHV0aWxzLmhhbmRsZUVycm9yKGVycik7XG4gICAgICAgICAgICAgICAgc2VsZi5tb2RlbHMuc3BsaWNlKDAsIHNlbGYubW9kZWxzLmxlbmd0aCk7XG4gICAgICAgICAgICAgICAgc2VsZi5lbWl0KCdjbGVhcicpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBsaXN0ZW5IYW5kbGVyKGNoYW5uZWwsIGNhbGxiYWNrKSB7XG4gICAgICAgICAgICBzZWxmLmVtaXQoJ2xpc3RlbicsIGNoYW5uZWwpO1xuICAgICAgICAgICAgaWYgKGNhbGxiYWNrKSBjYWxsYmFjayhjaGFubmVsKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIHVubGlzdGVuSGFuZGxlcihjaGFubmVsLCBjYWxsYmFjaykge1xuICAgICAgICAgICAgc2VsZi5lbWl0KCd1bmxpc3RlbicsIGNoYW5uZWwpO1xuICAgICAgICAgICAgaWYgKGNhbGxiYWNrKSBjYWxsYmFjayhjaGFubmVsKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGJyb2FkY2FzdEhhbmRsZXIoZGF0YSwgY2FsbGJhY2spIHtcbiAgICAgICAgICAgIHNlbGYuZW1pdCgnYnJvYWRjYXN0JywgZGF0YSk7XG4gICAgICAgICAgICBzZWxmLmVtaXQoJ2Jyb2FkY2FzdDonICsgZGF0YS5jaGFubmVsLCBkYXRhLnBheWxvYWQpO1xuICAgICAgICAgICAgaWYgKGNhbGxiYWNrKSBjYWxsYmFjayhkYXRhKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIHJlY29ubmVjdEhhbmRsZXIoKSB7XG4gICAgICAgICAgICBpZiAoc2VsZi5fc3Vic2NyaWJlZCkge1xuICAgICAgICAgICAgICAgIHNlbGYuc3Vic2NyaWJlKHNlbGYuX29wdGlvbnMpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gc2VydmVyRXJyb3JIYW5kbGVyKGVycm9yKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKGVycm9yKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGhhbmRsZSBldmVudHMgZnJvbSBvdGhlciBjbGllbnRzXG4gICAgICAgIHNvY2tldC5vbignc3luYycsIHN5bmNIYW5kbGVyKTtcbiAgICAgICAgc29ja2V0Lm9uKCdwb3N0JywgcG9zdEhhbmRsZXIpO1xuICAgICAgICBzb2NrZXQub24oJ3B1dCcsIHB1dEhhbmRsZXIpO1xuICAgICAgICBzb2NrZXQub24oJ2RlbGV0ZScsIGRlbGV0ZUhhbmRsZXIpO1xuICAgICAgICBzb2NrZXQub24oJ2NsZWFyJywgY2xlYXJIYW5kbGVyKTtcbiAgICAgICAgc29ja2V0Lm9uKCdicm9hZGNhc3QnLCBicm9hZGNhc3RIYW5kbGVyKTtcbiAgICAgICAgc29ja2V0Lm9uKCdyZWNvbm5lY3QnLCByZWNvbm5lY3RIYW5kbGVyKTtcbiAgICAgICAgc29ja2V0Lm9uKCdjbWRlcnJvcicsIHNlcnZlckVycm9ySGFuZGxlcik7XG5cbiAgICAgICAgLy8gaGFuZGxlIHJlY2VpcHRzXG4gICAgICAgIHNvY2tldC5vbignc3luYycsIGZ1bmN0aW9uKHJlY29yZHMpIHtcbiAgICAgICAgICAgIHN5bmNIYW5kbGVyKHJlY29yZHMsIGZ1bmN0aW9uKG1vZGVsKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5lbWl0KCdyZWNlaXB0OnN5bmMnKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICAgICAgc29ja2V0Lm9uKCdyZWNlaXB0OnBvc3QnLCBmdW5jdGlvbihyZWNvcmQpIHtcbiAgICAgICAgICAgIHBvc3RIYW5kbGVyKHJlY29yZCwgZnVuY3Rpb24obW9kZWwpIHtcbiAgICAgICAgICAgICAgICBtb2RlbC5lbWl0KCdyZWNlaXB0OnBvc3QnLCBtb2RlbCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgICAgIHNvY2tldC5vbigncmVjZWlwdDpwdXQnLCBmdW5jdGlvbihkYXRhKSB7XG4gICAgICAgICAgICBwdXRIYW5kbGVyKGRhdGEsIGZ1bmN0aW9uKG1vZGVsKSB7XG4gICAgICAgICAgICAgICAgbW9kZWwuZW1pdCgncmVjZWlwdDpwdXQnLCBtb2RlbCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgICAgIHNvY2tldC5vbigncmVjZWlwdDpkZWxldGUnLCBmdW5jdGlvbihyZWNvcmQpIHtcbiAgICAgICAgICAgIGRlbGV0ZUhhbmRsZXIocmVjb3JkLCBmdW5jdGlvbihtb2RlbCkge1xuICAgICAgICAgICAgICAgIG1vZGVsLmVtaXQoJ3JlY2VpcHQ6ZGVsZXRlJywgbW9kZWwpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgICAgICBzb2NrZXQub24oJ3JlY2VpcHQ6Y2xlYXInLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGNsZWFySGFuZGxlcihmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICBzZWxmLmVtaXQoJ3JlY2VpcHQ6Y2xlYXInKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICAgICAgc29ja2V0Lm9uKCdyZWNlaXB0Omxpc3RlbicsIGZ1bmN0aW9uKGNoYW5uZWwpIHtcbiAgICAgICAgICAgIGxpc3RlbkhhbmRsZXIoY2hhbm5lbCwgZnVuY3Rpb24oY2hhbm5lbCkge1xuICAgICAgICAgICAgICAgIHNlbGYuZW1pdCgncmVjZWlwdDpsaXN0ZW46JyArIGNoYW5uZWwsIGNoYW5uZWwpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgICAgICBzb2NrZXQub24oJ3JlY2VpcHQ6dW5saXN0ZW4nLCBmdW5jdGlvbihjaGFubmVsKSB7XG4gICAgICAgICAgICB1bmxpc3RlbkhhbmRsZXIoY2hhbm5lbCwgZnVuY3Rpb24oY2hhbm5lbCkge1xuICAgICAgICAgICAgICAgIHNlbGYuZW1pdCgncmVjZWlwdDp1bmxpc3RlbjonICsgY2hhbm5lbCwgY2hhbm5lbCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgICAgIHNvY2tldC5vbigncmVjZWlwdDpicm9hZGNhc3QnLCBmdW5jdGlvbihkYXRhKSB7XG4gICAgICAgICAgICBicm9hZGNhc3RIYW5kbGVyKGRhdGEsIGZ1bmN0aW9uKGRhdGEpIHtcbiAgICAgICAgICAgICAgICBzZWxmLmVtaXQoJ3JlY2VpcHQ6YnJvYWRjYXN0JywgZGF0YSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgRW5kcG9pbnQucHJvdG90eXBlID0gT2JqZWN0LmNyZWF0ZSh1dGlscy5FZXYucHJvdG90eXBlKTtcblxuICAgIEVuZHBvaW50LnByb3RvdHlwZS5sb2FkID0gZnVuY3Rpb24oY2FsbGJhY2spIHtcbiAgICAgICAgY2FsbGJhY2sgPSBjYWxsYmFjayB8fCBmdW5jdGlvbigpIHt9O1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHRoaXMuX3N0b3JhZ2UuZ2V0KGZ1bmN0aW9uKGVyciwgZGF0YXMpIHtcbiAgICAgICAgICAgIHZhciBtb2RlbHMgPSBkYXRhcy5tYXAoZnVuY3Rpb24oX21vZGVsKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBzZWxmLl9Nb2RlbChzZWxmLCBfbW9kZWwpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBpZiAoc2VsZi5fZmlsdGVyKSB7XG4gICAgICAgICAgICAgICAgbW9kZWxzID0gdXRpbHMuc2lmdChzZWxmLl9maWx0ZXIsIG1vZGVscyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBzZWxmLm1vZGVscy5zcGxpY2UoMCwgc2VsZi5tb2RlbHMubGVuZ3RoKTtcbiAgICAgICAgICAgIHNlbGYuZW1pdCgnbG9hZCcsIHNlbGYubW9kZWxzKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKCk7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICBFbmRwb2ludC5wcm90b3R5cGUuY29tbWl0ID0gZnVuY3Rpb24oY2FsbGJhY2spIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICBjYWxsYmFjayA9IGNhbGxiYWNrIHx8IGZ1bmN0aW9uKCl7fTtcbiAgICAgICAgdmFyIG1vZGVscyA9IHRoaXMubW9kZWxzLm1hcChmdW5jdGlvbihtb2RlbCkge1xuICAgICAgICAgICAgcmV0dXJuIG1vZGVsLmdldCgpO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5fc3RvcmFnZS5zZXQobW9kZWxzLCBmdW5jdGlvbihlcnIpe1xuICAgICAgICAgICAgaWYoZXJyKSByZXR1cm4gdXRpbHMuaGFuZGxlRXJyb3IoZXJyKTtcbiAgICAgICAgICAgIHNlbGYuZW1pdCgnY29tbWl0Jyk7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICBFbmRwb2ludC5wcm90b3R5cGUuc3Vic2NyaWJlID0gZnVuY3Rpb24ob3B0aW9ucywgY2FsbGJhY2spIHtcbiAgICAgICAgaWYgKHR5cGVvZiBvcHRpb25zID09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIGNhbGxiYWNrID0gb3B0aW9ucztcbiAgICAgICAgICAgIG9wdGlvbnMgPSB7fTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICAgICAgZnVuY3Rpb24gc3ViKCkge1xuICAgICAgICAgICAgc2VsZi5fb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgICAgICAgICBzZWxmLl9maWx0ZXIgPSBzZWxmLl9vcHRpb25zLmZpbHRlcjtcbiAgICAgICAgICAgIHNlbGYuX3NvY2tldC5lbWl0KCdzdWJzY3JpYmUnLCBzZWxmLl9vcHRpb25zKTtcbiAgICAgICAgICAgIHNlbGYuZW1pdCgnc3Vic2NyaWJlZCcpO1xuICAgICAgICAgICAgc2VsZi5fc3Vic2NyaWJlZCA9IHRydWU7XG4gICAgICAgICAgICBzZWxmLnN5bmMoY2FsbGJhY2spO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLl9zdWJzY3JpYmVkKSB7XG4gICAgICAgICAgICB0aGlzLnVuc3Vic2NyaWJlKHN1Yik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzdWIoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9O1xuXG4gICAgRW5kcG9pbnQucHJvdG90eXBlLnVuc3Vic2NyaWJlID0gZnVuY3Rpb24oY2FsbGJhY2spIHtcbiAgICAgICAgaWYgKGNhbGxiYWNrKSB0aGlzLl9zb2NrZXQub25jZSgndW5zdWJzY3JpYmUnLCBjYWxsYmFjayk7XG4gICAgICAgIHRoaXMubW9kZWxzLnNwbGljZSgwLCB0aGlzLm1vZGVscy5sZW5ndGgpO1xuICAgICAgICB0aGlzLl9zb2NrZXQuZW1pdCgndW5zdWJzY3JpYmUnKTtcbiAgICAgICAgdGhpcy5lbWl0KCd1bnN1YnNjcmliZWQnKTtcbiAgICAgICAgdGhpcy5fc3Vic2NyaWJlZCA9IGZhbHNlO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9O1xuXG4gICAgRW5kcG9pbnQucHJvdG90eXBlLnN5bmMgPSBmdW5jdGlvbihjYWxsYmFjaykge1xuICAgICAgICB0aGlzLmxvYWQoKTtcbiAgICAgICAgdmFyIHVuc3luY2VkID0gdGhpcy5tb2RlbHMuZmlsdGVyKGZ1bmN0aW9uKG1vZGVsKSB7XG4gICAgICAgICAgICByZXR1cm4gIW1vZGVsLm1ldGEuc3luY2VkO1xuICAgICAgICB9KS5tYXAoZnVuY3Rpb24obW9kZWwpIHtcbiAgICAgICAgICAgIHJldHVybiBtb2RlbC5nZXQoKTtcbiAgICAgICAgfSk7XG4gICAgICAgIGlmIChjYWxsYmFjaykgdGhpcy5vbmNlKCdyZWNlaXB0OnN5bmMnLCBjYWxsYmFjayk7XG4gICAgICAgIHRoaXMuX3NvY2tldC5lbWl0KCdzeW5jJywgdW5zeW5jZWQpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9O1xuXG4gICAgRW5kcG9pbnQucHJvdG90eXBlLnBvc3QgPVxuICAgIEVuZHBvaW50LnByb3RvdHlwZS5jcmVhdGUgPVxuICAgICAgICBmdW5jdGlvbihyZWNvcmQsIGNhbGxiYWNrKSB7XG4gICAgICAgICAgICB2YXIgbW9kZWwgPSBuZXcgdGhpcy5fTW9kZWwodGhpcywgcmVjb3JkKTtcbiAgICAgICAgICAgIGlmIChjYWxsYmFjaykgbW9kZWwub25jZSgncmVjZWlwdDpwb3N0JywgY2FsbGJhY2spO1xuICAgICAgICAgICAgbW9kZWwucG9zdCgpO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfTtcblxuICAgIEVuZHBvaW50LnByb3RvdHlwZS5wdXQgPSBmdW5jdGlvbihpZCwgcmVjb3JkLCBjYWxsYmFjaykge1xuICAgICAgICB2YXIgbW9kZWwgPSB0aGlzLmZpbmQoaWQpO1xuICAgICAgICBpZiAobW9kZWwpIHtcbiAgICAgICAgICAgIGlmIChjYWxsYmFjaykgbW9kZWwub25jZSgncmVjZWlwdDpwdXQnLCBjYWxsYmFjayk7XG4gICAgICAgICAgICBtb2RlbC5wdXQocmVjb3JkKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9O1xuXG4gICAgRW5kcG9pbnQucHJvdG90eXBlLmRlbGV0ZSA9IGZ1bmN0aW9uKGlkLCBjYWxsYmFjaykge1xuICAgICAgICB2YXIgbW9kZWwgPSB0aGlzLmZpbmQoaWQpO1xuICAgICAgICBpZiAobW9kZWwpIHtcbiAgICAgICAgICAgIGlmIChjYWxsYmFjaykgbW9kZWwub25jZSgncmVjZWlwdDpkZWxldGUnLCBjYWxsYmFjayk7XG4gICAgICAgICAgICBtb2RlbC5kZWxldGUoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9O1xuXG4gICAgRW5kcG9pbnQucHJvdG90eXBlLmNsZWFyID0gZnVuY3Rpb24oY2FsbGJhY2spIHtcbiAgICAgICAgaWYgKGNhbGxiYWNrKSB0aGlzLl9zb2NrZXQub25jZSgncmVjZWlwdDpjbGVhcicsIGNhbGxiYWNrKTtcbiAgICAgICAgdGhpcy5fc29ja2V0LmVtaXQoJ2NsZWFyJyk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH07XG5cbiAgICBFbmRwb2ludC5wcm90b3R5cGUubGlzdGVuID0gZnVuY3Rpb24oY2hhbm5lbCwgY2FsbGJhY2spIHtcbiAgICAgICAgaWYgKGNhbGxiYWNrKSB0aGlzLm9uY2UoJ3JlY2VpcHQ6bGlzdGVuOicgKyBjaGFubmVsLCBjYWxsYmFjayk7XG4gICAgICAgIHRoaXMuX3NvY2tldC5lbWl0KCdsaXN0ZW4nLCBjaGFubmVsKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfTtcblxuICAgIEVuZHBvaW50LnByb3RvdHlwZS51bmxpc3RlbiA9IGZ1bmN0aW9uKGNoYW5uZWwsIGNhbGxiYWNrKSB7XG4gICAgICAgIGlmIChjYWxsYmFjaykgdGhpcy5vbmNlKCdyZWNlaXB0OnVubGlzdGVuOicgKyBjaGFubmVsLCBjYWxsYmFjayk7XG4gICAgICAgIHRoaXMuX3NvY2tldC5lbWl0KCd1bmxpc3RlbicsIGNoYW5uZWwpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9O1xuXG4gICAgRW5kcG9pbnQucHJvdG90eXBlLmJyb2FkY2FzdCA9IGZ1bmN0aW9uKGNoYW5uZWwsIHBheWxvYWQsIGNhbGxiYWNrKSB7XG4gICAgICAgIGlmIChjYWxsYmFjaykgdGhpcy5vbmNlKCdyZWNlaXB0OmJyb2FkY2FzdCcsIGNhbGxiYWNrKTtcbiAgICAgICAgdGhpcy5fc29ja2V0LmVtaXQoJ2Jyb2FkY2FzdCcsIHtcbiAgICAgICAgICAgIGNoYW5uZWw6IGNoYW5uZWwsXG4gICAgICAgICAgICBwYXlsb2FkOiBwYXlsb2FkXG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9O1xuXG4gICAgRW5kcG9pbnQucHJvdG90eXBlLmNsb3NlID0gZnVuY3Rpb24oY2FsbGJhY2spIHtcbiAgICAgICAgaWYgKGNhbGxiYWNrKSB0aGlzLl9zb2NrZXQub25jZSgnY2xvc2UnLCBjYWxsYmFjayk7XG4gICAgICAgIHRoaXMuX3NvY2tldC5jbG9zZSgnY2xvc2UnKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfTtcblxuICAgIEVuZHBvaW50LnByb3RvdHlwZS5maW5kID0gZnVuY3Rpb24oaWQpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMubW9kZWxzLmZpbHRlcihmdW5jdGlvbihtb2RlbCkge1xuICAgICAgICAgICAgcmV0dXJuIG1vZGVsLmlkID09IGlkO1xuICAgICAgICB9KS5wb3AoKTtcbiAgICB9O1xuXG4gICAgRW5kcG9pbnQucHJvdG90eXBlLndoZXJlID0gZnVuY3Rpb24oZmlsdGVyKSB7XG4gICAgICAgIHJldHVybiBuZXcgUXVlcnkodGhpcywgZmlsdGVyKTtcbiAgICB9O1xuXG4gICAgbW9kdWxlLmV4cG9ydHMgPSBFbmRwb2ludDtcblxufSkodGhpcyk7IiwiKGZ1bmN0aW9uKCkge1xuXG4gICAgdmFyIGxvY2FsV3JhcHBlckZhY3RvcnkgPSByZXF1aXJlKCcuL2xvY2FsV3JhcHBlckZhY3RvcnknKTtcbiAgICAvLyB2YXIgaW5kZXhlZGRiID0gcmVxdWlyZSgnLi9pbmRleGVkZGInKTtcbiAgICB2YXIgbWVtb3J5ID0gcmVxdWlyZSgnLi9tZW1vcnknKTtcbiAgICB2YXIgampsYyA9IHJlcXVpcmUoJy4vampsYycpO1xuICAgIHZhciBsb2NhbFN0b3JhZ2UgPSAodHlwZW9mIGxvY2FsU3RvcmFnZSAhPT0gJ3VuZGVmaW5lZCcpID8gbG9jYWxTdG9yYWdlIDogKHJlcXVpcmUoJ25vZGUtbG9jYWxzdG9yYWdlJykpO1xuICAgIHZhciBkcml2ZXJzID0ge1xuICAgICAgICBqamxjOiBsb2NhbFdyYXBwZXJGYWN0b3J5KGpqbGMpLFxuICAgICAgICBtZW1vcnk6IGxvY2FsV3JhcHBlckZhY3RvcnkobWVtb3J5KSxcbiAgICAgICAgbG9jYWxTdG9yYWdlOiBsb2NhbFdyYXBwZXJGYWN0b3J5KGxvY2FsU3RvcmFnZSksXG4gICAgfTtcblxuICAgIGZ1bmN0aW9uIFN0b3JhZ2UocGF0aCwgb3B0aW9ucykge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHRoaXMub3B0aW9ucyA9IG9wdGlvbnM7XG4gICAgICAgIHRoaXMuYm9vdGVkID0gZmFsc2U7XG4gICAgICAgIHRoaXMuZHJpdmVyID0gbmV3IGRyaXZlcnNbb3B0aW9ucy5kcml2ZXJdKHBhdGgsIG9wdGlvbnMpO1xuICAgICAgICB0aGlzLmRyaXZlci5ib290KGZ1bmN0aW9uKGVycikge1xuICAgICAgICAgICAgaWYoZXJyKSB0aHJvdyBlcnI7XG4gICAgICAgICAgICBzZWxmLmJvb3RlZCA9IHRydWU7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIFN0b3JhZ2UucHJvdG90eXBlLmdldCA9IGZ1bmN0aW9uKGNhbGxiYWNrKSB7XG4gICAgICAgIGNhbGxiYWNrID0gY2FsbGJhY2sgfHwgZnVuY3Rpb24oKSB7fTtcbiAgICAgICAgdGhpcy5kcml2ZXIuZ2V0KGNhbGxiYWNrKTtcbiAgICB9O1xuXG4gICAgU3RvcmFnZS5wcm90b3R5cGUuc2V0ID0gZnVuY3Rpb24oZGF0YXMsIGNhbGxiYWNrKSB7XG4gICAgICAgIGNhbGxiYWNrID0gY2FsbGJhY2sgfHwgZnVuY3Rpb24oKSB7fTtcbiAgICAgICAgdGhpcy5kcml2ZXIuc2V0KGRhdGFzLCBjYWxsYmFjayk7XG4gICAgfTtcblxuICAgIFN0b3JhZ2UucHJvdG90eXBlLndoZXJlID0gZnVuY3Rpb24ocXVlcnksIGNhbGxiYWNrKSB7XG4gICAgICAgIGNhbGxiYWNrID0gY2FsbGJhY2sgfHwgZnVuY3Rpb24oKSB7fTtcbiAgICAgICAgdGhpcy5kcml2ZXIud2hlcmUocXVlcnksIGNhbGxiYWNrKTtcbiAgICB9O1xuXG4gICAgU3RvcmFnZS5wcm90b3R5cGUuY2xlYXIgPSBmdW5jdGlvbihjYWxsYmFjaykge1xuICAgICAgICBjYWxsYmFjayA9IGNhbGxiYWNrIHx8IGZ1bmN0aW9uKCkge307XG4gICAgICAgIHRoaXMuZHJpdmVyLmNsZWFyKGNhbGxiYWNrKTtcbiAgICB9O1xuXG4gICAgbW9kdWxlLmV4cG9ydHMgPSBTdG9yYWdlO1xuXG59KSh0aGlzKTsiLCIoZnVuY3Rpb24oKSB7XG4gICAgLy8gaHR0cHM6Ly9naXRodWIuY29tL2steWFrL0pKTEMvYmxvYi9tYXN0ZXIvc2NyaXB0cy9qamxjLmRldi5qc1xuICAgIHZhciByZWdleCA9IC9cXFwiW2EtekEtWjAtOV0qXFxcIjovZyxcbiAgICAgICAgc2VwYXJhdG9yID0gJ8KjJyxcbiAgICAgICAgZGljdHMgPSB7fTtcblxuICAgIGZ1bmN0aW9uIF9zb3J0ZWRCeVZhbHVlKG9iaikge1xuICAgICAgICB2YXIgdHVwbGVzID0gW10sXG4gICAgICAgICAgICBuZXdPYmogPSB7fSxcbiAgICAgICAgICAgIGtleTtcbiAgICAgICAgZm9yIChrZXkgaW4gb2JqKSB7XG4gICAgICAgICAgICB0dXBsZXMucHVzaChba2V5LCBvYmpba2V5XV0pO1xuICAgICAgICB9XG4gICAgICAgIHR1cGxlcy5zb3J0KGZ1bmN0aW9uKGEsIGIpIHtcbiAgICAgICAgICAgIHJldHVybiBiWzFdIC0gYVsxXTtcbiAgICAgICAgfSk7XG4gICAgICAgIGZvciAoa2V5IGluIHR1cGxlcykge1xuICAgICAgICAgICAgbmV3T2JqW3R1cGxlc1trZXldWzBdXSA9IHR1cGxlc1trZXldWzFdO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBuZXdPYmo7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gX2luY0NoYXIocykge1xuICAgICAgICB2YXIgYyA9IHNbcy5sZW5ndGggLSAxXSxcbiAgICAgICAgICAgIHAgPSBzLnN1YnN0cmluZygwLCBzLmxlbmd0aCAtIDEpLFxuICAgICAgICAgICAgbmV4dElkO1xuICAgICAgICBpZiAodHlwZW9mIGMgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICBuZXh0SWQgPSAnYSc7XG4gICAgICAgIH0gZWxzZSBpZiAoYyA9PT0gJ3onKSB7XG4gICAgICAgICAgICBuZXh0SWQgPSAnQSc7XG4gICAgICAgIH0gZWxzZSBpZiAoYyA9PT0gJ1onKSB7XG4gICAgICAgICAgICBuZXh0SWQgPSAnYSc7XG4gICAgICAgICAgICBpZiAocCAhPT0gJycpIHtcbiAgICAgICAgICAgICAgICBwID0gX2luY0NoYXIocCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHAgPSAnYSc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBuZXh0SWQgPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGMuY2hhckNvZGVBdCgwKSArIDEpO1xuICAgICAgICB9XG4gICAgICAgIGMgPSBuZXh0SWQ7XG4gICAgICAgIHJldHVybiBwICsgYztcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBfY3JlYXRlRGljdChzKSB7XG4gICAgICAgIHZhciBkaWN0ID0ge30sXG4gICAgICAgICAgICBjdXJJZCA9ICcnLFxuICAgICAgICAgICAgbSA9IHMubWF0Y2gocmVnZXgpLFxuICAgICAgICAgICAga2V5LFxuICAgICAgICAgICAgc2J2O1xuICAgICAgICBmb3IgKGtleSBpbiBtKSB7XG4gICAgICAgICAgICBpZiAobVtrZXldLmxlbmd0aCA+IChjdXJJZC5sZW5ndGggKyAyKSkge1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgZGljdFttW2tleV1dICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgICAgICAgICBkaWN0W21ba2V5XV0gKz0gMTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBkaWN0W21ba2V5XV0gPSAwO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBzYnYgPSBfc29ydGVkQnlWYWx1ZShkaWN0KTtcbiAgICAgICAgZm9yIChrZXkgaW4gc2J2KSB7XG4gICAgICAgICAgICBjdXJJZCA9IF9pbmNDaGFyKGN1cklkKTtcbiAgICAgICAgICAgIHNidltrZXldID0gc2VwYXJhdG9yICsgY3VySWQgKyBzZXBhcmF0b3I7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHNidjtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBfY29tcHJlc3ModiwgZGljdCkge1xuICAgICAgICB2YXIgaWQsXG4gICAgICAgICAgICByZTtcbiAgICAgICAgZm9yIChpZCBpbiBkaWN0KSB7XG4gICAgICAgICAgICByZSA9IG5ldyBSZWdFeHAoaWQsICdnJyk7XG4gICAgICAgICAgICB2ID0gdi5yZXBsYWNlKHJlLCBkaWN0W2lkXSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHY7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gX2RlY29tcHJlc3ModiwgZGljdCkge1xuICAgICAgICB2YXIgaWQsXG4gICAgICAgICAgICByZTtcbiAgICAgICAgZm9yIChpZCBpbiBkaWN0KSB7XG4gICAgICAgICAgICByZSA9IG5ldyBSZWdFeHAoZGljdFtpZF0sICdnJyk7XG4gICAgICAgICAgICB2ID0gdi5yZXBsYWNlKHJlLCBpZCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHY7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gSkpMQygpIHtcbiAgICAgICAgdGhpcy5zZXRJdGVtID0gZnVuY3Rpb24oa2V5LCBzdHIsIG5zKSB7XG4gICAgICAgICAgICB2YXIgY29tcHJlc3NlZCxcbiAgICAgICAgICAgICAgICBzT2JqZWN0LFxuICAgICAgICAgICAgICAgIGRpY3Q7XG4gICAgICAgICAgICBpZiAodHlwZW9mIG5zID09PSAndW5kZWZpbmVkJyB8fCBucyAhPT0gJ25vLWJlYXV0aWZ5Jykge1xuICAgICAgICAgICAgICAgIHNPYmplY3QgPSBKU09OLnBhcnNlKHN0cik7XG4gICAgICAgICAgICAgICAgc3RyID0gSlNPTi5zdHJpbmdpZnkoc09iamVjdCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBkaWN0ID0gX2NyZWF0ZURpY3Qoc3RyKTtcbiAgICAgICAgICAgIGNvbXByZXNzZWQgPSBfY29tcHJlc3Moc3RyLCBkaWN0KTtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgbnMgIT09ICd1bmRlZmluZWQnICYmIG5zID09PSAnbG9jYWwtZGljdCcpIHtcbiAgICAgICAgICAgICAgICBkaWN0c1trZXldID0gZGljdDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oa2V5LCBjb21wcmVzc2VkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0eXBlb2YgZGljdHNba2V5XSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnZF8nICsga2V5LCBKU09OLnN0cmluZ2lmeShkaWN0KSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gY29tcHJlc3NlZDtcbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy5nZXRJdGVtID0gZnVuY3Rpb24oa2V5KSB7XG4gICAgICAgICAgICB2YXIgZGljdDtcbiAgICAgICAgICAgIHZhciBjb21wcmVzc2VkID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0oa2V5KTtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgZGljdHNba2V5XSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgICAgICBkaWN0ID0gSlNPTi5wYXJzZShsb2NhbFN0b3JhZ2UuZ2V0SXRlbSgnZF8nICsga2V5KSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGRpY3QgPSBkaWN0c1trZXldO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIF9kZWNvbXByZXNzKGNvbXByZXNzZWQsIGRpY3QpO1xuICAgICAgICB9O1xuICAgICAgICB0aGlzLmdldERpY3QgPSBmdW5jdGlvbihrZXkpIHtcbiAgICAgICAgICAgIHZhciBkaWN0O1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBkaWN0c1trZXldID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgICAgIGRpY3QgPSBKU09OLnBhcnNlKGxvY2FsU3RvcmFnZS5nZXRJdGVtKCdkXycgKyBrZXkpKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZGljdCA9IGRpY3RzW2tleV07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gZGljdDtcbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy5zZXREaWN0ID0gZnVuY3Rpb24oa2V5LCBkaWMsIG5zKSB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIG5zID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKCdkXycgKyBrZXksIGRpYyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGRpY3RzW2tleV0gPSBkaWM7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgbW9kdWxlLmV4cG9ydHMgPSBuZXcgSkpMQygpO1xuXG59KSh0aGlzKTsiLCIoZnVuY3Rpb24oKXtcbiAgICBcInVzZSBzdHJpY3RcIjtcblxuICAgIGZ1bmN0aW9uIGxvY2FsV3JhcHBlckZhY3Rvcnkoc3RvcmFnZSkge1xuXG4gICAgICAgIGZ1bmN0aW9uIExvY2FsV3JhcHBlcihwYXRoLCBvcHRpb25zKSB7XG4gICAgICAgICAgICB0aGlzLnN0b3JhZ2UgPSBzdG9yYWdlO1xuICAgICAgICAgICAgdGhpcy5ib290ZWQgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMucGF0aCA9IHBhdGg7XG4gICAgICAgICAgICB0aGlzLm9wdGlvbnMgPSBvcHRpb25zO1xuICAgICAgICB9XG5cbiAgICAgICAgTG9jYWxXcmFwcGVyLnByb3RvdHlwZS5ib290ID0gZnVuY3Rpb24oY2FsbGJhY2spIHtcbiAgICAgICAgICAgIHRoaXMuYm9vdGVkID0gdHJ1ZTtcbiAgICAgICAgICAgIGlmKGNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2sobnVsbCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgTG9jYWxXcmFwcGVyLnByb3RvdHlwZS5nZXQgPSBmdW5jdGlvbihjYWxsYmFjaykge1xuICAgICAgICAgICAgY2FsbGJhY2sgPSBjYWxsYmFjayB8fCBmdW5jdGlvbigpIHt9O1xuICAgICAgICAgICAgdmFyIGRhdGFzID0gdGhpcy5zdG9yYWdlLmdldEl0ZW0odGhpcy5wYXRoKTtcbiAgICAgICAgICAgIGlmICghZGF0YXMpIHtcbiAgICAgICAgICAgICAgICBkYXRhcyA9ICdbXSc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBkYXRhcyA9IEpTT04ucGFyc2UoZGF0YXMpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwgZGF0YXMpO1xuICAgICAgICB9O1xuXG4gICAgICAgIExvY2FsV3JhcHBlci5wcm90b3R5cGUuc2V0ID0gZnVuY3Rpb24oZGF0YXMsIGNhbGxiYWNrKSB7XG4gICAgICAgICAgICBjYWxsYmFjayA9IGNhbGxiYWNrIHx8IGZ1bmN0aW9uKCkge307XG4gICAgICAgICAgICBkYXRhcyA9IEpTT04uc3RyaW5naWZ5KGRhdGFzKTtcbiAgICAgICAgICAgIHRoaXMuc3RvcmFnZS5zZXRJdGVtKHRoaXMucGF0aCwgZGF0YXMpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCk7XG4gICAgICAgIH07XG5cbiAgICAgICAgTG9jYWxXcmFwcGVyLnByb3RvdHlwZS53aGVyZSA9IGZ1bmN0aW9uKHF1ZXJ5LCBjYWxsYmFjaykge1xuICAgICAgICAgICAgY2FsbGJhY2sgPSBjYWxsYmFjayB8fCBmdW5jdGlvbigpIHt9O1xuICAgICAgICAgICAgdGhpcy5nZXQoZnVuY3Rpb24oZXJyLCBkYXRhcykge1xuICAgICAgICAgICAgICAgIGlmIChlcnIpIHJldHVybiBjYWxsYmFjayhlcnIpO1xuICAgICAgICAgICAgICAgIGRhdGFzID0gdXRpbHMuc2lmdChxdWVyeSwgZGF0YXMpO1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIGRhdGFzKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9O1xuXG4gICAgICAgIExvY2FsV3JhcHBlci5wcm90b3R5cGUuY2xlYXIgPSBmdW5jdGlvbihjYWxsYmFjaykge1xuICAgICAgICAgICAgY2FsbGJhY2sgPSBjYWxsYmFjayB8fCBmdW5jdGlvbigpIHt9O1xuICAgICAgICAgICAgdGhpcy5zZXQoW10sIGZ1bmN0aW9uKGVycikge1xuICAgICAgICAgICAgICAgIGlmIChlcnIpIHJldHVybiBjYWxsYmFjayhlcnIpO1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKG51bGwpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgcmV0dXJuIExvY2FsV3JhcHBlcjtcbiAgICB9XG5cbiAgICBtb2R1bGUuZXhwb3J0cyA9IGxvY2FsV3JhcHBlckZhY3Rvcnk7XG5cbn0pKHRoaXMpOyIsIihmdW5jdGlvbigpe1xuICAgIHZhciBzdG9yYWdlID0ge307XG4gICAgbW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgICAgIGdldEl0ZW06IGZ1bmN0aW9uKHBhdGgpIHtcbiAgICAgICAgICAgIGlmKCFzdG9yYWdlW3BhdGhdKSB7XG4gICAgICAgICAgICAgICAgLy8gbG9jYWxTdG9yYWdlIHNhdmVzIGRhdGEgaW4gc3RyaW5nXG4gICAgICAgICAgICAgICAgc3RvcmFnZVtwYXRoXSA9ICcnO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHN0b3JhZ2VbcGF0aF07XG4gICAgICAgIH0sXG4gICAgICAgIHNldEl0ZW06IGZ1bmN0aW9uKHBhdGgsIHZhbHVlKSB7XG4gICAgICAgICAgICBzdG9yYWdlW3BhdGhdID0gdmFsdWU7XG4gICAgICAgIH1cbiAgICB9O1xufSkodGhpcyk7IiwiKGZ1bmN0aW9uKCkge1xuICAgIFwidXNlIHN0cmljdFwiO1xuXG4gICAgLy8gaHR0cDovL2FuZHJld2R1cG9udC5uZXQvMjAwOS8wOC8yOC9kZWVwLWV4dGVuZGluZy1vYmplY3RzLWluLWphdmFzY3JpcHQvXG4gICAgZnVuY3Rpb24gZGVlcEV4dGVuZChkZXN0aW5hdGlvbiwgc291cmNlKSB7XG4gICAgICAgIGZvciAodmFyIHByb3BlcnR5IGluIHNvdXJjZSkge1xuICAgICAgICAgICAgaWYgKHNvdXJjZVtwcm9wZXJ0eV0gJiYgc291cmNlW3Byb3BlcnR5XS5jb25zdHJ1Y3RvciAmJlxuICAgICAgICAgICAgICAgIHNvdXJjZVtwcm9wZXJ0eV0uY29uc3RydWN0b3IgPT09IE9iamVjdCkge1xuICAgICAgICAgICAgICAgIGRlc3RpbmF0aW9uW3Byb3BlcnR5XSA9IGRlc3RpbmF0aW9uW3Byb3BlcnR5XSB8fCB7fTtcbiAgICAgICAgICAgICAgICBkZWVwRXh0ZW5kKGRlc3RpbmF0aW9uW3Byb3BlcnR5XSwgc291cmNlW3Byb3BlcnR5XSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGRlc3RpbmF0aW9uW3Byb3BlcnR5XSA9IHNvdXJjZVtwcm9wZXJ0eV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGRlc3RpbmF0aW9uO1xuICAgIH1cblxuICAgIG1vZHVsZS5leHBvcnRzID0gZGVlcEV4dGVuZDtcbn0pKHRoaXMpOyIsIihmdW5jdGlvbigpe1xuICAgIFwidXNlIHN0cmljdFwiO1xuXG4gICAgZnVuY3Rpb24gRWV2ICgpIHtcbiAgICAgICAgdGhpcy5fZXZlbnRzID0ge307XG4gICAgfVxuXG4gICAgRWV2LnByb3RvdHlwZSA9IHtcbiAgICAgICAgb246IGZ1bmN0aW9uKG5hbWVzLCBmbikge1xuICAgICAgICAgICAgdmFyIG1lID0gdGhpcztcbiAgICAgICAgICAgIG5hbWVzLnNwbGl0KC9cXHMrL2cpLmZvckVhY2goZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZighbWUuX2V2ZW50c1tuYW1lXSkgbWUuX2V2ZW50c1tuYW1lXSA9IFtdO1xuICAgICAgICAgICAgICAgIG1lLl9ldmVudHNbbmFtZV0ucHVzaChmbik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICB9LFxuXG4gICAgICAgIG9mZjogZnVuY3Rpb24obmFtZXMsIGZuKSB7XG4gICAgICAgICAgICB2YXIgbWUgPSB0aGlzO1xuICAgICAgICAgICAgbmFtZXMuc3BsaXQoL1xccysvZykuZm9yRWFjaChmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgICAgICAgICAgdmFyIGxpc3QgPSBtZS5fZXZlbnRzW25hbWVdO1xuICAgICAgICAgICAgICAgIGlmKGxpc3QpIHtcbiAgICAgICAgICAgICAgICAgICAgbWUuX2V2ZW50c1tuYW1lXSA9IG1lLl9ldmVudHNbbmFtZV0uZmlsdGVyKGZ1bmN0aW9uKGZuKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmbiAhPT0gZm47XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIH0sXG5cbiAgICAgICAgb25jZTogZnVuY3Rpb24obmFtZXMsIGZuKSB7XG4gICAgICAgICAgICB2YXIgbWUgPSB0aGlzO1xuICAgICAgICAgICAgbmFtZXMuc3BsaXQoL1xccysvZykuZm9yRWFjaChmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmKCFtZS5fZXZlbnRzW25hbWVdKSBtZS5fZXZlbnRzW25hbWVdID0gW107XG4gICAgICAgICAgICAgICAgZm4uX2NhbGxPbmNlID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBtZS5fZXZlbnRzW25hbWVdLnB1c2goZm4pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgfSxcblxuICAgICAgICBlbWl0OiBmdW5jdGlvbihuYW1lLCBkYXRhLCBjb250ZXh0KSB7XG4gICAgICAgICAgICB2YXIgbWUgPSB0aGlzO1xuICAgICAgICAgICAgY29udGV4dCA9IGNvbnRleHQgfHwgdGhpcztcbiAgICAgICAgICAgIHZhciBldnQgPSB0aGlzLl9ldmVudHNbbmFtZV0gfHwgKHRoaXMuX2V2ZW50c1tuYW1lXSA9IFtdKTtcbiAgICAgICAgICAgIGV2dC5mb3JFYWNoKGZ1bmN0aW9uKGZuKXtcbiAgICAgICAgICAgICAgICBpZihmbi5fY2FsbE9uY2UpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVsZXRlIGZuLl9jYWxsT25jZTtcbiAgICAgICAgICAgICAgICAgICAgZm4uY2FsbChjb250ZXh0LCBkYXRhKTtcbiAgICAgICAgICAgICAgICAgICAgbWUub2ZmKG5hbWUsIGZuKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG1lO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBmbi5jYWxsKGNvbnRleHQsIGRhdGEpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICBtb2R1bGUuZXhwb3J0cyA9IEVldjtcbn0pKHRoaXMpOyIsIihmdW5jdGlvbigpIHtcbiAgICBcInVzZSBzdHJpY3RcIjtcblxuICAgIHZhciB1dGlscyA9IHt9O1xuXG4gICAgdXRpbHMuc2lmdCA9IHJlcXVpcmUoJy4vc2lmdCcpO1xuXG4gICAgdXRpbHMudXVpZCA9IHJlcXVpcmUoJy4vdXVpZCcpO1xuXG4gICAgdXRpbHMuRWV2ID0gcmVxdWlyZSgnLi9lZXYnKTtcblxuICAgIHV0aWxzLmRlZXBFeHRlbmQgPSByZXF1aXJlKCcuL2RlZXBFeHRlbmQnKTtcblxuICAgIG1vZHVsZS5leHBvcnRzID0gdXRpbHM7XG5cbn0pKHRoaXMpOyIsIihmdW5jdGlvbigpIHtcbiAgICBcInVzZSBzdHJpY3RcIjtcblxuICAgIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9jcmNuL3NpZnQuanMvdHJlZS9tYXN0ZXJcblxuICAgIGZ1bmN0aW9uIGlzRnVuY3Rpb24odmFsdWUpIHtcbiAgICAgICAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ2Z1bmN0aW9uJztcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBpc0FycmF5KHZhbHVlKSB7XG4gICAgICAgIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwodmFsdWUpID09PSAnW29iamVjdCBBcnJheV0nO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNvbXBhcmFibGUodmFsdWUpIHtcbiAgICAgICAgaWYgKHZhbHVlIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgICAgICAgcmV0dXJuIHZhbHVlLmdldFRpbWUoKTtcbiAgICAgICAgfSBlbHNlIGlmICh2YWx1ZSBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICAgICAgICByZXR1cm4gdmFsdWUubWFwKGNvbXBhcmFibGUpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2V0KG9iaiwga2V5KSB7XG4gICAgICAgIGlmIChvYmouZ2V0KSByZXR1cm4gb2JqLmdldChrZXkpO1xuICAgICAgICByZXR1cm4gb2JqW2tleV07XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gb3IodmFsaWRhdG9yKSB7XG4gICAgICAgIHJldHVybiBmdW5jdGlvbihhLCBiKSB7XG4gICAgICAgICAgICBpZiAoIWlzQXJyYXkoYikgfHwgIWIubGVuZ3RoKSByZXR1cm4gdmFsaWRhdG9yKGEsIGIpO1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDAsIG4gPSBiLmxlbmd0aDsgaSA8IG47IGkrKylcbiAgICAgICAgICAgICAgICBpZiAodmFsaWRhdG9yKGEsIGdldChiLCBpKSkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGFuZCh2YWxpZGF0b3IpIHtcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKGEsIGIpIHtcbiAgICAgICAgICAgIGlmICghaXNBcnJheShiKSB8fCAhYi5sZW5ndGgpIHJldHVybiB2YWxpZGF0b3IoYSwgYik7XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMCwgbiA9IGIubGVuZ3RoOyBpIDwgbjsgaSsrKVxuICAgICAgICAgICAgICAgIGlmICghdmFsaWRhdG9yKGEsIGdldChiLCBpKSkpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHZhbGlkYXRlKHZhbGlkYXRvciwgYikge1xuICAgICAgICByZXR1cm4gdmFsaWRhdG9yLnYodmFsaWRhdG9yLmEsIGIpO1xuICAgIH1cblxuXG4gICAgdmFyIG9wZXJhdG9yID0ge1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKi9cblxuICAgICAgICAkZXE6IG9yKGZ1bmN0aW9uKGEsIGIpIHtcbiAgICAgICAgICAgIHJldHVybiBhKGIpO1xuICAgICAgICB9KSxcblxuICAgICAgICAvKipcbiAgICAgICAgICovXG5cbiAgICAgICAgJG5lOiBhbmQoZnVuY3Rpb24oYSwgYikge1xuICAgICAgICAgICAgcmV0dXJuICFhKGIpO1xuICAgICAgICB9KSxcblxuICAgICAgICAvKipcbiAgICAgICAgICovXG5cbiAgICAgICAgJG9yOiBmdW5jdGlvbihhLCBiKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMCwgbiA9IGEubGVuZ3RoOyBpIDwgbjsgaSsrKVxuICAgICAgICAgICAgICAgIGlmICh2YWxpZGF0ZShnZXQoYSwgaSksIGIpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICovXG5cbiAgICAgICAgJGd0OiBvcihmdW5jdGlvbihhLCBiKSB7XG4gICAgICAgICAgICByZXR1cm4gc2lmdC5jb21wYXJlKGNvbXBhcmFibGUoYiksIGEpID4gMDtcbiAgICAgICAgfSksXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqL1xuXG4gICAgICAgICRndGU6IG9yKGZ1bmN0aW9uKGEsIGIpIHtcbiAgICAgICAgICAgIHJldHVybiBzaWZ0LmNvbXBhcmUoY29tcGFyYWJsZShiKSwgYSkgPj0gMDtcbiAgICAgICAgfSksXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqL1xuXG4gICAgICAgICRsdDogb3IoZnVuY3Rpb24oYSwgYikge1xuICAgICAgICAgICAgcmV0dXJuIHNpZnQuY29tcGFyZShjb21wYXJhYmxlKGIpLCBhKSA8IDA7XG4gICAgICAgIH0pLFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKi9cblxuICAgICAgICAkbHRlOiBvcihmdW5jdGlvbihhLCBiKSB7XG4gICAgICAgICAgICByZXR1cm4gc2lmdC5jb21wYXJlKGNvbXBhcmFibGUoYiksIGEpIDw9IDA7XG4gICAgICAgIH0pLFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKi9cblxuICAgICAgICAkbW9kOiBvcihmdW5jdGlvbihhLCBiKSB7XG4gICAgICAgICAgICByZXR1cm4gYiAlIGFbMF0gPT0gYVsxXTtcbiAgICAgICAgfSksXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqL1xuXG4gICAgICAgICRpbjogZnVuY3Rpb24oYSwgYikge1xuXG4gICAgICAgICAgICBpZiAoYiBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICAgICAgICAgICAgZm9yICh2YXIgaSA9IGIubGVuZ3RoOyBpLS07KSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh+YS5pbmRleE9mKGNvbXBhcmFibGUoZ2V0KGIsIGkpKSkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuICEhfmEuaW5kZXhPZihjb21wYXJhYmxlKGIpKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKi9cblxuICAgICAgICAkbmluOiBmdW5jdGlvbihhLCBiKSB7XG4gICAgICAgICAgICByZXR1cm4gIW9wZXJhdG9yLiRpbihhLCBiKTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICovXG5cbiAgICAgICAgJG5vdDogZnVuY3Rpb24oYSwgYikge1xuICAgICAgICAgICAgcmV0dXJuICF2YWxpZGF0ZShhLCBiKTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICovXG5cbiAgICAgICAgJHR5cGU6IGZ1bmN0aW9uKGEsIGIpIHtcbiAgICAgICAgICAgIHJldHVybiBiICE9IHZvaWQgMCA/IGIgaW5zdGFuY2VvZiBhIHx8IGIuY29uc3RydWN0b3IgPT0gYSA6IGZhbHNlO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKi9cblxuICAgICAgICAkYWxsOiBmdW5jdGlvbihhLCBiKSB7XG4gICAgICAgICAgICBpZiAoIWIpIGIgPSBbXTtcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSBhLmxlbmd0aDsgaS0tOykge1xuICAgICAgICAgICAgICAgIGlmICghfmNvbXBhcmFibGUoYikuaW5kZXhPZihnZXQoYSwgaSkpKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICovXG5cbiAgICAgICAgJHNpemU6IGZ1bmN0aW9uKGEsIGIpIHtcbiAgICAgICAgICAgIHJldHVybiBiID8gYSA9PT0gYi5sZW5ndGggOiBmYWxzZTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICovXG5cbiAgICAgICAgJG5vcjogZnVuY3Rpb24oYSwgYikge1xuICAgICAgICAgICAgLy8gdG9kbyAtIHRoaXMgc3VmZmljZT8gcmV0dXJuICFvcGVyYXRvci4kaW4oYSlcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwLCBuID0gYS5sZW5ndGg7IGkgPCBuOyBpKyspXG4gICAgICAgICAgICAgICAgaWYgKHZhbGlkYXRlKGdldChhLCBpKSwgYikpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKi9cblxuICAgICAgICAkYW5kOiBmdW5jdGlvbihhLCBiKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMCwgbiA9IGEubGVuZ3RoOyBpIDwgbjsgaSsrKVxuICAgICAgICAgICAgICAgIGlmICghdmFsaWRhdGUoZ2V0KGEsIGkpLCBiKSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqL1xuXG4gICAgICAgICRyZWdleDogb3IoZnVuY3Rpb24oYSwgYikge1xuICAgICAgICAgICAgcmV0dXJuIHR5cGVvZiBiID09PSAnc3RyaW5nJyAmJiBhLnRlc3QoYik7XG4gICAgICAgIH0pLFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKi9cblxuICAgICAgICAkd2hlcmU6IGZ1bmN0aW9uKGEsIGIpIHtcbiAgICAgICAgICAgIHJldHVybiBhLmNhbGwoYiwgYik7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqL1xuXG4gICAgICAgICRlbGVtTWF0Y2g6IGZ1bmN0aW9uKGEsIGIpIHtcbiAgICAgICAgICAgIGlmIChpc0FycmF5KGIpKSByZXR1cm4gISF+c2VhcmNoKGIsIGEpO1xuICAgICAgICAgICAgcmV0dXJuIHZhbGlkYXRlKGEsIGIpO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKi9cblxuICAgICAgICAkZXhpc3RzOiBmdW5jdGlvbihhLCBiKSB7XG4gICAgICAgICAgICByZXR1cm4gKGIgIT0gdm9pZCAwKSA9PT0gYTtcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICB2YXIgcHJlcGFyZSA9IHtcblxuICAgICAgICAvKipcbiAgICAgICAgICovXG5cbiAgICAgICAgJGVxOiBmdW5jdGlvbihhKSB7XG5cbiAgICAgICAgICAgIGlmIChhIGluc3RhbmNlb2YgUmVnRXhwKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKGIpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHR5cGVvZiBiID09PSAnc3RyaW5nJyAmJiBhLnRlc3QoYik7XG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoYSBpbnN0YW5jZW9mIEZ1bmN0aW9uKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGE7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGlzQXJyYXkoYSkgJiYgIWEubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgLy8gU3BlY2lhbCBjYXNlIG9mIGEgPT0gW11cbiAgICAgICAgICAgICAgICByZXR1cm4gZnVuY3Rpb24oYikge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gKGlzQXJyYXkoYikgJiYgIWIubGVuZ3RoKTtcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfSBlbHNlIGlmIChhID09PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKGIpIHtcbiAgICAgICAgICAgICAgICAgICAgLy93aWxsIG1hdGNoIGJvdGggbnVsbCBhbmQgdW5kZWZpbmVkXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAoYiA9PT0gbnVsbCB8fCBiID09PSB1bmRlZmluZWQpO1xuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBmdW5jdGlvbihiKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNpZnQuY29tcGFyZShjb21wYXJhYmxlKGIpLCBhKSA9PT0gMDtcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqL1xuXG4gICAgICAgICRuZTogZnVuY3Rpb24oYSkge1xuICAgICAgICAgICAgcmV0dXJuIHByZXBhcmUuJGVxKGEpO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKi9cblxuICAgICAgICAkYW5kOiBmdW5jdGlvbihhKSB7XG4gICAgICAgICAgICByZXR1cm4gYS5tYXAocGFyc2UpO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKi9cblxuICAgICAgICAkb3I6IGZ1bmN0aW9uKGEpIHtcbiAgICAgICAgICAgIHJldHVybiBhLm1hcChwYXJzZSk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqL1xuXG4gICAgICAgICRub3I6IGZ1bmN0aW9uKGEpIHtcbiAgICAgICAgICAgIHJldHVybiBhLm1hcChwYXJzZSk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqL1xuXG4gICAgICAgICRub3Q6IGZ1bmN0aW9uKGEpIHtcbiAgICAgICAgICAgIHJldHVybiBwYXJzZShhKTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICovXG5cbiAgICAgICAgJHJlZ2V4OiBmdW5jdGlvbihhLCBxdWVyeSkge1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBSZWdFeHAoYSwgcXVlcnkuJG9wdGlvbnMpO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKi9cblxuICAgICAgICAkd2hlcmU6IGZ1bmN0aW9uKGEpIHtcbiAgICAgICAgICAgIHJldHVybiBhO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKi9cblxuICAgICAgICAkZWxlbU1hdGNoOiBmdW5jdGlvbihhKSB7XG4gICAgICAgICAgICByZXR1cm4gcGFyc2UoYSk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqL1xuXG4gICAgICAgICRleGlzdHM6IGZ1bmN0aW9uKGEpIHtcbiAgICAgICAgICAgIHJldHVybiAhIWE7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgZnVuY3Rpb24gc2VhcmNoKGFycmF5LCB2YWxpZGF0b3IpIHtcblxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGFycmF5Lmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBpZiAodmFsaWRhdGUodmFsaWRhdG9yLCBnZXQoYXJyYXksIGkpKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIC0xO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNyZWF0ZVZhbGlkYXRvcihhLCB2YWxpZGF0ZSkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgYTogYSxcbiAgICAgICAgICAgIHY6IHZhbGlkYXRlXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbmVzdGVkVmFsaWRhdG9yKGEsIGIpIHtcbiAgICAgICAgdmFyIHZhbHVlcyA9IFtdO1xuICAgICAgICBmaW5kVmFsdWVzKGIsIGEuaywgMCwgdmFsdWVzKTtcblxuICAgICAgICBpZiAodmFsdWVzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICAgICAgcmV0dXJuIHZhbGlkYXRlKGEubnYsIHZhbHVlc1swXSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gISF+c2VhcmNoKHZhbHVlcywgYS5udik7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZmluZFZhbHVlcyhjdXJyZW50LCBrZXlwYXRoLCBpbmRleCwgdmFsdWVzKSB7XG5cbiAgICAgICAgaWYgKGluZGV4ID09PSBrZXlwYXRoLmxlbmd0aCB8fCBjdXJyZW50ID09IHZvaWQgMCkge1xuICAgICAgICAgICAgdmFsdWVzLnB1c2goY3VycmVudCk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgayA9IGdldChrZXlwYXRoLCBpbmRleCk7XG5cbiAgICAgICAgLy8gZW5zdXJlIHRoYXQgaWYgY3VycmVudCBpcyBhbiBhcnJheSwgdGhhdCB0aGUgY3VycmVudCBrZXlcbiAgICAgICAgLy8gaXMgTk9UIGFuIGFycmF5IGluZGV4LiBUaGlzIHNvcnQgb2YgdGhpbmcgbmVlZHMgdG8gd29yazpcbiAgICAgICAgLy8gc2lmdCh7J2Zvby4wJzo0Mn0sIFt7Zm9vOiBbNDJdfV0pO1xuICAgICAgICBpZiAoaXNBcnJheShjdXJyZW50KSAmJiBpc05hTihOdW1iZXIoaykpKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMCwgbiA9IGN1cnJlbnQubGVuZ3RoOyBpIDwgbjsgaSsrKSB7XG4gICAgICAgICAgICAgICAgZmluZFZhbHVlcyhnZXQoY3VycmVudCwgaSksIGtleXBhdGgsIGluZGV4LCB2YWx1ZXMpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZmluZFZhbHVlcyhnZXQoY3VycmVudCwgayksIGtleXBhdGgsIGluZGV4ICsgMSwgdmFsdWVzKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNyZWF0ZU5lc3RlZFZhbGlkYXRvcihrZXlwYXRoLCBhKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBhOiB7XG4gICAgICAgICAgICAgICAgazoga2V5cGF0aCxcbiAgICAgICAgICAgICAgICBudjogYVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHY6IG5lc3RlZFZhbGlkYXRvclxuICAgICAgICB9O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIGZsYXR0ZW4gdGhlIHF1ZXJ5XG4gICAgICovXG5cbiAgICBmdW5jdGlvbiBwYXJzZShxdWVyeSkge1xuICAgICAgICBxdWVyeSA9IGNvbXBhcmFibGUocXVlcnkpO1xuXG4gICAgICAgIGlmICghcXVlcnkgfHwgKHF1ZXJ5LmNvbnN0cnVjdG9yLnRvU3RyaW5nKCkgIT09ICdPYmplY3QnICYmXG4gICAgICAgICAgICBxdWVyeS5jb25zdHJ1Y3Rvci50b1N0cmluZygpLnJlcGxhY2UoL1xcbi9nLCAnJykucmVwbGFjZSgvIC9nLCAnJykgIT09ICdmdW5jdGlvbk9iamVjdCgpe1tuYXRpdmVjb2RlXX0nKSkgeyAvLyBjcm9zcyBicm93c2VyIHN1cHBvcnRcbiAgICAgICAgICAgIHF1ZXJ5ID0ge1xuICAgICAgICAgICAgICAgICRlcTogcXVlcnlcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgdmFsaWRhdG9ycyA9IFtdO1xuXG4gICAgICAgIGZvciAodmFyIGtleSBpbiBxdWVyeSkge1xuICAgICAgICAgICAgdmFyIGEgPSBxdWVyeVtrZXldO1xuXG4gICAgICAgICAgICBpZiAoa2V5ID09PSAnJG9wdGlvbnMnKSBjb250aW51ZTtcblxuICAgICAgICAgICAgaWYgKG9wZXJhdG9yW2tleV0pIHtcbiAgICAgICAgICAgICAgICBpZiAocHJlcGFyZVtrZXldKSBhID0gcHJlcGFyZVtrZXldKGEsIHF1ZXJ5KTtcbiAgICAgICAgICAgICAgICB2YWxpZGF0b3JzLnB1c2goY3JlYXRlVmFsaWRhdG9yKGNvbXBhcmFibGUoYSksIG9wZXJhdG9yW2tleV0pKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG5cbiAgICAgICAgICAgICAgICBpZiAoa2V5LmNoYXJDb2RlQXQoMCkgPT09IDM2KSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignVW5rbm93biBvcGVyYXRpb24gJyArIGtleSk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdmFsaWRhdG9ycy5wdXNoKGNyZWF0ZU5lc3RlZFZhbGlkYXRvcihrZXkuc3BsaXQoJy4nKSwgcGFyc2UoYSkpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB2YWxpZGF0b3JzLmxlbmd0aCA9PT0gMSA/IHZhbGlkYXRvcnNbMF0gOiBjcmVhdGVWYWxpZGF0b3IodmFsaWRhdG9ycywgb3BlcmF0b3IuJGFuZCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY3JlYXRlUm9vdFZhbGlkYXRvcihxdWVyeSwgZ2V0dGVyKSB7XG4gICAgICAgIHZhciB2YWxpZGF0b3IgPSBwYXJzZShxdWVyeSk7XG4gICAgICAgIGlmIChnZXR0ZXIpIHtcbiAgICAgICAgICAgIHZhbGlkYXRvciA9IHtcbiAgICAgICAgICAgICAgICBhOiB2YWxpZGF0b3IsXG4gICAgICAgICAgICAgICAgdjogZnVuY3Rpb24oYSwgYikge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdmFsaWRhdGUoYSwgZ2V0dGVyKGIpKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB2YWxpZGF0b3I7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc2lmdChxdWVyeSwgYXJyYXksIGdldHRlcikge1xuXG4gICAgICAgIGlmIChpc0Z1bmN0aW9uKGFycmF5KSkge1xuICAgICAgICAgICAgZ2V0dGVyID0gYXJyYXk7XG4gICAgICAgICAgICBhcnJheSA9IHZvaWQgMDtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciB2YWxpZGF0b3IgPSBjcmVhdGVSb290VmFsaWRhdG9yKHF1ZXJ5LCBnZXR0ZXIpO1xuXG4gICAgICAgIGZ1bmN0aW9uIGZpbHRlcihiKSB7XG4gICAgICAgICAgICByZXR1cm4gdmFsaWRhdGUodmFsaWRhdG9yLCBiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChhcnJheSkge1xuICAgICAgICAgICAgcmV0dXJuIGFycmF5LmZpbHRlcihmaWx0ZXIpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGZpbHRlcjtcbiAgICB9XG5cbiAgICBzaWZ0LnVzZSA9IGZ1bmN0aW9uKHBsdWdpbikge1xuICAgICAgICBpZiAoaXNGdW5jdGlvbihwbHVnaW4pKSByZXR1cm4gcGx1Z2luKHNpZnQpO1xuICAgICAgICBmb3IgKHZhciBrZXkgaW4gcGx1Z2luKSB7XG4gICAgICAgICAgICBpZiAoa2V5LmNoYXJDb2RlQXQoMCkgPT09IDM2KSBvcGVyYXRvcltrZXldID0gcGx1Z2luW2tleV07XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgc2lmdC5pbmRleE9mID0gZnVuY3Rpb24ocXVlcnksIGFycmF5LCBnZXR0ZXIpIHtcbiAgICAgICAgcmV0dXJuIHNlYXJjaChhcnJheSwgY3JlYXRlUm9vdFZhbGlkYXRvcihxdWVyeSwgZ2V0dGVyKSk7XG4gICAgfTtcblxuICAgIHNpZnQuY29tcGFyZSA9IGZ1bmN0aW9uKGEsIGIpIHtcbiAgICAgICAgaWYgKGEgPT09IGIpIHJldHVybiAwO1xuICAgICAgICBpZiAodHlwZW9mIGEgPT09IHR5cGVvZiBiKSB7XG4gICAgICAgICAgICBpZiAoYSA+IGIpIHJldHVybiAxO1xuICAgICAgICAgICAgaWYgKGEgPCBiKSByZXR1cm4gLTE7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgbW9kdWxlLmV4cG9ydHMgPSBzaWZ0O1xuXG59KSh0aGlzKTsiLCIoZnVuY3Rpb24oKXtcbiAgICBcInVzZSBzdHJpY3RcIjtcblxuICAgIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9tYWtlYWJsZS91dWlkLXY0LmpzXG4gICAgdmFyIGRlYzJoZXggPSBbXTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8PSAxNTsgaSsrKSB7XG4gICAgICAgIGRlYzJoZXhbaV0gPSBpLnRvU3RyaW5nKDE2KTtcbiAgICB9XG4gICAgZnVuY3Rpb24gdXVpZCgpIHtcbiAgICAgICAgdmFyIHV1aWQgPSAnJztcbiAgICAgICAgZm9yICh2YXIgaSA9IDE7IGkgPD0gMzY7IGkrKykge1xuICAgICAgICAgICAgaWYgKGkgPT09IDkgfHwgaSA9PT0gMTQgfHwgaSA9PT0gMTkgfHwgaSA9PT0gMjQpIHtcbiAgICAgICAgICAgICAgICB1dWlkICs9ICctJztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoaSA9PT0gMTUpIHtcbiAgICAgICAgICAgICAgICB1dWlkICs9IDQ7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGkgPT09IDIwKSB7XG4gICAgICAgICAgICAgICAgdXVpZCArPSBkZWMyaGV4WyhNYXRoLnJhbmRvbSgpICogNCB8IDAgKyA4KV07XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHV1aWQgKz0gZGVjMmhleFsoTWF0aC5yYW5kb20oKSAqIDE1IHwgMCldO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB1dWlkO1xuICAgIH1cblxuICAgIG1vZHVsZS5leHBvcnRzID0gdXVpZDtcblxufSkodGhpcyk7IiwiKGZ1bmN0aW9uKCkge1xuICAgICd1c2Ugc3RyaWN0JztcblxuICAgIHZhciBzdG9yYWdlID0gcmVxdWlyZSgnLi9zdG9yYWdlJyk7XG4gICAgdmFyIHV0aWxzID0gcmVxdWlyZSgnLi91dGlscycpO1xuXG4gICAgLyoqXG4gICAgICogTW9kZWwgU3RhcnRcbiAgICAgKi9cblxuICAgIHZhciBNb2RlbCA9IHJlcXVpcmUoJy4vbW9kdWxlcy9tb2RlbCcpO1xuXG4gICAgLyoqXG4gICAgICogUXVlcnkgc3RhcnRcbiAgICAgKi9cblxuICAgIHZhciBRdWVyeSA9IHJlcXVpcmUoJy4vbW9kdWxlcy9xdWVyeScpO1xuXG4gICAgLyoqXG4gICAgICogRW5kcG9pbnQgc3RhcnRcbiAgICAgKi9cblxuICAgIHZhciBFbmRwb2ludCA9IHJlcXVpcmUoJy4vbW9kdWxlcy9lbmRwb2ludCcpO1xuXG4gICAgLy8gRXhwb3J0c1xuXG4gICAgdmFyIENhc3RNeURhdGEgPSB7XG4gICAgICAgIE1vZGVsOiBNb2RlbCxcbiAgICAgICAgUXVlcnk6IFF1ZXJ5LFxuICAgICAgICBFbmRwb2ludDogRW5kcG9pbnQsXG4gICAgICAgIFV0aWxzOiB1dGlscyxcbiAgICB9O1xuXG4gICAgbW9kdWxlLmV4cG9ydHMgPSBDYXN0TXlEYXRhO1xuXG59KSh0aGlzKTsiXX0=
