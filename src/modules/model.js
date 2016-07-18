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
