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