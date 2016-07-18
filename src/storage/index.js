(function() {

    var localWrapperFactory = require('./localWrapperFactory');
    var indexeddb = require('./indexeddb');
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