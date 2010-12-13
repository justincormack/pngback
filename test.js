

var events = require('events');
var fs = require('fs');
var png = require('./pngback');

function test(filename, stream) {
	var p = Object.create(png.parse);
	
	p.on('bad', function(msg) {console.log(filename + " error: " + msg);});
	p.on('end', function() {console.log(filename + " ok");});

	p.stream(stream);
}

process.argv.forEach(function(val, index, array) {
	if (index > 1) {
		test(val, fs.ReadStream(val));
	}
});





