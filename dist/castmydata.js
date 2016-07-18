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
    var localStorage = (typeof localStorage !== 'undefined') ? localStorage : null;
    if(!localStorage) {
        var LocalStorage = require('node-localstorage').LocalStorage;
        localStorage = new LocalStorage('./scratch');
    }
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

    var localStorage = (typeof localStorage !== 'undefined') ? localStorage : null;
    if(!localStorage) {
        var LocalStorage = require('node-localstorage').LocalStorage;
        localStorage = new LocalStorage('./scratch');
    }

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9saWIvX2VtcHR5LmpzIiwic3JjL21vZHVsZXMvTW9kZWwuanMiLCJzcmMvbW9kdWxlcy9RdWVyeS5qcyIsInNyYy9tb2R1bGVzL2VuZHBvaW50LmpzIiwic3JjL3N0b3JhZ2UvaW5kZXguanMiLCJzcmMvc3RvcmFnZS9qamxjLmpzIiwic3JjL3N0b3JhZ2UvbG9jYWxXcmFwcGVyRmFjdG9yeS5qcyIsInNyYy9zdG9yYWdlL21lbW9yeS5qcyIsInNyYy91dGlscy9kZWVwRXh0ZW5kLmpzIiwic3JjL3V0aWxzL2Vldi5qcyIsInNyYy91dGlscy9pbmRleC5qcyIsInNyYy91dGlscy9zaWZ0LmpzIiwic3JjL3V0aWxzL3V1aWQuanMiLCJzcmMvY2FzdG15ZGF0YS5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBOztBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7OztBQzNXQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNkQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1Y0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiIiwiKGZ1bmN0aW9uKCl7XG4gICAgXCJ1c2Ugc3RyaWN0XCI7XG5cbiAgICB2YXIgdXRpbHMgPSByZXF1aXJlKCcuLi91dGlscycpO1xuXG4gICAgZnVuY3Rpb24gZ2V0UmVjb3JkKG1vZGVsKSB7XG4gICAgICAgIHZhciByZWNvcmQgPSB7fTtcbiAgICAgICAgZm9yKHZhciBrZXkgaW4gbW9kZWwpIHtcbiAgICAgICAgICAgIGlmIChtb2RlbC5oYXNPd25Qcm9wZXJ0eShrZXkpICYmIFsnJCRoYXNoS2V5JywgJ19lbmRwb2ludCcsICdfZXZlbnRzJ10uaW5kZXhPZihrZXkpID09IC0xKSB7XG4gICAgICAgICAgICAgICAgcmVjb3JkW2tleV0gPSBtb2RlbFtrZXldO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZWNvcmQ7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gTW9kZWwocG9pbnQsIHBhcmFtcykge1xuICAgICAgICBwYXJhbXMgPSBwYXJhbXMgfHwge307XG4gICAgICAgIHV0aWxzLmRlZXBFeHRlbmQodGhpcywgcGFyYW1zKTtcbiAgICAgICAgdGhpcy5pZCA9IHRoaXMuaWQgfHwgdXRpbHMudXVpZCgpO1xuICAgICAgICB0aGlzLm1ldGEgPSB0aGlzLm1ldGEgfHwge307XG4gICAgICAgIHRoaXMuX2V2ZW50cyA9IHt9O1xuICAgICAgICB0aGlzLl9lbmRwb2ludCA9IHBvaW50O1xuICAgIH1cblxuICAgIE1vZGVsLnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUodXRpbHMuRWV2LnByb3RvdHlwZSk7XG5cbiAgICBNb2RlbC5wcm90b3R5cGUuZ2V0ID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiBnZXRSZWNvcmQodGhpcyk7XG4gICAgfTtcblxuICAgIE1vZGVsLnByb3RvdHlwZS5wb3N0ID0gZnVuY3Rpb24oY2FsbGJhY2spIHtcblxuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICAgICAgLy8gcmVnaXN0ZXIgY2FsbGJhY2tcbiAgICAgICAgaWYgKGNhbGxiYWNrKSB0aGlzLl9lbmRwb2ludC5fc29ja2V0Lm9uY2UoJ3JlY2VpcHQ6cG9zdCcsIGNhbGxiYWNrKTtcblxuICAgICAgICAvLyB1cGRhdGUgcHJvcGVydGllc1xuICAgICAgICB2YXIgcGFyYW1zID0ge1xuICAgICAgICAgICAgbWV0YToge1xuICAgICAgICAgICAgICAgIHN5bmNlZDogZmFsc2UsXG4gICAgICAgICAgICAgICAgY3JlYXRlZEF0OiBEYXRlLm5vdygpLFxuICAgICAgICAgICAgICAgIHVwZGF0ZWRBdDogRGF0ZS5ub3coKSxcbiAgICAgICAgICAgICAgICBkZWxldGVkQXQ6IG51bGxcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgdXRpbHMuZGVlcEV4dGVuZCh0aGlzLCBwYXJhbXMpO1xuXG4gICAgICAgIC8vIGFkZCB0byBlbmRwb2ludCBtb2RlbHNcbiAgICAgICAgdGhpcy5fZW5kcG9pbnQubW9kZWxzLnB1c2godGhpcyk7XG5cbiAgICAgICAgLy8gc2F2ZSBpbnRvIHN0b3JhZ2VcbiAgICAgICAgdGhpcy5fZW5kcG9pbnQuY29tbWl0KCk7XG5cbiAgICAgICAgLy8gZW1pdCBldmVudHNcbiAgICAgICAgdGhpcy5lbWl0KCdwb3N0JywgdGhpcyk7XG4gICAgICAgIHRoaXMuX2VuZHBvaW50LmVtaXQoJ3Bvc3QnLCB0aGlzKTtcblxuICAgICAgICAvLyBoYW5kbGUgYWNsIGRlbnlcbiAgICAgICAgdGhpcy5fZW5kcG9pbnQuX3NvY2tldC5vbmNlKCdkZW5pZWQ6cG9zdDonICsgdGhpcy5pZCwgZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIC8vIGRlcmVnaXN0ZXIgY2FsbGJhY2tcbiAgICAgICAgICAgIHNlbGYuX2VuZHBvaW50Ll9zb2NrZXQub2ZmKCdyZWNlaXB0OnBvc3QnLCBjYWxsYmFjayk7XG4gICAgICAgICAgICB2YXIgaW5kZXggPSBzZWxmLl9lbmRwb2ludC5tb2RlbHMuaW5kZXhPZihzZWxmKTtcbiAgICAgICAgICAgIGlmKGluZGV4ID4gLTEpIHtcbiAgICAgICAgICAgICAgICBzZWxmLl9lbmRwb2ludC5tb2RlbHMuc3BsaWNlKGluZGV4LCAxKTtcbiAgICAgICAgICAgICAgICBzZWxmLl9lbmRwb2ludC5jb21taXQoKTtcbiAgICAgICAgICAgICAgICBzZWxmLl9lbmRwb2ludC5lbWl0KCdwb3N0Jywgc2VsZi5pZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIGVtaXQgc29ja2V0XG4gICAgICAgIHRoaXMuX2VuZHBvaW50Ll9zb2NrZXQuZW1pdCgncG9zdCcsIHRoaXMuZ2V0KCkpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9O1xuXG4gICAgTW9kZWwucHJvdG90eXBlLnB1dCA9IGZ1bmN0aW9uKHBhcmFtcywgY2FsbGJhY2spIHtcblxuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICAgICAgLy8gcmVnaXN0ZXIgY2FsbGJhY2tcbiAgICAgICAgaWYgKGNhbGxiYWNrKSB0aGlzLl9lbmRwb2ludC5fc29ja2V0Lm9uY2UoJ3JlY2VpcHQ6cHV0JywgY2FsbGJhY2spO1xuXG4gICAgICAgIC8vIHVwZGF0ZSBwcm9wZXJ0aWVzXG4gICAgICAgIHV0aWxzLmRlZXBFeHRlbmQodGhpcywgcGFyYW1zKTtcbiAgICAgICAgdGhpcy5tZXRhLnN5bmNlZCA9IGZhbHNlO1xuICAgICAgICB0aGlzLm1ldGEudXBkYXRlZEF0ID0gRGF0ZS5ub3coKTtcblxuICAgICAgICAvLyBzYXZlIGludG8gc3RvcmFnZVxuICAgICAgICB0aGlzLl9lbmRwb2ludC5jb21taXQoKTtcblxuICAgICAgICAvLyBlbWl0IGV2ZW50c1xuICAgICAgICB0aGlzLmVtaXQoJ3B1dCcsIHRoaXMsIHBhcmFtcyk7XG4gICAgICAgIHRoaXMuX2VuZHBvaW50LmVtaXQoJ3B1dCcsIHRoaXMsIHBhcmFtcyk7XG5cbiAgICAgICAgLy8gaGFuZGxlIGFjbCBkZW55XG4gICAgICAgIHRoaXMuX2VuZHBvaW50Ll9zb2NrZXQub25jZSgnZGVuaWVkOnB1dDonICsgdGhpcy5pZCwgZnVuY3Rpb24oZGF0YSl7XG4gICAgICAgICAgICAvLyBkZXJlZ2lzdGVyIGNhbGxiYWNrXG4gICAgICAgICAgICBzZWxmLl9lbmRwb2ludC5fc29ja2V0Lm9mZigncmVjZWlwdDpwdXQnLCBjYWxsYmFjayk7XG4gICAgICAgICAgICB1dGlscy5kZWVwRXh0ZW5kKHNlbGYsIGRhdGEpO1xuICAgICAgICAgICAgc2VsZi5fZW5kcG9pbnQuY29tbWl0KCk7XG4gICAgICAgICAgICBzZWxmLmVtaXQoJ3B1dCcpO1xuICAgICAgICAgICAgc2VsZi5fZW5kcG9pbnQuZW1pdCgncHV0Jyk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIGVtaXQgc29ja2V0XG4gICAgICAgIHRoaXMuX2VuZHBvaW50Ll9zb2NrZXQuZW1pdCgncHV0JywgdGhpcy5nZXQoKSk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH07XG5cbiAgICBNb2RlbC5wcm90b3R5cGUuZGVsZXRlID0gZnVuY3Rpb24oY2FsbGJhY2spIHtcblxuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICAgICAgLy8gcmVnaXN0ZXIgY2FsbGJhY2tcbiAgICAgICAgaWYgKGNhbGxiYWNrKSB0aGlzLl9lbmRwb2ludC5fc29ja2V0Lm9uY2UoJ3JlY2VpcHQ6ZGVsZXRlJywgY2FsbGJhY2spO1xuXG4gICAgICAgIC8vIGNsZWFyIHByb3BlcnRpZXNcbiAgICAgICAgZm9yKHZhciBrZXkgaW4gdGhpcykge1xuICAgICAgICAgICAgaWYgKHRoaXMuaGFzT3duUHJvcGVydHkoa2V5KSAmJiBbJ21ldGEnLCAnaWQnLCAnX2VuZHBvaW50JywgJ19ldmVudHMnXS5pbmRleE9mKGtleSkgPT0gLTEpIHtcbiAgICAgICAgICAgICAgICBkZWxldGUgdGhpc1trZXldO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHRoaXMubWV0YS5kZWxldGVkQXQgPSBEYXRlLm5vdygpO1xuICAgICAgICB0aGlzLm1ldGEuc3luY2VkID0gZmFsc2U7XG5cbiAgICAgICAgLy8gc2F2ZSBpbnRvIHN0b3JhZ2VcbiAgICAgICAgdGhpcy5fZW5kcG9pbnQuY29tbWl0KCk7XG5cbiAgICAgICAgLy8gZW1pdCBldmVudHNcbiAgICAgICAgdGhpcy5lbWl0KCdkZWxldGUnLCB0aGlzKTtcbiAgICAgICAgdGhpcy5fZW5kcG9pbnQuZW1pdCgnZGVsZXRlJywgdGhpcyk7XG5cbiAgICAgICAgLy8gaGFuZGxlIGFjbCBkZW55XG4gICAgICAgIHRoaXMuX2VuZHBvaW50Ll9zb2NrZXQub25jZSgnZGVuaWVkOmRlbGV0ZTonICsgdGhpcy5pZCwgZnVuY3Rpb24oZGF0YSl7XG4gICAgICAgICAgICAvLyBkZXJlZ2lzdGVyIGNhbGxiYWNrXG4gICAgICAgICAgICBzZWxmLl9lbmRwb2ludC5fc29ja2V0Lm9mZigncmVjZWlwdDpkZWxldGUnLCBjYWxsYmFjayk7XG4gICAgICAgICAgICB1dGlscy5kZWVwRXh0ZW5kKHNlbGYsIGRhdGEpO1xuICAgICAgICAgICAgc2VsZi5fZW5kcG9pbnQuY29tbWl0KCk7XG4gICAgICAgICAgICBzZWxmLmVtaXQoJ2RlbGV0ZScpO1xuICAgICAgICAgICAgc2VsZi5fZW5kcG9pbnQuZW1pdCgnZGVsZXRlJyk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIGVtaXQgc29ja2V0XG4gICAgICAgIHRoaXMuX2VuZHBvaW50Ll9zb2NrZXQuZW1pdCgnZGVsZXRlJywgdGhpcy5pZCk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH07XG5cbiAgICBNb2RlbC5wcm90b3R5cGUubWVyZ2UgPSBmdW5jdGlvbihfbW9kZWwpIHtcbiAgICAgICAgaWYgKEpTT04uc3RyaW5naWZ5KGdldFJlY29yZCh0aGlzKSkgIT0gSlNPTi5zdHJpbmdpZnkoX21vZGVsKSkge1xuICAgICAgICAgICAgLy8gdXBkYXRlIHByb3BlcnRpZXNcbiAgICAgICAgICAgIHV0aWxzLmRlZXBFeHRlbmQodGhpcywgX21vZGVsKTtcblxuICAgICAgICAgICAgLy8gc2F2ZSBpbnRvIHN0b3JhZ2VcbiAgICAgICAgICAgIHRoaXMuX2VuZHBvaW50LmNvbW1pdCgpO1xuXG4gICAgICAgICAgICAvLyBlbWl0IGV2ZW50c1xuICAgICAgICAgICAgdGhpcy5lbWl0KCdtZXJnZScsIHRoaXMpO1xuICAgICAgICAgICAgdGhpcy5fZW5kcG9pbnQuZW1pdCgnbWVyZ2UnLCB0aGlzKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9O1xuXG4gICAgbW9kdWxlLmV4cG9ydHMgPSBNb2RlbDtcblxufSkodGhpcyk7XG4iLCIoZnVuY3Rpb24oKSB7XG4gICAgXCJ1c2Ugc3RyaWN0XCI7XG5cbiAgICB2YXIgdXRpbHMgPSByZXF1aXJlKCcuLi91dGlscycpO1xuXG4gICAgZnVuY3Rpb24gUXVlcnkoZW5kcG9pbnQsIGZpbHRlcikge1xuICAgICAgICB0aGlzLm1vZGVscyA9IFtdO1xuICAgICAgICB0aGlzLl9maWx0ZXIgPSBmaWx0ZXI7XG4gICAgICAgIHRoaXMuX2VuZHBvaW50ID0gZW5kcG9pbnQ7XG4gICAgICAgIHRoaXMuX2V2ZW50cyA9IHt9O1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHRoaXMuX2VuZHBvaW50Lm9uKCdzdWJzY3JpYmVkJywgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBzZWxmLnJ1bigpO1xuICAgICAgICAgICAgc2VsZi5lbWl0KCdzdWJzY3JpYmVkJyk7XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLl9lbmRwb2ludC5vbigndW5zdWJzY3JpYmVkJywgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBzZWxmLnJ1bigpO1xuICAgICAgICAgICAgc2VsZi5lbWl0KCd1bnN1YnNjcmliZWQnKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuX2VuZHBvaW50Lm9uKCdzeW5jJywgZnVuY3Rpb24obW9kZWxzKSB7XG4gICAgICAgICAgICBzZWxmLnJ1bigpO1xuICAgICAgICAgICAgc2VsZi5lbWl0KCdzeW5jJywgbW9kZWxzKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuX2VuZHBvaW50Lm9uKCdwb3N0JywgZnVuY3Rpb24obW9kZWwpIHtcbiAgICAgICAgICAgIHNlbGYucnVuKCk7XG4gICAgICAgICAgICBzZWxmLmVtaXQoJ3Bvc3QnLCBtb2RlbCk7XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLl9lbmRwb2ludC5vbigncHV0JywgZnVuY3Rpb24obW9kZWwpIHtcbiAgICAgICAgICAgIHNlbGYucnVuKCk7XG4gICAgICAgICAgICBzZWxmLmVtaXQoJ3B1dCcsIG1vZGVsKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuX2VuZHBvaW50Lm9uKCdkZWxldGUnLCBmdW5jdGlvbihtb2RlbCkge1xuICAgICAgICAgICAgc2VsZi5ydW4oKTtcbiAgICAgICAgICAgIHNlbGYuZW1pdCgncHV0JywgbW9kZWwpO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5fZW5kcG9pbnQub24oJ2NsZWFyJywgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBzZWxmLnJ1bigpO1xuICAgICAgICAgICAgc2VsZi5lbWl0KCdjbGVhcicpO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5fZW5kcG9pbnQub24oJ21lcmdlJywgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBzZWxmLnJ1bigpO1xuICAgICAgICAgICAgc2VsZi5lbWl0KCdtZXJnZScpO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5ydW4uY2FsbChzZWxmKTtcbiAgICB9XG5cbiAgICBRdWVyeS5wcm90b3R5cGUgPSBPYmplY3QuY3JlYXRlKHV0aWxzLkVldi5wcm90b3R5cGUpO1xuXG4gICAgUXVlcnkucHJvdG90eXBlLnJ1biA9IGZ1bmN0aW9uKCkge1xuICAgICAgICB0aGlzLm1vZGVscyA9IHV0aWxzLnNpZnQodGhpcy5fZmlsdGVyLCB0aGlzLl9lbmRwb2ludC5tb2RlbHMpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9O1xuXG4gICAgUXVlcnkucHJvdG90eXBlLnB1dCA9IGZ1bmN0aW9uKHJlY29yZCkge1xuICAgICAgICB0aGlzLm1vZGVscy5mb3JFYWNoKGZ1bmN0aW9uKG1vZGVsKSB7XG4gICAgICAgICAgICBtb2RlbC5wdXQocmVjb3JkKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH07XG5cbiAgICBRdWVyeS5wcm90b3R5cGUuZGVsZXRlID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHRoaXMubW9kZWxzLmZvckVhY2goZnVuY3Rpb24obW9kZWwpIHtcbiAgICAgICAgICAgIG1vZGVsLmRlbGV0ZSgpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfTtcblxuICAgIG1vZHVsZS5leHBvcnRzID0gUXVlcnk7XG5cbn0pKHRoaXMpOyIsIihmdW5jdGlvbigpIHtcbiAgICBcInVzZSBzdHJpY3RcIjtcblxuICAgIHZhciB1dGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzJyk7XG4gICAgdmFyIHN0b3JhZ2UgPSByZXF1aXJlKCcuLi9zdG9yYWdlJyk7XG4gICAgdmFyIE1vZGVsID0gcmVxdWlyZSgnLi4vbW9kdWxlcy9Nb2RlbCcpO1xuICAgIHZhciBRdWVyeSA9IHJlcXVpcmUoJy4uL21vZHVsZXMvUXVlcnknKTtcbiAgICB2YXIgaW8gPSAodHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcpID8gd2luZG93LmlvIDogbnVsbDtcblxuICAgIGZ1bmN0aW9uIEVuZHBvaW50KENhc3RNeURhdGFTZXJ2ZXIsIHBhdGgsIG9wdGlvbnMpIHtcblxuICAgICAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcblxuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIGlmICgoL1teYS16QS1aMC05LV9cXC5dL2cpLnRlc3QocGF0aCkpIHtcbiAgICAgICAgICAgIHRocm93ICdJbnZhbGlkIGNoYXJhY3RlcnMgaW4gcGF0aC4gQWxsb3dlZCBjaGFyYWN0ZXJzIGFyZSBhLXosIEEtWiwgMC05LCAtLCBfLCAuJztcbiAgICAgICAgfVxuXG4gICAgICAgIGlmKCFpbykge1xuICAgICAgICAgICAgaW8gPSByZXF1aXJlKCdzb2NrZXQuaW8tY2xpZW50Jyk7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIHNvY2tldCA9IGlvKENhc3RNeURhdGFTZXJ2ZXIgKyAnP3BhdGg9JyArIHBhdGgsIHtcbiAgICAgICAgICAgIG11bHRpcGxleDogZmFsc2VcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdGhpcy5fb3B0aW9ucyA9IHtcbiAgICAgICAgICAgIHN0b3JhZ2U6ICdqamxjJ1xuICAgICAgICB9O1xuICAgICAgICB1dGlscy5kZWVwRXh0ZW5kKHRoaXMuX29wdGlvbnMsIG9wdGlvbnMpO1xuXG4gICAgICAgIHRoaXMuX3NvY2tldCA9IHNvY2tldDtcbiAgICAgICAgdGhpcy5fTW9kZWwgPSB0aGlzLl9vcHRpb25zLm1vZGVsIHx8IE1vZGVsO1xuICAgICAgICB0aGlzLm1vZGVscyA9IFtdO1xuICAgICAgICB0aGlzLl9ldmVudHMgPSB7fTtcbiAgICAgICAgdGhpcy5fZmlsdGVyID0ge307XG4gICAgICAgIHRoaXMuX3N1YnNjcmliZWQgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fc3RvcmFnZSA9IG5ldyBzdG9yYWdlKCdjbWRfJyArIHBhdGgsIHtcbiAgICAgICAgICAgIGRyaXZlcjogdGhpcy5fb3B0aW9ucy5zdG9yYWdlXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIGNyZWF0ZSB0aGUgc29ja2V0XG4gICAgICAgIHNvY2tldC5wYXRoID0gcGF0aDtcblxuICAgICAgICAvLyBBZGQgaGFuZGxlcnNcbiAgICAgICAgZnVuY3Rpb24gc3luY0hhbmRsZXIoZGF0YSwgY2FsbGJhY2spIHtcbiAgICAgICAgICAgIGlmICghc2VsZi5fc3Vic2NyaWJlZCkgcmV0dXJuO1xuICAgICAgICAgICAgZGF0YS5mb3JFYWNoKGZ1bmN0aW9uKF9tb2RlbCkge1xuICAgICAgICAgICAgICAgIHBvc3RIYW5kbGVyKF9tb2RlbCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHNlbGYuZW1pdCgnc3luYycsIHNlbGYubW9kZWxzKTtcbiAgICAgICAgICAgIGlmIChjYWxsYmFjaykgY2FsbGJhY2soKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIHBvc3RIYW5kbGVyKF9tb2RlbCwgY2FsbGJhY2spIHtcbiAgICAgICAgICAgIGlmICghc2VsZi5fc3Vic2NyaWJlZCkgcmV0dXJuO1xuICAgICAgICAgICAgdmFyIG1vZGVsID0gc2VsZi5maW5kKF9tb2RlbC5pZCk7XG4gICAgICAgICAgICBpZiAobW9kZWwpIHtcbiAgICAgICAgICAgICAgICBtb2RlbC5tZXJnZShfbW9kZWwpO1xuICAgICAgICAgICAgICAgIG1vZGVsLmVtaXQoJ21lcmdlJywgbW9kZWwpO1xuICAgICAgICAgICAgICAgIHNlbGYuZW1pdCgnbWVyZ2UnLCBtb2RlbCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIGNyZWF0ZSBtb2RlbFxuICAgICAgICAgICAgICAgIG1vZGVsID0gbmV3IHNlbGYuX01vZGVsKHNlbGYsIF9tb2RlbCk7XG5cbiAgICAgICAgICAgICAgICAvLyBhZGQgdG8gbW9kZWxzXG4gICAgICAgICAgICAgICAgc2VsZi5tb2RlbHMucHVzaChtb2RlbCk7XG5cbiAgICAgICAgICAgICAgICAvLyBzYXZlIGludG8gc3RvcmFnZVxuICAgICAgICAgICAgICAgIHNlbGYuY29tbWl0KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBlbWl0IGV2ZW50c1xuICAgICAgICAgICAgbW9kZWwuZW1pdCgncG9zdCcsIG1vZGVsKTtcbiAgICAgICAgICAgIHNlbGYuZW1pdCgncG9zdCcsIG1vZGVsKTtcbiAgICAgICAgICAgIGlmIChjYWxsYmFjaykgY2FsbGJhY2sobW9kZWwpO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gcHV0SGFuZGxlcihyZWNvcmQsIGNhbGxiYWNrKSB7XG4gICAgICAgICAgICBpZiAoIXNlbGYuX3N1YnNjcmliZWQpIHJldHVybjtcbiAgICAgICAgICAgIHZhciBtb2RlbCA9IHNlbGYuZmluZChyZWNvcmQuaWQpO1xuICAgICAgICAgICAgaWYgKG1vZGVsKSB7XG4gICAgICAgICAgICAgICAgLy8gdXBkYXRlIG1vZGVsIHByb3BlcnRpZXNcbiAgICAgICAgICAgICAgICB1dGlscy5kZWVwRXh0ZW5kKG1vZGVsLCByZWNvcmQpO1xuXG4gICAgICAgICAgICAgICAgLy8gc2F2ZSBpbnRvIHN0b3JhZ2VcbiAgICAgICAgICAgICAgICBzZWxmLmNvbW1pdCgpO1xuXG4gICAgICAgICAgICAgICAgLy8gZW1pdCBldmVudHNcbiAgICAgICAgICAgICAgICBtb2RlbC5lbWl0KCdtZXJnZScsIG1vZGVsKTtcbiAgICAgICAgICAgICAgICBzZWxmLmVtaXQoJ21lcmdlJywgbW9kZWwpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBtb2RlbCA9IG5ldyBzZWxmLl9Nb2RlbChzZWxmLCByZWNvcmQpO1xuICAgICAgICAgICAgICAgIHNlbGYubW9kZWxzLnB1c2gobW9kZWwpO1xuICAgICAgICAgICAgICAgIHNlbGYuY29tbWl0KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBtb2RlbC5lbWl0KCdwdXQnKTtcbiAgICAgICAgICAgIGlmIChjYWxsYmFjaykgY2FsbGJhY2sobW9kZWwpO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gZGVsZXRlSGFuZGxlcihyZWNvcmQsIGNhbGxiYWNrKSB7XG4gICAgICAgICAgICBpZiAoIXNlbGYuX3N1YnNjcmliZWQpIHJldHVybjtcbiAgICAgICAgICAgIHZhciBtb2RlbCA9IHNlbGYuZmluZChyZWNvcmQuaWQpO1xuICAgICAgICAgICAgaWYgKG1vZGVsKSB7XG4gICAgICAgICAgICAgICAgLy8gdXBkYXRlIHByb3BlcnRpZXNcblxuICAgICAgICAgICAgICAgIGZvciAodmFyIGtleSBpbiBtb2RlbCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAobW9kZWwuaGFzT3duUHJvcGVydHkoa2V5KSAmJiBbXG4gICAgICAgICAgICAgICAgICAgICAgICAnaWQnLFxuICAgICAgICAgICAgICAgICAgICAgICAgJ21ldGEnLFxuICAgICAgICAgICAgICAgICAgICAgICAgJyQkaGFzaEtleScsXG4gICAgICAgICAgICAgICAgICAgICAgICAnX2VuZHBvaW50JyxcbiAgICAgICAgICAgICAgICAgICAgICAgICdfZXZlbnRzJ1xuICAgICAgICAgICAgICAgICAgICBdLmluZGV4T2Yoa2V5KSA9PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVsZXRlIG1vZGVsW2tleV07XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBleHRlbmQgcmVzcG9uc2UgbWV0YVxuICAgICAgICAgICAgICAgIHV0aWxzLmRlZXBFeHRlbmQobW9kZWwubWV0YSwgcmVjb3JkLm1ldGEpO1xuXG4gICAgICAgICAgICAgICAgLy8gc2F2ZSBpbnRvIHN0b3JhZ2VcbiAgICAgICAgICAgICAgICBzZWxmLmNvbW1pdCgpO1xuXG4gICAgICAgICAgICAgICAgLy8gZW1pdCBldmVudHNcbiAgICAgICAgICAgICAgICBtb2RlbC5lbWl0KCdtZXJnZScsIG1vZGVsKTtcbiAgICAgICAgICAgICAgICBzZWxmLmVtaXQoJ21lcmdlJywgbW9kZWwpO1xuICAgICAgICAgICAgICAgIGlmIChjYWxsYmFjaykgY2FsbGJhY2sobW9kZWwpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gY2xlYXJIYW5kbGVyKGNhbGxiYWNrKSB7XG4gICAgICAgICAgICBjYWxsYmFjayA9IGNhbGxiYWNrIHx8IGZ1bmN0aW9uKCkge307XG4gICAgICAgICAgICBzZWxmLl9zdG9yYWdlLmNsZWFyKGZ1bmN0aW9uKGVycikge1xuICAgICAgICAgICAgICAgIGlmIChlcnIpIHJldHVybiB1dGlscy5oYW5kbGVFcnJvcihlcnIpO1xuICAgICAgICAgICAgICAgIHNlbGYubW9kZWxzLnNwbGljZSgwLCBzZWxmLm1vZGVscy5sZW5ndGgpO1xuICAgICAgICAgICAgICAgIHNlbGYuZW1pdCgnY2xlYXInKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gbGlzdGVuSGFuZGxlcihjaGFubmVsLCBjYWxsYmFjaykge1xuICAgICAgICAgICAgc2VsZi5lbWl0KCdsaXN0ZW4nLCBjaGFubmVsKTtcbiAgICAgICAgICAgIGlmIChjYWxsYmFjaykgY2FsbGJhY2soY2hhbm5lbCk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiB1bmxpc3RlbkhhbmRsZXIoY2hhbm5lbCwgY2FsbGJhY2spIHtcbiAgICAgICAgICAgIHNlbGYuZW1pdCgndW5saXN0ZW4nLCBjaGFubmVsKTtcbiAgICAgICAgICAgIGlmIChjYWxsYmFjaykgY2FsbGJhY2soY2hhbm5lbCk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBicm9hZGNhc3RIYW5kbGVyKGRhdGEsIGNhbGxiYWNrKSB7XG4gICAgICAgICAgICBzZWxmLmVtaXQoJ2Jyb2FkY2FzdCcsIGRhdGEpO1xuICAgICAgICAgICAgc2VsZi5lbWl0KCdicm9hZGNhc3Q6JyArIGRhdGEuY2hhbm5lbCwgZGF0YS5wYXlsb2FkKTtcbiAgICAgICAgICAgIGlmIChjYWxsYmFjaykgY2FsbGJhY2soZGF0YSk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiByZWNvbm5lY3RIYW5kbGVyKCkge1xuICAgICAgICAgICAgaWYgKHNlbGYuX3N1YnNjcmliZWQpIHtcbiAgICAgICAgICAgICAgICBzZWxmLnN1YnNjcmliZShzZWxmLl9vcHRpb25zKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIHNlcnZlckVycm9ySGFuZGxlcihlcnJvcikge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihlcnJvcik7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBoYW5kbGUgZXZlbnRzIGZyb20gb3RoZXIgY2xpZW50c1xuICAgICAgICBzb2NrZXQub24oJ3N5bmMnLCBzeW5jSGFuZGxlcik7XG4gICAgICAgIHNvY2tldC5vbigncG9zdCcsIHBvc3RIYW5kbGVyKTtcbiAgICAgICAgc29ja2V0Lm9uKCdwdXQnLCBwdXRIYW5kbGVyKTtcbiAgICAgICAgc29ja2V0Lm9uKCdkZWxldGUnLCBkZWxldGVIYW5kbGVyKTtcbiAgICAgICAgc29ja2V0Lm9uKCdjbGVhcicsIGNsZWFySGFuZGxlcik7XG4gICAgICAgIHNvY2tldC5vbignYnJvYWRjYXN0JywgYnJvYWRjYXN0SGFuZGxlcik7XG4gICAgICAgIHNvY2tldC5vbigncmVjb25uZWN0JywgcmVjb25uZWN0SGFuZGxlcik7XG4gICAgICAgIHNvY2tldC5vbignY21kZXJyb3InLCBzZXJ2ZXJFcnJvckhhbmRsZXIpO1xuXG4gICAgICAgIC8vIGhhbmRsZSByZWNlaXB0c1xuICAgICAgICBzb2NrZXQub24oJ3N5bmMnLCBmdW5jdGlvbihyZWNvcmRzKSB7XG4gICAgICAgICAgICBzeW5jSGFuZGxlcihyZWNvcmRzLCBmdW5jdGlvbihtb2RlbCkge1xuICAgICAgICAgICAgICAgIHNlbGYuZW1pdCgncmVjZWlwdDpzeW5jJyk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgICAgIHNvY2tldC5vbigncmVjZWlwdDpwb3N0JywgZnVuY3Rpb24ocmVjb3JkKSB7XG4gICAgICAgICAgICBwb3N0SGFuZGxlcihyZWNvcmQsIGZ1bmN0aW9uKG1vZGVsKSB7XG4gICAgICAgICAgICAgICAgbW9kZWwuZW1pdCgncmVjZWlwdDpwb3N0JywgbW9kZWwpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgICAgICBzb2NrZXQub24oJ3JlY2VpcHQ6cHV0JywgZnVuY3Rpb24oZGF0YSkge1xuICAgICAgICAgICAgcHV0SGFuZGxlcihkYXRhLCBmdW5jdGlvbihtb2RlbCkge1xuICAgICAgICAgICAgICAgIG1vZGVsLmVtaXQoJ3JlY2VpcHQ6cHV0JywgbW9kZWwpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgICAgICBzb2NrZXQub24oJ3JlY2VpcHQ6ZGVsZXRlJywgZnVuY3Rpb24ocmVjb3JkKSB7XG4gICAgICAgICAgICBkZWxldGVIYW5kbGVyKHJlY29yZCwgZnVuY3Rpb24obW9kZWwpIHtcbiAgICAgICAgICAgICAgICBtb2RlbC5lbWl0KCdyZWNlaXB0OmRlbGV0ZScsIG1vZGVsKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICAgICAgc29ja2V0Lm9uKCdyZWNlaXB0OmNsZWFyJywgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBjbGVhckhhbmRsZXIoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5lbWl0KCdyZWNlaXB0OmNsZWFyJyk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgICAgIHNvY2tldC5vbigncmVjZWlwdDpsaXN0ZW4nLCBmdW5jdGlvbihjaGFubmVsKSB7XG4gICAgICAgICAgICBsaXN0ZW5IYW5kbGVyKGNoYW5uZWwsIGZ1bmN0aW9uKGNoYW5uZWwpIHtcbiAgICAgICAgICAgICAgICBzZWxmLmVtaXQoJ3JlY2VpcHQ6bGlzdGVuOicgKyBjaGFubmVsLCBjaGFubmVsKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICAgICAgc29ja2V0Lm9uKCdyZWNlaXB0OnVubGlzdGVuJywgZnVuY3Rpb24oY2hhbm5lbCkge1xuICAgICAgICAgICAgdW5saXN0ZW5IYW5kbGVyKGNoYW5uZWwsIGZ1bmN0aW9uKGNoYW5uZWwpIHtcbiAgICAgICAgICAgICAgICBzZWxmLmVtaXQoJ3JlY2VpcHQ6dW5saXN0ZW46JyArIGNoYW5uZWwsIGNoYW5uZWwpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgICAgICBzb2NrZXQub24oJ3JlY2VpcHQ6YnJvYWRjYXN0JywgZnVuY3Rpb24oZGF0YSkge1xuICAgICAgICAgICAgYnJvYWRjYXN0SGFuZGxlcihkYXRhLCBmdW5jdGlvbihkYXRhKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5lbWl0KCdyZWNlaXB0OmJyb2FkY2FzdCcsIGRhdGEpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIEVuZHBvaW50LnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUodXRpbHMuRWV2LnByb3RvdHlwZSk7XG5cbiAgICBFbmRwb2ludC5wcm90b3R5cGUubG9hZCA9IGZ1bmN0aW9uKGNhbGxiYWNrKSB7XG4gICAgICAgIGNhbGxiYWNrID0gY2FsbGJhY2sgfHwgZnVuY3Rpb24oKSB7fTtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB0aGlzLl9zdG9yYWdlLmdldChmdW5jdGlvbihlcnIsIGRhdGFzKSB7XG4gICAgICAgICAgICB2YXIgbW9kZWxzID0gZGF0YXMubWFwKGZ1bmN0aW9uKF9tb2RlbCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgc2VsZi5fTW9kZWwoc2VsZiwgX21vZGVsKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgaWYgKHNlbGYuX2ZpbHRlcikge1xuICAgICAgICAgICAgICAgIG1vZGVscyA9IHV0aWxzLnNpZnQoc2VsZi5fZmlsdGVyLCBtb2RlbHMpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc2VsZi5tb2RlbHMuc3BsaWNlKDAsIHNlbGYubW9kZWxzLmxlbmd0aCk7XG4gICAgICAgICAgICBzZWxmLmVtaXQoJ2xvYWQnLCBzZWxmLm1vZGVscyk7XG4gICAgICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgRW5kcG9pbnQucHJvdG90eXBlLmNvbW1pdCA9IGZ1bmN0aW9uKGNhbGxiYWNrKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgY2FsbGJhY2sgPSBjYWxsYmFjayB8fCBmdW5jdGlvbigpe307XG4gICAgICAgIHZhciBtb2RlbHMgPSB0aGlzLm1vZGVscy5tYXAoZnVuY3Rpb24obW9kZWwpIHtcbiAgICAgICAgICAgIHJldHVybiBtb2RlbC5nZXQoKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuX3N0b3JhZ2Uuc2V0KG1vZGVscywgZnVuY3Rpb24oZXJyKXtcbiAgICAgICAgICAgIGlmKGVycikgcmV0dXJuIHV0aWxzLmhhbmRsZUVycm9yKGVycik7XG4gICAgICAgICAgICBzZWxmLmVtaXQoJ2NvbW1pdCcpO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgRW5kcG9pbnQucHJvdG90eXBlLnN1YnNjcmliZSA9IGZ1bmN0aW9uKG9wdGlvbnMsIGNhbGxiYWNrKSB7XG4gICAgICAgIGlmICh0eXBlb2Ygb3B0aW9ucyA9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICBjYWxsYmFjayA9IG9wdGlvbnM7XG4gICAgICAgICAgICBvcHRpb25zID0ge307XG4gICAgICAgIH1cbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgICAgIGZ1bmN0aW9uIHN1YigpIHtcbiAgICAgICAgICAgIHNlbGYuX29wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICAgICAgICAgICAgc2VsZi5fZmlsdGVyID0gc2VsZi5fb3B0aW9ucy5maWx0ZXI7XG4gICAgICAgICAgICBzZWxmLl9zb2NrZXQuZW1pdCgnc3Vic2NyaWJlJywgc2VsZi5fb3B0aW9ucyk7XG4gICAgICAgICAgICBzZWxmLmVtaXQoJ3N1YnNjcmliZWQnKTtcbiAgICAgICAgICAgIHNlbGYuX3N1YnNjcmliZWQgPSB0cnVlO1xuICAgICAgICAgICAgc2VsZi5zeW5jKGNhbGxiYWNrKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5fc3Vic2NyaWJlZCkge1xuICAgICAgICAgICAgdGhpcy51bnN1YnNjcmliZShzdWIpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc3ViKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfTtcblxuICAgIEVuZHBvaW50LnByb3RvdHlwZS51bnN1YnNjcmliZSA9IGZ1bmN0aW9uKGNhbGxiYWNrKSB7XG4gICAgICAgIGlmIChjYWxsYmFjaykgdGhpcy5fc29ja2V0Lm9uY2UoJ3Vuc3Vic2NyaWJlJywgY2FsbGJhY2spO1xuICAgICAgICB0aGlzLm1vZGVscy5zcGxpY2UoMCwgdGhpcy5tb2RlbHMubGVuZ3RoKTtcbiAgICAgICAgdGhpcy5fc29ja2V0LmVtaXQoJ3Vuc3Vic2NyaWJlJyk7XG4gICAgICAgIHRoaXMuZW1pdCgndW5zdWJzY3JpYmVkJyk7XG4gICAgICAgIHRoaXMuX3N1YnNjcmliZWQgPSBmYWxzZTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfTtcblxuICAgIEVuZHBvaW50LnByb3RvdHlwZS5zeW5jID0gZnVuY3Rpb24oY2FsbGJhY2spIHtcbiAgICAgICAgdGhpcy5sb2FkKCk7XG4gICAgICAgIHZhciB1bnN5bmNlZCA9IHRoaXMubW9kZWxzLmZpbHRlcihmdW5jdGlvbihtb2RlbCkge1xuICAgICAgICAgICAgcmV0dXJuICFtb2RlbC5tZXRhLnN5bmNlZDtcbiAgICAgICAgfSkubWFwKGZ1bmN0aW9uKG1vZGVsKSB7XG4gICAgICAgICAgICByZXR1cm4gbW9kZWwuZ2V0KCk7XG4gICAgICAgIH0pO1xuICAgICAgICBpZiAoY2FsbGJhY2spIHRoaXMub25jZSgncmVjZWlwdDpzeW5jJywgY2FsbGJhY2spO1xuICAgICAgICB0aGlzLl9zb2NrZXQuZW1pdCgnc3luYycsIHVuc3luY2VkKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfTtcblxuICAgIEVuZHBvaW50LnByb3RvdHlwZS5wb3N0ID1cbiAgICBFbmRwb2ludC5wcm90b3R5cGUuY3JlYXRlID1cbiAgICAgICAgZnVuY3Rpb24ocmVjb3JkLCBjYWxsYmFjaykge1xuICAgICAgICAgICAgdmFyIG1vZGVsID0gbmV3IHRoaXMuX01vZGVsKHRoaXMsIHJlY29yZCk7XG4gICAgICAgICAgICBpZiAoY2FsbGJhY2spIG1vZGVsLm9uY2UoJ3JlY2VpcHQ6cG9zdCcsIGNhbGxiYWNrKTtcbiAgICAgICAgICAgIG1vZGVsLnBvc3QoKTtcbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgIH07XG5cbiAgICBFbmRwb2ludC5wcm90b3R5cGUucHV0ID0gZnVuY3Rpb24oaWQsIHJlY29yZCwgY2FsbGJhY2spIHtcbiAgICAgICAgdmFyIG1vZGVsID0gdGhpcy5maW5kKGlkKTtcbiAgICAgICAgaWYgKG1vZGVsKSB7XG4gICAgICAgICAgICBpZiAoY2FsbGJhY2spIG1vZGVsLm9uY2UoJ3JlY2VpcHQ6cHV0JywgY2FsbGJhY2spO1xuICAgICAgICAgICAgbW9kZWwucHV0KHJlY29yZCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfTtcblxuICAgIEVuZHBvaW50LnByb3RvdHlwZS5kZWxldGUgPSBmdW5jdGlvbihpZCwgY2FsbGJhY2spIHtcbiAgICAgICAgdmFyIG1vZGVsID0gdGhpcy5maW5kKGlkKTtcbiAgICAgICAgaWYgKG1vZGVsKSB7XG4gICAgICAgICAgICBpZiAoY2FsbGJhY2spIG1vZGVsLm9uY2UoJ3JlY2VpcHQ6ZGVsZXRlJywgY2FsbGJhY2spO1xuICAgICAgICAgICAgbW9kZWwuZGVsZXRlKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfTtcblxuICAgIEVuZHBvaW50LnByb3RvdHlwZS5jbGVhciA9IGZ1bmN0aW9uKGNhbGxiYWNrKSB7XG4gICAgICAgIGlmIChjYWxsYmFjaykgdGhpcy5fc29ja2V0Lm9uY2UoJ3JlY2VpcHQ6Y2xlYXInLCBjYWxsYmFjayk7XG4gICAgICAgIHRoaXMuX3NvY2tldC5lbWl0KCdjbGVhcicpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9O1xuXG4gICAgRW5kcG9pbnQucHJvdG90eXBlLmxpc3RlbiA9IGZ1bmN0aW9uKGNoYW5uZWwsIGNhbGxiYWNrKSB7XG4gICAgICAgIGlmIChjYWxsYmFjaykgdGhpcy5vbmNlKCdyZWNlaXB0Omxpc3RlbjonICsgY2hhbm5lbCwgY2FsbGJhY2spO1xuICAgICAgICB0aGlzLl9zb2NrZXQuZW1pdCgnbGlzdGVuJywgY2hhbm5lbCk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH07XG5cbiAgICBFbmRwb2ludC5wcm90b3R5cGUudW5saXN0ZW4gPSBmdW5jdGlvbihjaGFubmVsLCBjYWxsYmFjaykge1xuICAgICAgICBpZiAoY2FsbGJhY2spIHRoaXMub25jZSgncmVjZWlwdDp1bmxpc3RlbjonICsgY2hhbm5lbCwgY2FsbGJhY2spO1xuICAgICAgICB0aGlzLl9zb2NrZXQuZW1pdCgndW5saXN0ZW4nLCBjaGFubmVsKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfTtcblxuICAgIEVuZHBvaW50LnByb3RvdHlwZS5icm9hZGNhc3QgPSBmdW5jdGlvbihjaGFubmVsLCBwYXlsb2FkLCBjYWxsYmFjaykge1xuICAgICAgICBpZiAoY2FsbGJhY2spIHRoaXMub25jZSgncmVjZWlwdDpicm9hZGNhc3QnLCBjYWxsYmFjayk7XG4gICAgICAgIHRoaXMuX3NvY2tldC5lbWl0KCdicm9hZGNhc3QnLCB7XG4gICAgICAgICAgICBjaGFubmVsOiBjaGFubmVsLFxuICAgICAgICAgICAgcGF5bG9hZDogcGF5bG9hZFxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfTtcblxuICAgIEVuZHBvaW50LnByb3RvdHlwZS5jbG9zZSA9IGZ1bmN0aW9uKGNhbGxiYWNrKSB7XG4gICAgICAgIGlmIChjYWxsYmFjaykgdGhpcy5fc29ja2V0Lm9uY2UoJ2Nsb3NlJywgY2FsbGJhY2spO1xuICAgICAgICB0aGlzLl9zb2NrZXQuY2xvc2UoJ2Nsb3NlJyk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH07XG5cbiAgICBFbmRwb2ludC5wcm90b3R5cGUuZmluZCA9IGZ1bmN0aW9uKGlkKSB7XG4gICAgICAgIHJldHVybiB0aGlzLm1vZGVscy5maWx0ZXIoZnVuY3Rpb24obW9kZWwpIHtcbiAgICAgICAgICAgIHJldHVybiBtb2RlbC5pZCA9PSBpZDtcbiAgICAgICAgfSkucG9wKCk7XG4gICAgfTtcblxuICAgIEVuZHBvaW50LnByb3RvdHlwZS53aGVyZSA9IGZ1bmN0aW9uKGZpbHRlcikge1xuICAgICAgICByZXR1cm4gbmV3IFF1ZXJ5KHRoaXMsIGZpbHRlcik7XG4gICAgfTtcblxuICAgIG1vZHVsZS5leHBvcnRzID0gRW5kcG9pbnQ7XG5cbn0pKHRoaXMpOyIsIihmdW5jdGlvbigpIHtcblxuICAgIHZhciBsb2NhbFdyYXBwZXJGYWN0b3J5ID0gcmVxdWlyZSgnLi9sb2NhbFdyYXBwZXJGYWN0b3J5Jyk7XG4gICAgLy8gdmFyIGluZGV4ZWRkYiA9IHJlcXVpcmUoJy4vaW5kZXhlZGRiJyk7XG4gICAgdmFyIG1lbW9yeSA9IHJlcXVpcmUoJy4vbWVtb3J5Jyk7XG4gICAgdmFyIGpqbGMgPSByZXF1aXJlKCcuL2pqbGMnKTtcbiAgICB2YXIgbG9jYWxTdG9yYWdlID0gKHR5cGVvZiBsb2NhbFN0b3JhZ2UgIT09ICd1bmRlZmluZWQnKSA/IGxvY2FsU3RvcmFnZSA6IG51bGw7XG4gICAgaWYoIWxvY2FsU3RvcmFnZSkge1xuICAgICAgICB2YXIgTG9jYWxTdG9yYWdlID0gcmVxdWlyZSgnbm9kZS1sb2NhbHN0b3JhZ2UnKS5Mb2NhbFN0b3JhZ2U7XG4gICAgICAgIGxvY2FsU3RvcmFnZSA9IG5ldyBMb2NhbFN0b3JhZ2UoJy4vc2NyYXRjaCcpO1xuICAgIH1cbiAgICB2YXIgZHJpdmVycyA9IHtcbiAgICAgICAgampsYzogbG9jYWxXcmFwcGVyRmFjdG9yeShqamxjKSxcbiAgICAgICAgbWVtb3J5OiBsb2NhbFdyYXBwZXJGYWN0b3J5KG1lbW9yeSksXG4gICAgICAgIGxvY2FsU3RvcmFnZTogbG9jYWxXcmFwcGVyRmFjdG9yeShsb2NhbFN0b3JhZ2UpLFxuICAgIH07XG5cbiAgICBmdW5jdGlvbiBTdG9yYWdlKHBhdGgsIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB0aGlzLm9wdGlvbnMgPSBvcHRpb25zO1xuICAgICAgICB0aGlzLmJvb3RlZCA9IGZhbHNlO1xuICAgICAgICB0aGlzLmRyaXZlciA9IG5ldyBkcml2ZXJzW29wdGlvbnMuZHJpdmVyXShwYXRoLCBvcHRpb25zKTtcbiAgICAgICAgdGhpcy5kcml2ZXIuYm9vdChmdW5jdGlvbihlcnIpIHtcbiAgICAgICAgICAgIGlmKGVycikgdGhyb3cgZXJyO1xuICAgICAgICAgICAgc2VsZi5ib290ZWQgPSB0cnVlO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBTdG9yYWdlLnByb3RvdHlwZS5nZXQgPSBmdW5jdGlvbihjYWxsYmFjaykge1xuICAgICAgICBjYWxsYmFjayA9IGNhbGxiYWNrIHx8IGZ1bmN0aW9uKCkge307XG4gICAgICAgIHRoaXMuZHJpdmVyLmdldChjYWxsYmFjayk7XG4gICAgfTtcblxuICAgIFN0b3JhZ2UucHJvdG90eXBlLnNldCA9IGZ1bmN0aW9uKGRhdGFzLCBjYWxsYmFjaykge1xuICAgICAgICBjYWxsYmFjayA9IGNhbGxiYWNrIHx8IGZ1bmN0aW9uKCkge307XG4gICAgICAgIHRoaXMuZHJpdmVyLnNldChkYXRhcywgY2FsbGJhY2spO1xuICAgIH07XG5cbiAgICBTdG9yYWdlLnByb3RvdHlwZS53aGVyZSA9IGZ1bmN0aW9uKHF1ZXJ5LCBjYWxsYmFjaykge1xuICAgICAgICBjYWxsYmFjayA9IGNhbGxiYWNrIHx8IGZ1bmN0aW9uKCkge307XG4gICAgICAgIHRoaXMuZHJpdmVyLndoZXJlKHF1ZXJ5LCBjYWxsYmFjayk7XG4gICAgfTtcblxuICAgIFN0b3JhZ2UucHJvdG90eXBlLmNsZWFyID0gZnVuY3Rpb24oY2FsbGJhY2spIHtcbiAgICAgICAgY2FsbGJhY2sgPSBjYWxsYmFjayB8fCBmdW5jdGlvbigpIHt9O1xuICAgICAgICB0aGlzLmRyaXZlci5jbGVhcihjYWxsYmFjayk7XG4gICAgfTtcblxuICAgIG1vZHVsZS5leHBvcnRzID0gU3RvcmFnZTtcblxufSkodGhpcyk7IiwiKGZ1bmN0aW9uKCkge1xuXG4gICAgdmFyIGxvY2FsU3RvcmFnZSA9ICh0eXBlb2YgbG9jYWxTdG9yYWdlICE9PSAndW5kZWZpbmVkJykgPyBsb2NhbFN0b3JhZ2UgOiBudWxsO1xuICAgIGlmKCFsb2NhbFN0b3JhZ2UpIHtcbiAgICAgICAgdmFyIExvY2FsU3RvcmFnZSA9IHJlcXVpcmUoJ25vZGUtbG9jYWxzdG9yYWdlJykuTG9jYWxTdG9yYWdlO1xuICAgICAgICBsb2NhbFN0b3JhZ2UgPSBuZXcgTG9jYWxTdG9yYWdlKCcuL3NjcmF0Y2gnKTtcbiAgICB9XG5cbiAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vay15YWsvSkpMQy9ibG9iL21hc3Rlci9zY3JpcHRzL2pqbGMuZGV2LmpzXG4gICAgdmFyIHJlZ2V4ID0gL1xcXCJbYS16QS1aMC05XSpcXFwiOi9nLFxuICAgICAgICBzZXBhcmF0b3IgPSAnwqMnLFxuICAgICAgICBkaWN0cyA9IHt9O1xuXG4gICAgZnVuY3Rpb24gX3NvcnRlZEJ5VmFsdWUob2JqKSB7XG4gICAgICAgIHZhciB0dXBsZXMgPSBbXSxcbiAgICAgICAgICAgIG5ld09iaiA9IHt9LFxuICAgICAgICAgICAga2V5O1xuICAgICAgICBmb3IgKGtleSBpbiBvYmopIHtcbiAgICAgICAgICAgIHR1cGxlcy5wdXNoKFtrZXksIG9ialtrZXldXSk7XG4gICAgICAgIH1cbiAgICAgICAgdHVwbGVzLnNvcnQoZnVuY3Rpb24oYSwgYikge1xuICAgICAgICAgICAgcmV0dXJuIGJbMV0gLSBhWzFdO1xuICAgICAgICB9KTtcbiAgICAgICAgZm9yIChrZXkgaW4gdHVwbGVzKSB7XG4gICAgICAgICAgICBuZXdPYmpbdHVwbGVzW2tleV1bMF1dID0gdHVwbGVzW2tleV1bMV07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ld09iajtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBfaW5jQ2hhcihzKSB7XG4gICAgICAgIHZhciBjID0gc1tzLmxlbmd0aCAtIDFdLFxuICAgICAgICAgICAgcCA9IHMuc3Vic3RyaW5nKDAsIHMubGVuZ3RoIC0gMSksXG4gICAgICAgICAgICBuZXh0SWQ7XG4gICAgICAgIGlmICh0eXBlb2YgYyA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgIG5leHRJZCA9ICdhJztcbiAgICAgICAgfSBlbHNlIGlmIChjID09PSAneicpIHtcbiAgICAgICAgICAgIG5leHRJZCA9ICdBJztcbiAgICAgICAgfSBlbHNlIGlmIChjID09PSAnWicpIHtcbiAgICAgICAgICAgIG5leHRJZCA9ICdhJztcbiAgICAgICAgICAgIGlmIChwICE9PSAnJykge1xuICAgICAgICAgICAgICAgIHAgPSBfaW5jQ2hhcihwKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcCA9ICdhJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIG5leHRJZCA9IFN0cmluZy5mcm9tQ2hhckNvZGUoYy5jaGFyQ29kZUF0KDApICsgMSk7XG4gICAgICAgIH1cbiAgICAgICAgYyA9IG5leHRJZDtcbiAgICAgICAgcmV0dXJuIHAgKyBjO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIF9jcmVhdGVEaWN0KHMpIHtcbiAgICAgICAgdmFyIGRpY3QgPSB7fSxcbiAgICAgICAgICAgIGN1cklkID0gJycsXG4gICAgICAgICAgICBtID0gcy5tYXRjaChyZWdleCksXG4gICAgICAgICAgICBrZXksXG4gICAgICAgICAgICBzYnY7XG4gICAgICAgIGZvciAoa2V5IGluIG0pIHtcbiAgICAgICAgICAgIGlmIChtW2tleV0ubGVuZ3RoID4gKGN1cklkLmxlbmd0aCArIDIpKSB7XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBkaWN0W21ba2V5XV0gIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICAgICAgICAgIGRpY3RbbVtrZXldXSArPSAxO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGRpY3RbbVtrZXldXSA9IDA7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHNidiA9IF9zb3J0ZWRCeVZhbHVlKGRpY3QpO1xuICAgICAgICBmb3IgKGtleSBpbiBzYnYpIHtcbiAgICAgICAgICAgIGN1cklkID0gX2luY0NoYXIoY3VySWQpO1xuICAgICAgICAgICAgc2J2W2tleV0gPSBzZXBhcmF0b3IgKyBjdXJJZCArIHNlcGFyYXRvcjtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gc2J2O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIF9jb21wcmVzcyh2LCBkaWN0KSB7XG4gICAgICAgIHZhciBpZCxcbiAgICAgICAgICAgIHJlO1xuICAgICAgICBmb3IgKGlkIGluIGRpY3QpIHtcbiAgICAgICAgICAgIHJlID0gbmV3IFJlZ0V4cChpZCwgJ2cnKTtcbiAgICAgICAgICAgIHYgPSB2LnJlcGxhY2UocmUsIGRpY3RbaWRdKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdjtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBfZGVjb21wcmVzcyh2LCBkaWN0KSB7XG4gICAgICAgIHZhciBpZCxcbiAgICAgICAgICAgIHJlO1xuICAgICAgICBmb3IgKGlkIGluIGRpY3QpIHtcbiAgICAgICAgICAgIHJlID0gbmV3IFJlZ0V4cChkaWN0W2lkXSwgJ2cnKTtcbiAgICAgICAgICAgIHYgPSB2LnJlcGxhY2UocmUsIGlkKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdjtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBKSkxDKCkge1xuICAgICAgICB0aGlzLnNldEl0ZW0gPSBmdW5jdGlvbihrZXksIHN0ciwgbnMpIHtcbiAgICAgICAgICAgIHZhciBjb21wcmVzc2VkLFxuICAgICAgICAgICAgICAgIHNPYmplY3QsXG4gICAgICAgICAgICAgICAgZGljdDtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgbnMgPT09ICd1bmRlZmluZWQnIHx8IG5zICE9PSAnbm8tYmVhdXRpZnknKSB7XG4gICAgICAgICAgICAgICAgc09iamVjdCA9IEpTT04ucGFyc2Uoc3RyKTtcbiAgICAgICAgICAgICAgICBzdHIgPSBKU09OLnN0cmluZ2lmeShzT2JqZWN0KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGRpY3QgPSBfY3JlYXRlRGljdChzdHIpO1xuICAgICAgICAgICAgY29tcHJlc3NlZCA9IF9jb21wcmVzcyhzdHIsIGRpY3QpO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBucyAhPT0gJ3VuZGVmaW5lZCcgJiYgbnMgPT09ICdsb2NhbC1kaWN0Jykge1xuICAgICAgICAgICAgICAgIGRpY3RzW2tleV0gPSBkaWN0O1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbShrZXksIGNvbXByZXNzZWQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHR5cGVvZiBkaWN0c1trZXldID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKCdkXycgKyBrZXksIEpTT04uc3RyaW5naWZ5KGRpY3QpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBjb21wcmVzc2VkO1xuICAgICAgICB9O1xuICAgICAgICB0aGlzLmdldEl0ZW0gPSBmdW5jdGlvbihrZXkpIHtcbiAgICAgICAgICAgIHZhciBkaWN0O1xuICAgICAgICAgICAgdmFyIGNvbXByZXNzZWQgPSBsb2NhbFN0b3JhZ2UuZ2V0SXRlbShrZXkpO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBkaWN0c1trZXldID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgICAgIGRpY3QgPSBKU09OLnBhcnNlKGxvY2FsU3RvcmFnZS5nZXRJdGVtKCdkXycgKyBrZXkpKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZGljdCA9IGRpY3RzW2tleV07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gX2RlY29tcHJlc3MoY29tcHJlc3NlZCwgZGljdCk7XG4gICAgICAgIH07XG4gICAgICAgIHRoaXMuZ2V0RGljdCA9IGZ1bmN0aW9uKGtleSkge1xuICAgICAgICAgICAgdmFyIGRpY3Q7XG4gICAgICAgICAgICBpZiAodHlwZW9mIGRpY3RzW2tleV0gPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICAgICAgZGljdCA9IEpTT04ucGFyc2UobG9jYWxTdG9yYWdlLmdldEl0ZW0oJ2RfJyArIGtleSkpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBkaWN0ID0gZGljdHNba2V5XTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBkaWN0O1xuICAgICAgICB9O1xuICAgICAgICB0aGlzLnNldERpY3QgPSBmdW5jdGlvbihrZXksIGRpYywgbnMpIHtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgbnMgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ2RfJyArIGtleSwgZGljKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZGljdHNba2V5XSA9IGRpYztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBtb2R1bGUuZXhwb3J0cyA9IG5ldyBKSkxDKCk7XG5cbn0pKHRoaXMpOyIsIihmdW5jdGlvbigpe1xuICAgIFwidXNlIHN0cmljdFwiO1xuXG4gICAgZnVuY3Rpb24gbG9jYWxXcmFwcGVyRmFjdG9yeShzdG9yYWdlKSB7XG5cbiAgICAgICAgZnVuY3Rpb24gTG9jYWxXcmFwcGVyKHBhdGgsIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIHRoaXMuc3RvcmFnZSA9IHN0b3JhZ2U7XG4gICAgICAgICAgICB0aGlzLmJvb3RlZCA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5wYXRoID0gcGF0aDtcbiAgICAgICAgICAgIHRoaXMub3B0aW9ucyA9IG9wdGlvbnM7XG4gICAgICAgIH1cblxuICAgICAgICBMb2NhbFdyYXBwZXIucHJvdG90eXBlLmJvb3QgPSBmdW5jdGlvbihjYWxsYmFjaykge1xuICAgICAgICAgICAgdGhpcy5ib290ZWQgPSB0cnVlO1xuICAgICAgICAgICAgaWYoY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICBjYWxsYmFjayhudWxsKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBMb2NhbFdyYXBwZXIucHJvdG90eXBlLmdldCA9IGZ1bmN0aW9uKGNhbGxiYWNrKSB7XG4gICAgICAgICAgICBjYWxsYmFjayA9IGNhbGxiYWNrIHx8IGZ1bmN0aW9uKCkge307XG4gICAgICAgICAgICB2YXIgZGF0YXMgPSB0aGlzLnN0b3JhZ2UuZ2V0SXRlbSh0aGlzLnBhdGgpO1xuICAgICAgICAgICAgaWYgKCFkYXRhcykge1xuICAgICAgICAgICAgICAgIGRhdGFzID0gJ1tdJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGRhdGFzID0gSlNPTi5wYXJzZShkYXRhcyk7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsLCBkYXRhcyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgTG9jYWxXcmFwcGVyLnByb3RvdHlwZS5zZXQgPSBmdW5jdGlvbihkYXRhcywgY2FsbGJhY2spIHtcbiAgICAgICAgICAgIGNhbGxiYWNrID0gY2FsbGJhY2sgfHwgZnVuY3Rpb24oKSB7fTtcbiAgICAgICAgICAgIGRhdGFzID0gSlNPTi5zdHJpbmdpZnkoZGF0YXMpO1xuICAgICAgICAgICAgdGhpcy5zdG9yYWdlLnNldEl0ZW0odGhpcy5wYXRoLCBkYXRhcyk7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsKTtcbiAgICAgICAgfTtcblxuICAgICAgICBMb2NhbFdyYXBwZXIucHJvdG90eXBlLndoZXJlID0gZnVuY3Rpb24ocXVlcnksIGNhbGxiYWNrKSB7XG4gICAgICAgICAgICBjYWxsYmFjayA9IGNhbGxiYWNrIHx8IGZ1bmN0aW9uKCkge307XG4gICAgICAgICAgICB0aGlzLmdldChmdW5jdGlvbihlcnIsIGRhdGFzKSB7XG4gICAgICAgICAgICAgICAgaWYgKGVycikgcmV0dXJuIGNhbGxiYWNrKGVycik7XG4gICAgICAgICAgICAgICAgZGF0YXMgPSB1dGlscy5zaWZ0KHF1ZXJ5LCBkYXRhcyk7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwgZGF0YXMpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgTG9jYWxXcmFwcGVyLnByb3RvdHlwZS5jbGVhciA9IGZ1bmN0aW9uKGNhbGxiYWNrKSB7XG4gICAgICAgICAgICBjYWxsYmFjayA9IGNhbGxiYWNrIHx8IGZ1bmN0aW9uKCkge307XG4gICAgICAgICAgICB0aGlzLnNldChbXSwgZnVuY3Rpb24oZXJyKSB7XG4gICAgICAgICAgICAgICAgaWYgKGVycikgcmV0dXJuIGNhbGxiYWNrKGVycik7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2sobnVsbCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfTtcblxuICAgICAgICByZXR1cm4gTG9jYWxXcmFwcGVyO1xuICAgIH1cblxuICAgIG1vZHVsZS5leHBvcnRzID0gbG9jYWxXcmFwcGVyRmFjdG9yeTtcblxufSkodGhpcyk7IiwiKGZ1bmN0aW9uKCl7XG4gICAgdmFyIHN0b3JhZ2UgPSB7fTtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IHtcbiAgICAgICAgZ2V0SXRlbTogZnVuY3Rpb24ocGF0aCkge1xuICAgICAgICAgICAgaWYoIXN0b3JhZ2VbcGF0aF0pIHtcbiAgICAgICAgICAgICAgICAvLyBsb2NhbFN0b3JhZ2Ugc2F2ZXMgZGF0YSBpbiBzdHJpbmdcbiAgICAgICAgICAgICAgICBzdG9yYWdlW3BhdGhdID0gJyc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gc3RvcmFnZVtwYXRoXTtcbiAgICAgICAgfSxcbiAgICAgICAgc2V0SXRlbTogZnVuY3Rpb24ocGF0aCwgdmFsdWUpIHtcbiAgICAgICAgICAgIHN0b3JhZ2VbcGF0aF0gPSB2YWx1ZTtcbiAgICAgICAgfVxuICAgIH07XG59KSh0aGlzKTsiLCIoZnVuY3Rpb24oKSB7XG4gICAgXCJ1c2Ugc3RyaWN0XCI7XG5cbiAgICAvLyBodHRwOi8vYW5kcmV3ZHVwb250Lm5ldC8yMDA5LzA4LzI4L2RlZXAtZXh0ZW5kaW5nLW9iamVjdHMtaW4tamF2YXNjcmlwdC9cbiAgICBmdW5jdGlvbiBkZWVwRXh0ZW5kKGRlc3RpbmF0aW9uLCBzb3VyY2UpIHtcbiAgICAgICAgZm9yICh2YXIgcHJvcGVydHkgaW4gc291cmNlKSB7XG4gICAgICAgICAgICBpZiAoc291cmNlW3Byb3BlcnR5XSAmJiBzb3VyY2VbcHJvcGVydHldLmNvbnN0cnVjdG9yICYmXG4gICAgICAgICAgICAgICAgc291cmNlW3Byb3BlcnR5XS5jb25zdHJ1Y3RvciA9PT0gT2JqZWN0KSB7XG4gICAgICAgICAgICAgICAgZGVzdGluYXRpb25bcHJvcGVydHldID0gZGVzdGluYXRpb25bcHJvcGVydHldIHx8IHt9O1xuICAgICAgICAgICAgICAgIGRlZXBFeHRlbmQoZGVzdGluYXRpb25bcHJvcGVydHldLCBzb3VyY2VbcHJvcGVydHldKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZGVzdGluYXRpb25bcHJvcGVydHldID0gc291cmNlW3Byb3BlcnR5XTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZGVzdGluYXRpb247XG4gICAgfVxuXG4gICAgbW9kdWxlLmV4cG9ydHMgPSBkZWVwRXh0ZW5kO1xufSkodGhpcyk7IiwiKGZ1bmN0aW9uKCl7XG4gICAgXCJ1c2Ugc3RyaWN0XCI7XG5cbiAgICBmdW5jdGlvbiBFZXYgKCkge1xuICAgICAgICB0aGlzLl9ldmVudHMgPSB7fTtcbiAgICB9XG5cbiAgICBFZXYucHJvdG90eXBlID0ge1xuICAgICAgICBvbjogZnVuY3Rpb24obmFtZXMsIGZuKSB7XG4gICAgICAgICAgICB2YXIgbWUgPSB0aGlzO1xuICAgICAgICAgICAgbmFtZXMuc3BsaXQoL1xccysvZykuZm9yRWFjaChmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmKCFtZS5fZXZlbnRzW25hbWVdKSBtZS5fZXZlbnRzW25hbWVdID0gW107XG4gICAgICAgICAgICAgICAgbWUuX2V2ZW50c1tuYW1lXS5wdXNoKGZuKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIH0sXG5cbiAgICAgICAgb2ZmOiBmdW5jdGlvbihuYW1lcywgZm4pIHtcbiAgICAgICAgICAgIHZhciBtZSA9IHRoaXM7XG4gICAgICAgICAgICBuYW1lcy5zcGxpdCgvXFxzKy9nKS5mb3JFYWNoKGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgICAgICAgICB2YXIgbGlzdCA9IG1lLl9ldmVudHNbbmFtZV07XG4gICAgICAgICAgICAgICAgaWYobGlzdCkge1xuICAgICAgICAgICAgICAgICAgICBtZS5fZXZlbnRzW25hbWVdID0gbWUuX2V2ZW50c1tuYW1lXS5maWx0ZXIoZnVuY3Rpb24oZm4pe1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZuICE9PSBmbjtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgfSxcblxuICAgICAgICBvbmNlOiBmdW5jdGlvbihuYW1lcywgZm4pIHtcbiAgICAgICAgICAgIHZhciBtZSA9IHRoaXM7XG4gICAgICAgICAgICBuYW1lcy5zcGxpdCgvXFxzKy9nKS5mb3JFYWNoKGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYoIW1lLl9ldmVudHNbbmFtZV0pIG1lLl9ldmVudHNbbmFtZV0gPSBbXTtcbiAgICAgICAgICAgICAgICBmbi5fY2FsbE9uY2UgPSB0cnVlO1xuICAgICAgICAgICAgICAgIG1lLl9ldmVudHNbbmFtZV0ucHVzaChmbik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICB9LFxuXG4gICAgICAgIGVtaXQ6IGZ1bmN0aW9uKG5hbWUsIGRhdGEsIGNvbnRleHQpIHtcbiAgICAgICAgICAgIHZhciBtZSA9IHRoaXM7XG4gICAgICAgICAgICBjb250ZXh0ID0gY29udGV4dCB8fCB0aGlzO1xuICAgICAgICAgICAgdmFyIGV2dCA9IHRoaXMuX2V2ZW50c1tuYW1lXSB8fCAodGhpcy5fZXZlbnRzW25hbWVdID0gW10pO1xuICAgICAgICAgICAgZXZ0LmZvckVhY2goZnVuY3Rpb24oZm4pe1xuICAgICAgICAgICAgICAgIGlmKGZuLl9jYWxsT25jZSkge1xuICAgICAgICAgICAgICAgICAgICBkZWxldGUgZm4uX2NhbGxPbmNlO1xuICAgICAgICAgICAgICAgICAgICBmbi5jYWxsKGNvbnRleHQsIGRhdGEpO1xuICAgICAgICAgICAgICAgICAgICBtZS5vZmYobmFtZSwgZm4pO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gbWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGZuLmNhbGwoY29udGV4dCwgZGF0YSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIG1vZHVsZS5leHBvcnRzID0gRWV2O1xufSkodGhpcyk7IiwiKGZ1bmN0aW9uKCkge1xuICAgIFwidXNlIHN0cmljdFwiO1xuXG4gICAgdmFyIHV0aWxzID0ge307XG5cbiAgICB1dGlscy5zaWZ0ID0gcmVxdWlyZSgnLi9zaWZ0Jyk7XG5cbiAgICB1dGlscy51dWlkID0gcmVxdWlyZSgnLi91dWlkJyk7XG5cbiAgICB1dGlscy5FZXYgPSByZXF1aXJlKCcuL2VldicpO1xuXG4gICAgdXRpbHMuZGVlcEV4dGVuZCA9IHJlcXVpcmUoJy4vZGVlcEV4dGVuZCcpO1xuXG4gICAgbW9kdWxlLmV4cG9ydHMgPSB1dGlscztcblxufSkodGhpcyk7IiwiKGZ1bmN0aW9uKCkge1xuICAgIFwidXNlIHN0cmljdFwiO1xuXG4gICAgLy8gaHR0cHM6Ly9naXRodWIuY29tL2NyY24vc2lmdC5qcy90cmVlL21hc3RlclxuXG4gICAgZnVuY3Rpb24gaXNGdW5jdGlvbih2YWx1ZSkge1xuICAgICAgICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnZnVuY3Rpb24nO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGlzQXJyYXkodmFsdWUpIHtcbiAgICAgICAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh2YWx1ZSkgPT09ICdbb2JqZWN0IEFycmF5XSc7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY29tcGFyYWJsZSh2YWx1ZSkge1xuICAgICAgICBpZiAodmFsdWUgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgICAgICAgICByZXR1cm4gdmFsdWUuZ2V0VGltZSgpO1xuICAgICAgICB9IGVsc2UgaWYgKHZhbHVlIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZS5tYXAoY29tcGFyYWJsZSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXQob2JqLCBrZXkpIHtcbiAgICAgICAgaWYgKG9iai5nZXQpIHJldHVybiBvYmouZ2V0KGtleSk7XG4gICAgICAgIHJldHVybiBvYmpba2V5XTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBvcih2YWxpZGF0b3IpIHtcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKGEsIGIpIHtcbiAgICAgICAgICAgIGlmICghaXNBcnJheShiKSB8fCAhYi5sZW5ndGgpIHJldHVybiB2YWxpZGF0b3IoYSwgYik7XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMCwgbiA9IGIubGVuZ3RoOyBpIDwgbjsgaSsrKVxuICAgICAgICAgICAgICAgIGlmICh2YWxpZGF0b3IoYSwgZ2V0KGIsIGkpKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gYW5kKHZhbGlkYXRvcikge1xuICAgICAgICByZXR1cm4gZnVuY3Rpb24oYSwgYikge1xuICAgICAgICAgICAgaWYgKCFpc0FycmF5KGIpIHx8ICFiLmxlbmd0aCkgcmV0dXJuIHZhbGlkYXRvcihhLCBiKTtcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwLCBuID0gYi5sZW5ndGg7IGkgPCBuOyBpKyspXG4gICAgICAgICAgICAgICAgaWYgKCF2YWxpZGF0b3IoYSwgZ2V0KGIsIGkpKSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gdmFsaWRhdGUodmFsaWRhdG9yLCBiKSB7XG4gICAgICAgIHJldHVybiB2YWxpZGF0b3Iudih2YWxpZGF0b3IuYSwgYik7XG4gICAgfVxuXG5cbiAgICB2YXIgb3BlcmF0b3IgPSB7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqL1xuXG4gICAgICAgICRlcTogb3IoZnVuY3Rpb24oYSwgYikge1xuICAgICAgICAgICAgcmV0dXJuIGEoYik7XG4gICAgICAgIH0pLFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKi9cblxuICAgICAgICAkbmU6IGFuZChmdW5jdGlvbihhLCBiKSB7XG4gICAgICAgICAgICByZXR1cm4gIWEoYik7XG4gICAgICAgIH0pLFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKi9cblxuICAgICAgICAkb3I6IGZ1bmN0aW9uKGEsIGIpIHtcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwLCBuID0gYS5sZW5ndGg7IGkgPCBuOyBpKyspXG4gICAgICAgICAgICAgICAgaWYgKHZhbGlkYXRlKGdldChhLCBpKSwgYikpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKi9cblxuICAgICAgICAkZ3Q6IG9yKGZ1bmN0aW9uKGEsIGIpIHtcbiAgICAgICAgICAgIHJldHVybiBzaWZ0LmNvbXBhcmUoY29tcGFyYWJsZShiKSwgYSkgPiAwO1xuICAgICAgICB9KSxcblxuICAgICAgICAvKipcbiAgICAgICAgICovXG5cbiAgICAgICAgJGd0ZTogb3IoZnVuY3Rpb24oYSwgYikge1xuICAgICAgICAgICAgcmV0dXJuIHNpZnQuY29tcGFyZShjb21wYXJhYmxlKGIpLCBhKSA+PSAwO1xuICAgICAgICB9KSxcblxuICAgICAgICAvKipcbiAgICAgICAgICovXG5cbiAgICAgICAgJGx0OiBvcihmdW5jdGlvbihhLCBiKSB7XG4gICAgICAgICAgICByZXR1cm4gc2lmdC5jb21wYXJlKGNvbXBhcmFibGUoYiksIGEpIDwgMDtcbiAgICAgICAgfSksXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqL1xuXG4gICAgICAgICRsdGU6IG9yKGZ1bmN0aW9uKGEsIGIpIHtcbiAgICAgICAgICAgIHJldHVybiBzaWZ0LmNvbXBhcmUoY29tcGFyYWJsZShiKSwgYSkgPD0gMDtcbiAgICAgICAgfSksXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqL1xuXG4gICAgICAgICRtb2Q6IG9yKGZ1bmN0aW9uKGEsIGIpIHtcbiAgICAgICAgICAgIHJldHVybiBiICUgYVswXSA9PSBhWzFdO1xuICAgICAgICB9KSxcblxuICAgICAgICAvKipcbiAgICAgICAgICovXG5cbiAgICAgICAgJGluOiBmdW5jdGlvbihhLCBiKSB7XG5cbiAgICAgICAgICAgIGlmIChiIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBpID0gYi5sZW5ndGg7IGktLTspIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKH5hLmluZGV4T2YoY29tcGFyYWJsZShnZXQoYiwgaSkpKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gISF+YS5pbmRleE9mKGNvbXBhcmFibGUoYikpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqL1xuXG4gICAgICAgICRuaW46IGZ1bmN0aW9uKGEsIGIpIHtcbiAgICAgICAgICAgIHJldHVybiAhb3BlcmF0b3IuJGluKGEsIGIpO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKi9cblxuICAgICAgICAkbm90OiBmdW5jdGlvbihhLCBiKSB7XG4gICAgICAgICAgICByZXR1cm4gIXZhbGlkYXRlKGEsIGIpO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKi9cblxuICAgICAgICAkdHlwZTogZnVuY3Rpb24oYSwgYikge1xuICAgICAgICAgICAgcmV0dXJuIGIgIT0gdm9pZCAwID8gYiBpbnN0YW5jZW9mIGEgfHwgYi5jb25zdHJ1Y3RvciA9PSBhIDogZmFsc2U7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqL1xuXG4gICAgICAgICRhbGw6IGZ1bmN0aW9uKGEsIGIpIHtcbiAgICAgICAgICAgIGlmICghYikgYiA9IFtdO1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IGEubGVuZ3RoOyBpLS07KSB7XG4gICAgICAgICAgICAgICAgaWYgKCF+Y29tcGFyYWJsZShiKS5pbmRleE9mKGdldChhLCBpKSkpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKi9cblxuICAgICAgICAkc2l6ZTogZnVuY3Rpb24oYSwgYikge1xuICAgICAgICAgICAgcmV0dXJuIGIgPyBhID09PSBiLmxlbmd0aCA6IGZhbHNlO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKi9cblxuICAgICAgICAkbm9yOiBmdW5jdGlvbihhLCBiKSB7XG4gICAgICAgICAgICAvLyB0b2RvIC0gdGhpcyBzdWZmaWNlPyByZXR1cm4gIW9wZXJhdG9yLiRpbihhKVxuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDAsIG4gPSBhLmxlbmd0aDsgaSA8IG47IGkrKylcbiAgICAgICAgICAgICAgICBpZiAodmFsaWRhdGUoZ2V0KGEsIGkpLCBiKSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqL1xuXG4gICAgICAgICRhbmQ6IGZ1bmN0aW9uKGEsIGIpIHtcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwLCBuID0gYS5sZW5ndGg7IGkgPCBuOyBpKyspXG4gICAgICAgICAgICAgICAgaWYgKCF2YWxpZGF0ZShnZXQoYSwgaSksIGIpKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICovXG5cbiAgICAgICAgJHJlZ2V4OiBvcihmdW5jdGlvbihhLCBiKSB7XG4gICAgICAgICAgICByZXR1cm4gdHlwZW9mIGIgPT09ICdzdHJpbmcnICYmIGEudGVzdChiKTtcbiAgICAgICAgfSksXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqL1xuXG4gICAgICAgICR3aGVyZTogZnVuY3Rpb24oYSwgYikge1xuICAgICAgICAgICAgcmV0dXJuIGEuY2FsbChiLCBiKTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICovXG5cbiAgICAgICAgJGVsZW1NYXRjaDogZnVuY3Rpb24oYSwgYikge1xuICAgICAgICAgICAgaWYgKGlzQXJyYXkoYikpIHJldHVybiAhIX5zZWFyY2goYiwgYSk7XG4gICAgICAgICAgICByZXR1cm4gdmFsaWRhdGUoYSwgYik7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqL1xuXG4gICAgICAgICRleGlzdHM6IGZ1bmN0aW9uKGEsIGIpIHtcbiAgICAgICAgICAgIHJldHVybiAoYiAhPSB2b2lkIDApID09PSBhO1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIHZhciBwcmVwYXJlID0ge1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKi9cblxuICAgICAgICAkZXE6IGZ1bmN0aW9uKGEpIHtcblxuICAgICAgICAgICAgaWYgKGEgaW5zdGFuY2VvZiBSZWdFeHApIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZnVuY3Rpb24oYikge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHlwZW9mIGIgPT09ICdzdHJpbmcnICYmIGEudGVzdChiKTtcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfSBlbHNlIGlmIChhIGluc3RhbmNlb2YgRnVuY3Rpb24pIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gYTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoaXNBcnJheShhKSAmJiAhYS5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAvLyBTcGVjaWFsIGNhc2Ugb2YgYSA9PSBbXVxuICAgICAgICAgICAgICAgIHJldHVybiBmdW5jdGlvbihiKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAoaXNBcnJheShiKSAmJiAhYi5sZW5ndGgpO1xuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGEgPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZnVuY3Rpb24oYikge1xuICAgICAgICAgICAgICAgICAgICAvL3dpbGwgbWF0Y2ggYm90aCBudWxsIGFuZCB1bmRlZmluZWRcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIChiID09PSBudWxsIHx8IGIgPT09IHVuZGVmaW5lZCk7XG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKGIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2lmdC5jb21wYXJlKGNvbXBhcmFibGUoYiksIGEpID09PSAwO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICovXG5cbiAgICAgICAgJG5lOiBmdW5jdGlvbihhKSB7XG4gICAgICAgICAgICByZXR1cm4gcHJlcGFyZS4kZXEoYSk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqL1xuXG4gICAgICAgICRhbmQ6IGZ1bmN0aW9uKGEpIHtcbiAgICAgICAgICAgIHJldHVybiBhLm1hcChwYXJzZSk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqL1xuXG4gICAgICAgICRvcjogZnVuY3Rpb24oYSkge1xuICAgICAgICAgICAgcmV0dXJuIGEubWFwKHBhcnNlKTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICovXG5cbiAgICAgICAgJG5vcjogZnVuY3Rpb24oYSkge1xuICAgICAgICAgICAgcmV0dXJuIGEubWFwKHBhcnNlKTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICovXG5cbiAgICAgICAgJG5vdDogZnVuY3Rpb24oYSkge1xuICAgICAgICAgICAgcmV0dXJuIHBhcnNlKGEpO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKi9cblxuICAgICAgICAkcmVnZXg6IGZ1bmN0aW9uKGEsIHF1ZXJ5KSB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IFJlZ0V4cChhLCBxdWVyeS4kb3B0aW9ucyk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqL1xuXG4gICAgICAgICR3aGVyZTogZnVuY3Rpb24oYSkge1xuICAgICAgICAgICAgcmV0dXJuIGE7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqL1xuXG4gICAgICAgICRlbGVtTWF0Y2g6IGZ1bmN0aW9uKGEpIHtcbiAgICAgICAgICAgIHJldHVybiBwYXJzZShhKTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICovXG5cbiAgICAgICAgJGV4aXN0czogZnVuY3Rpb24oYSkge1xuICAgICAgICAgICAgcmV0dXJuICEhYTtcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICBmdW5jdGlvbiBzZWFyY2goYXJyYXksIHZhbGlkYXRvcikge1xuXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYXJyYXkubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGlmICh2YWxpZGF0ZSh2YWxpZGF0b3IsIGdldChhcnJheSwgaSkpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gLTE7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY3JlYXRlVmFsaWRhdG9yKGEsIHZhbGlkYXRlKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBhOiBhLFxuICAgICAgICAgICAgdjogdmFsaWRhdGVcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBuZXN0ZWRWYWxpZGF0b3IoYSwgYikge1xuICAgICAgICB2YXIgdmFsdWVzID0gW107XG4gICAgICAgIGZpbmRWYWx1ZXMoYiwgYS5rLCAwLCB2YWx1ZXMpO1xuXG4gICAgICAgIGlmICh2YWx1ZXMubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgICByZXR1cm4gdmFsaWRhdGUoYS5udiwgdmFsdWVzWzBdKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiAhIX5zZWFyY2godmFsdWVzLCBhLm52KTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBmaW5kVmFsdWVzKGN1cnJlbnQsIGtleXBhdGgsIGluZGV4LCB2YWx1ZXMpIHtcblxuICAgICAgICBpZiAoaW5kZXggPT09IGtleXBhdGgubGVuZ3RoIHx8IGN1cnJlbnQgPT0gdm9pZCAwKSB7XG4gICAgICAgICAgICB2YWx1ZXMucHVzaChjdXJyZW50KTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBrID0gZ2V0KGtleXBhdGgsIGluZGV4KTtcblxuICAgICAgICAvLyBlbnN1cmUgdGhhdCBpZiBjdXJyZW50IGlzIGFuIGFycmF5LCB0aGF0IHRoZSBjdXJyZW50IGtleVxuICAgICAgICAvLyBpcyBOT1QgYW4gYXJyYXkgaW5kZXguIFRoaXMgc29ydCBvZiB0aGluZyBuZWVkcyB0byB3b3JrOlxuICAgICAgICAvLyBzaWZ0KHsnZm9vLjAnOjQyfSwgW3tmb286IFs0Ml19XSk7XG4gICAgICAgIGlmIChpc0FycmF5KGN1cnJlbnQpICYmIGlzTmFOKE51bWJlcihrKSkpIHtcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwLCBuID0gY3VycmVudC5sZW5ndGg7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgICAgICAgICBmaW5kVmFsdWVzKGdldChjdXJyZW50LCBpKSwga2V5cGF0aCwgaW5kZXgsIHZhbHVlcyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBmaW5kVmFsdWVzKGdldChjdXJyZW50LCBrKSwga2V5cGF0aCwgaW5kZXggKyAxLCB2YWx1ZXMpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY3JlYXRlTmVzdGVkVmFsaWRhdG9yKGtleXBhdGgsIGEpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGE6IHtcbiAgICAgICAgICAgICAgICBrOiBrZXlwYXRoLFxuICAgICAgICAgICAgICAgIG52OiBhXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgdjogbmVzdGVkVmFsaWRhdG9yXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogZmxhdHRlbiB0aGUgcXVlcnlcbiAgICAgKi9cblxuICAgIGZ1bmN0aW9uIHBhcnNlKHF1ZXJ5KSB7XG4gICAgICAgIHF1ZXJ5ID0gY29tcGFyYWJsZShxdWVyeSk7XG5cbiAgICAgICAgaWYgKCFxdWVyeSB8fCAocXVlcnkuY29uc3RydWN0b3IudG9TdHJpbmcoKSAhPT0gJ09iamVjdCcgJiZcbiAgICAgICAgICAgIHF1ZXJ5LmNvbnN0cnVjdG9yLnRvU3RyaW5nKCkucmVwbGFjZSgvXFxuL2csICcnKS5yZXBsYWNlKC8gL2csICcnKSAhPT0gJ2Z1bmN0aW9uT2JqZWN0KCl7W25hdGl2ZWNvZGVdfScpKSB7IC8vIGNyb3NzIGJyb3dzZXIgc3VwcG9ydFxuICAgICAgICAgICAgcXVlcnkgPSB7XG4gICAgICAgICAgICAgICAgJGVxOiBxdWVyeVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciB2YWxpZGF0b3JzID0gW107XG5cbiAgICAgICAgZm9yICh2YXIga2V5IGluIHF1ZXJ5KSB7XG4gICAgICAgICAgICB2YXIgYSA9IHF1ZXJ5W2tleV07XG5cbiAgICAgICAgICAgIGlmIChrZXkgPT09ICckb3B0aW9ucycpIGNvbnRpbnVlO1xuXG4gICAgICAgICAgICBpZiAob3BlcmF0b3Jba2V5XSkge1xuICAgICAgICAgICAgICAgIGlmIChwcmVwYXJlW2tleV0pIGEgPSBwcmVwYXJlW2tleV0oYSwgcXVlcnkpO1xuICAgICAgICAgICAgICAgIHZhbGlkYXRvcnMucHVzaChjcmVhdGVWYWxpZGF0b3IoY29tcGFyYWJsZShhKSwgb3BlcmF0b3Jba2V5XSkpO1xuICAgICAgICAgICAgfSBlbHNlIHtcblxuICAgICAgICAgICAgICAgIGlmIChrZXkuY2hhckNvZGVBdCgwKSA9PT0gMzYpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmtub3duIG9wZXJhdGlvbiAnICsga2V5KTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB2YWxpZGF0b3JzLnB1c2goY3JlYXRlTmVzdGVkVmFsaWRhdG9yKGtleS5zcGxpdCgnLicpLCBwYXJzZShhKSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHZhbGlkYXRvcnMubGVuZ3RoID09PSAxID8gdmFsaWRhdG9yc1swXSA6IGNyZWF0ZVZhbGlkYXRvcih2YWxpZGF0b3JzLCBvcGVyYXRvci4kYW5kKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjcmVhdGVSb290VmFsaWRhdG9yKHF1ZXJ5LCBnZXR0ZXIpIHtcbiAgICAgICAgdmFyIHZhbGlkYXRvciA9IHBhcnNlKHF1ZXJ5KTtcbiAgICAgICAgaWYgKGdldHRlcikge1xuICAgICAgICAgICAgdmFsaWRhdG9yID0ge1xuICAgICAgICAgICAgICAgIGE6IHZhbGlkYXRvcixcbiAgICAgICAgICAgICAgICB2OiBmdW5jdGlvbihhLCBiKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB2YWxpZGF0ZShhLCBnZXR0ZXIoYikpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHZhbGlkYXRvcjtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzaWZ0KHF1ZXJ5LCBhcnJheSwgZ2V0dGVyKSB7XG5cbiAgICAgICAgaWYgKGlzRnVuY3Rpb24oYXJyYXkpKSB7XG4gICAgICAgICAgICBnZXR0ZXIgPSBhcnJheTtcbiAgICAgICAgICAgIGFycmF5ID0gdm9pZCAwO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHZhbGlkYXRvciA9IGNyZWF0ZVJvb3RWYWxpZGF0b3IocXVlcnksIGdldHRlcik7XG5cbiAgICAgICAgZnVuY3Rpb24gZmlsdGVyKGIpIHtcbiAgICAgICAgICAgIHJldHVybiB2YWxpZGF0ZSh2YWxpZGF0b3IsIGIpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGFycmF5KSB7XG4gICAgICAgICAgICByZXR1cm4gYXJyYXkuZmlsdGVyKGZpbHRlcik7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZmlsdGVyO1xuICAgIH1cblxuICAgIHNpZnQudXNlID0gZnVuY3Rpb24ocGx1Z2luKSB7XG4gICAgICAgIGlmIChpc0Z1bmN0aW9uKHBsdWdpbikpIHJldHVybiBwbHVnaW4oc2lmdCk7XG4gICAgICAgIGZvciAodmFyIGtleSBpbiBwbHVnaW4pIHtcbiAgICAgICAgICAgIGlmIChrZXkuY2hhckNvZGVBdCgwKSA9PT0gMzYpIG9wZXJhdG9yW2tleV0gPSBwbHVnaW5ba2V5XTtcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICBzaWZ0LmluZGV4T2YgPSBmdW5jdGlvbihxdWVyeSwgYXJyYXksIGdldHRlcikge1xuICAgICAgICByZXR1cm4gc2VhcmNoKGFycmF5LCBjcmVhdGVSb290VmFsaWRhdG9yKHF1ZXJ5LCBnZXR0ZXIpKTtcbiAgICB9O1xuXG4gICAgc2lmdC5jb21wYXJlID0gZnVuY3Rpb24oYSwgYikge1xuICAgICAgICBpZiAoYSA9PT0gYikgcmV0dXJuIDA7XG4gICAgICAgIGlmICh0eXBlb2YgYSA9PT0gdHlwZW9mIGIpIHtcbiAgICAgICAgICAgIGlmIChhID4gYikgcmV0dXJuIDE7XG4gICAgICAgICAgICBpZiAoYSA8IGIpIHJldHVybiAtMTtcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICBtb2R1bGUuZXhwb3J0cyA9IHNpZnQ7XG5cbn0pKHRoaXMpOyIsIihmdW5jdGlvbigpe1xuICAgIFwidXNlIHN0cmljdFwiO1xuXG4gICAgLy8gaHR0cHM6Ly9naXRodWIuY29tL21ha2VhYmxlL3V1aWQtdjQuanNcbiAgICB2YXIgZGVjMmhleCA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDw9IDE1OyBpKyspIHtcbiAgICAgICAgZGVjMmhleFtpXSA9IGkudG9TdHJpbmcoMTYpO1xuICAgIH1cbiAgICBmdW5jdGlvbiB1dWlkKCkge1xuICAgICAgICB2YXIgdXVpZCA9ICcnO1xuICAgICAgICBmb3IgKHZhciBpID0gMTsgaSA8PSAzNjsgaSsrKSB7XG4gICAgICAgICAgICBpZiAoaSA9PT0gOSB8fCBpID09PSAxNCB8fCBpID09PSAxOSB8fCBpID09PSAyNCkge1xuICAgICAgICAgICAgICAgIHV1aWQgKz0gJy0nO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChpID09PSAxNSkge1xuICAgICAgICAgICAgICAgIHV1aWQgKz0gNDtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoaSA9PT0gMjApIHtcbiAgICAgICAgICAgICAgICB1dWlkICs9IGRlYzJoZXhbKE1hdGgucmFuZG9tKCkgKiA0IHwgMCArIDgpXTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdXVpZCArPSBkZWMyaGV4WyhNYXRoLnJhbmRvbSgpICogMTUgfCAwKV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHV1aWQ7XG4gICAgfVxuXG4gICAgbW9kdWxlLmV4cG9ydHMgPSB1dWlkO1xuXG59KSh0aGlzKTsiLCIoZnVuY3Rpb24oKSB7XG4gICAgJ3VzZSBzdHJpY3QnO1xuXG4gICAgdmFyIHN0b3JhZ2UgPSByZXF1aXJlKCcuL3N0b3JhZ2UnKTtcbiAgICB2YXIgdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzJyk7XG5cbiAgICAvKipcbiAgICAgKiBNb2RlbCBTdGFydFxuICAgICAqL1xuXG4gICAgdmFyIE1vZGVsID0gcmVxdWlyZSgnLi9tb2R1bGVzL21vZGVsJyk7XG5cbiAgICAvKipcbiAgICAgKiBRdWVyeSBzdGFydFxuICAgICAqL1xuXG4gICAgdmFyIFF1ZXJ5ID0gcmVxdWlyZSgnLi9tb2R1bGVzL3F1ZXJ5Jyk7XG5cbiAgICAvKipcbiAgICAgKiBFbmRwb2ludCBzdGFydFxuICAgICAqL1xuXG4gICAgdmFyIEVuZHBvaW50ID0gcmVxdWlyZSgnLi9tb2R1bGVzL2VuZHBvaW50Jyk7XG5cbiAgICAvLyBFeHBvcnRzXG5cbiAgICB2YXIgQ2FzdE15RGF0YSA9IHtcbiAgICAgICAgTW9kZWw6IE1vZGVsLFxuICAgICAgICBRdWVyeTogUXVlcnksXG4gICAgICAgIEVuZHBvaW50OiBFbmRwb2ludCxcbiAgICAgICAgVXRpbHM6IHV0aWxzLFxuICAgIH07XG5cbiAgICBtb2R1bGUuZXhwb3J0cyA9IENhc3RNeURhdGE7XG5cbn0pKHRoaXMpOyJdfQ==
