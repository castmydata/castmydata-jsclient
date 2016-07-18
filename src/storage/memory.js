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