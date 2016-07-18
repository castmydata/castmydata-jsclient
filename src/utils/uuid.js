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