// jshint quotmark:single, bitwise:false, forin:false
// globals io:true define:true

(function(global, factory) {
    'use strict';
  
    if (typeof exports === 'object' && typeof module !== 'undefined') {
        factory(exports);
    } else if (typeof define === 'function' && define.amd) {
        define(['exports'], factory);
    } else {
        factory((global.CastMyData = global.CastMyData || {}));
    }
}(this, function(exports) {
        'use strict';

    var utils = {};
    var localStorage;

    if (typeof exports === 'object' && typeof module !== 'undefined') {
        var LocalStorage = require('node-localstorage').LocalStorage;
        localStorage = new LocalStorage('./scratch');
    } else {
        localStorage = window.localStorage;
    }

    // https://github.com/crcn/sift.js/tree/master
    (function(utils) {


        /**
         */

        function isFunction(value) {
            return typeof value === 'function';
        }

        /**
         */

        function isArray(value) {
            return Object.prototype.toString.call(value) === '[object Array]';
        }

        /**
         */

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

        /**
         */

        function or(validator) {
            return function(a, b) {
                if (!isArray(b) || !b.length) return validator(a, b);
                for (var i = 0, n = b.length; i < n; i++)
                    if (validator(a, get(b, i))) return true;
                return false;
            };
        }

        /**
         */

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

        /**
         */

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

        /**
         */

        function search(array, validator) {

            for (var i = 0; i < array.length; i++) {
                if (validate(validator, get(array, i))) {
                    return i;
                }
            }

            return -1;
        }

        /**
         */

        function createValidator(a, validate) {
            return {
                a: a,
                v: validate
            };
        }

        /**
         */

        function nestedValidator(a, b) {
            var values = [];
            findValues(b, a.k, 0, values);

            if (values.length === 1) {
                return validate(a.nv, values[0]);
            }

            return !!~search(values, a.nv);
        }

        /**
         */

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

        /**
         */

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

        /**
         */

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

        /**
         */

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

        /**
         */

        sift.use = function(plugin) {
            if (isFunction(plugin)) return plugin(sift);
            for (var key in plugin) {
                if (key.charCodeAt(0) === 36) operator[key] = plugin[key];
            }
        };

        /**
         */

        sift.indexOf = function(query, array, getter) {
            return search(array, createRootValidator(query, getter));
        };

        /**
         */

        sift.compare = function(a, b) {
            if (a === b) return 0;
            if (typeof a === typeof b) {
                if (a > b) return 1;
                if (a < b) return -1;
            }
        };

        
        utils.sift = sift;
    })(utils);

    // https://github.com/k-yak/JJLC/blob/master/scripts/jjlc.dev.js
    (function(root) {
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
                var compressed,
                    dict;

                compressed = localStorage.getItem(key);

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
        root.JJLC = new JJLC();
    }(utils));
    utils.localStorage = utils.JJLC;

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

    // http://andrewdupont.net/2009/08/28/deep-extending-objects-in-javascript/
    Object.deepExtend = function deepExtend (destination, source) {
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
    };

    function Eev() {
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


    var getRecord = function(model) {
        var record = {};
        for(var key in model) {
            if (model.hasOwnProperty(key) && ['$$hashKey', '_endpoint', '_events'].indexOf(key) == -1) {
                record[key] = model[key];
            }
        }
        return record;
    };


    /**
     * Model Start
     */

    var Model = function(point, params) {
        params = params || {};
        Object.deepExtend(this, params);
        this.id = this.id || utils.uuid.v4();
        this.meta = this.meta || {};
        this._events = {};
        this._endpoint = point;
    };

    Model.prototype = Object.create(Eev.prototype);

    Model.prototype.get = function() {
        return getRecord(this);
    };

    Model.prototype.post = function(callback) {

        if (callback) this._endpoint._socket.once('post', callback);

        // update properties
        var params = {
            meta: {
                synced: false,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                deletedAt: null
            }
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
        return this;
    };

    Model.prototype.put = function(params, callback) {
      
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
        return this;
    };

    Model.prototype.delete = function(callback) {

        if(callback) this._endpoint._socket.once('delete', callback);

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

        // emit socket
        this._endpoint._socket.emit('delete', this.id);
        return this;
    };

    Model.prototype.merge = function(_model) {
        if (JSON.stringify(getRecord(this)) != JSON.stringify(_model)) {
            // update properties
            Object.deepExtend(this, _model);

            // save into storage
            this._endpoint.commit();

            // emit events
            this.emit('merge', this);
            this._endpoint.emit('merge', this);
        }
        return this;
    };

    /**
     * Endpoint start
     */

    var Endpoint = function(CastMyDataServer, path, options) {

        this._options = {};
        Object.deepExtend(this._options, (options || {}));

        var that = this;
        var key = this._key = 'cmd_' + path;

        if ((/[^a-zA-Z0-9-_\.]/g).test(path)) {
            throw 'Invalid characters in path. Allowed characters are a-z, A-Z, 0-9, -, _, .';
        }

        this.models = [];
        this._socket = [];
        this._events = {};
        this._filter = null;
        this._subscribed = false;

        // create the socket
        var socket = this._socket = ((typeof io !== 'undefined') ? io : require('socket.io-client'))
            (CastMyDataServer + '?path=' + path, {
                multiplex: false
            });
        socket.path = path;

        // Add handlers
        function syncHandler (data, callback) {
            if (!that._subscribed) return;
                        data.forEach(function(_model) {
                postHandler(_model);
            });
            that.emit('sync', that.models);
            if(callback) callback();
        }

        function postHandler(_model, callback) {
            if (!that._subscribed) return;
            var model = that.find(_model.id);
            if (model) {
                model.merge(_model);
                model.emit('merge', model);
                that.emit('merge', model);
            } else {
                // create model
                model = new Model(that, _model);

                // add to models
                that.models.push(model);

                // save into storage
                that.commit();
            }
            // emit events
            model.emit('post', model);
            that.emit('post', model);
            if(callback) callback(model);
        }

        function putHandler (record, callback) {
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
                model = new Model(that, record);
                that.models.push(model);
                that.commit();
            }
            model.emit('put');
            if(callback) callback(model);
        }

        function deleteHandler(record, callback) {
            if (!that._subscribed) return;
            var model = that.find(record.id);
            if (model) {
                // update properties

                for(var key in model) {
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
                Object.deepExtend(model.meta, record.meta);

                // save into storage
                that.commit();

                // emit events
                model.emit('merge', model);
                that.emit('merge', model);
                if(callback) callback(model);
            }
        }

        function clearHandler (callback) {
            utils.localStorage.setItem(key, '[]');
            that.models.splice(0, that.models.length);
            that.emit('clear');
            if(callback) callback();
        }

        function listenHandler (channel, callback) {
            that.emit('listen', channel);
            if(callback) callback(channel);
        }

        function unlistenHandler (channel, callback) {
            that.emit('unlisten', channel);
            if(callback) callback(channel);
        }

        function broadcastHandler (data, callback) {
            that.emit('broadcast', data);
            that.emit('broadcast:' + data.channel, data.payload);
            if(callback) callback(data);
        }

        function reconnectHandler () {
            if (that._subscribed) {
                that.subscribe(that._options);
            }
        }

        function serverErrorHandler (error) {
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
        socket.on('sync', function(records){
            syncHandler(records, function(model){
                that.emit('receipt:sync');
            });
        });
        socket.on('receipt:post', function(record){
            postHandler(record, function(model){
                model.emit('receipt:post', model);
            });
        });
        socket.on('receipt:put', function(data){
            putHandler(data, function(model){
                model.emit('receipt:put', model);
            });
        });
        socket.on('receipt:delete', function(record){
            deleteHandler(record, function(model){
                model.emit('receipt:delete', model);
            });
        });
        socket.on('receipt:clear', function(){
            clearHandler(function(){
                that.emit('receipt:clear');
            });
        });
        socket.on('receipt:listen', function(channel){
            listenHandler(channel, function(channel){
                that.emit('receipt:listen:' + channel, channel);
            });
        });
        socket.on('receipt:unlisten', function(channel){
            unlistenHandler(channel, function(channel){
                that.emit('receipt:unlisten:' + channel, channel);
            });
        });
        socket.on('receipt:broadcast', function(data){
            broadcastHandler(data, function(data){
                that.emit('receipt:broadcast', data);
            });
        });
    };

    Endpoint.prototype = Object.create(Eev.prototype);

    Endpoint.prototype.load = function(callback) {
        var that = this;
        var datas = utils.localStorage.getItem(this._key);
        if(callback) this.once('load', callback, this);
        if (datas) {
            var models = JSON.parse(datas).map(function(_model) {
                return new Model(that, _model);
            });
            if(this._filter) {
                models = utils.sift(this._filter, models);
            }
            models.unshift(0);
            models.unshift(this.models.length);
            this.models.splice.apply(this.models, models);
        }
        this.emit('load', this.models);
    };

    Endpoint.prototype.commit = function(callback) {
        if(callback) this.once('commit', callback);
        var models = this.models.map(function(model) {
            return model.get();
        });
        utils.localStorage.setItem(this._key, JSON.stringify(models));
        this.emit('commit');
    };

    Endpoint.prototype.subscribe = function(options, callback) {
        if(typeof options == 'function') {
            callback = options;
            options = {};
        }
        var that = this;
        function sub() {
            that._options = options || {};
            that._filter = that._options.filter;
            that._socket.emit('subscribe', that._options);
            that.emit('subscribed');
            that._subscribed = true;
            that.sync(callback);
        }
        if (this._subscribed) {
            this.unsubscribe(sub);
        } else {
            sub();
        }
        return this;
    };

    Endpoint.prototype.unsubscribe = function(callback) {
        if(callback) this._socket.once('unsubscribe', callback);
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
        if(callback) this.once('receipt:sync', callback);
        this._socket.emit('sync', unsynced);
        return this;
    };

    Endpoint.prototype.post = function(record, callback) {
        var model = new Model(this, record);
        if(callback) model.once('receipt:post', callback);
        model.post();
        return this;
    };

    Endpoint.prototype.create = function(params, callback) {
        var model = new Model(this, params);
        model.post(callback);
        return this;
    };

    Endpoint.prototype.put = function(id, record, callback) {
        var model = this.find(id);
        if (model) {
            if(callback) model.once('receipt:put', callback);
            model.put(record);
        }
        return this;
    };

    Endpoint.prototype.delete = function(id, callback) {
        var model = this.find(id);
        if (model) {
            if(callback) model.once('receipt:delete', callback);
            model.delete();
        }
        return this;
    };

    Endpoint.prototype.clear = function(callback) {
        if(callback) this._socket.once('receipt:clear', callback);
        this._socket.emit('clear');
        return this;
    };

    Endpoint.prototype.listen = function(channel, callback) {
        if(callback) this.once('receipt:listen:' + channel, callback);
        this._socket.emit('listen', channel);
        return this;
    };

    Endpoint.prototype.unlisten = function(channel, callback) {
        if(callback) this.once('receipt:unlisten:' + channel, callback);
        this._socket.emit('unlisten', channel);
        return this;
    };

    Endpoint.prototype.broadcast = function(channel, payload, callback) {
        if(callback) this.once('receipt:broadcast', callback);
        this._socket.emit('broadcast', {
            channel: channel,
            payload: payload
        });
        return this;
    };

    Endpoint.prototype.close = function(callback) {
        if(callback) this._socket.once('close', callback);
        this._socket.close('close');
        return this;
    };

    // Queries
    Endpoint.prototype.find = function(id) {
        return this.models.filter(function(model) {
            return model.id == id;
        }).pop();
    };

    Endpoint.prototype.where = function(filter) {
        return new Query(this, filter);
    };

    /**
     * Query start
     */

    var Query = function(endpoint, filter) {
        this.models = [];
        this._filter = filter;
        this._endpoint = endpoint;
        this._events = {};
        var that = this;
        this._endpoint.on('subscribed', function() {
            that.run();
            that.emit('subscribed');
        });
        this._endpoint.on('unsubscribed', function() {
            that.run();
            that.emit('unsubscribed');
        });
        this._endpoint.on('sync', function(models) {
            that.run();
            that.emit('sync', models);
        });
        this._endpoint.on('post', function(model) {
            that.run();
            that.emit('post', model);
        });
        this._endpoint.on('put', function(model) {
            that.run();
            that.emit('put', model);
        });
        this._endpoint.on('delete', function(model) {
            that.run();
            that.emit('put', model);
        });
        this._endpoint.on('clear', function() {
            that.run();
            that.emit('clear');
        });
        this._endpoint.on('merge', function() {
            that.run();
            that.emit('merge');
        });
        this.run.call(that);
    };

    Query.prototype = Object.create(Eev.prototype);

    Query.prototype.run = function() {
        this.models = this._endpoint.models.filter(this._filter);
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

    exports.Model = Model;
    exports.Query = Query;
    exports.Endpoint = Endpoint;
    exports.Utils = utils;
}));