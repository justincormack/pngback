var events = require('events');
var fs = require('fs');

var inflate = require('./inflate.js').inflate;

function gunzip(stream) {
	var g = Object.create(inflate);
	
	g.on('bad', function(msg) {
		console.log("error: " + msg);
	});
	g.on('end', function() {
		console.log("reached end of stream ok");
	});
	
	g.read(stream);
}

if (process.argv.length == 2) {
	gunzip(process.openStdin());
} else {
	process.argv.forEach(function(val, index, array) { // should unzip to files as gunzip usually does
		if (index > 1) {
			gunzip(fs.ReadStream(val));
		}
	});
}