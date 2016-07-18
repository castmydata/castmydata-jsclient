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