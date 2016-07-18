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