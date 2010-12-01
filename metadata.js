// example to call a callback with the metadata from a file in a JSON object

var events = require('events');
var fs = require('fs');
var png = require('./pngback');

function mdata(filename, stream) {
	var m = Object.create(png.metadata);
	
	m.stream(stream, function(d) {
		if (Object.getOwnPropertyNames(d).length !== 0) {
			console.log(d);
		}
		});
}

process.argv.forEach(function(val, index, array) {
	if (index > 1) {
		mdata(val, fs.ReadStream(val));
	}
});
