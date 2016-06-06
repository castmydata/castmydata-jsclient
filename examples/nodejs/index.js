var client = require('../../src/castmydata');

var endpoint = new client.Endpoint('http://www.castmydata.com', 'testendpoint');

endpoint.on('broadcast', function(message){
    console.log(message);
});

endpoint.broadcast('hey there!');