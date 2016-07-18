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