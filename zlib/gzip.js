var events = require('events');
var fs = require('fs');

var deflate = require('./deflate.js').deflate;

// this is basically util.pump, could use instead.
function gzip(stream, out) {
	var g = Object.create(deflate);
		
	g.on('data', function(buf) {
		var written = out.write(buf);
		if (! written) {
			if (stream.readable) {
				stream.pause();
			}
			out.once('drain', function() {
				if (stream.readable) {
					stream.resume();
				}
			});
		}
	});
	
	g.read(stream);
}

if (process.argv.length == 2) {
	gzip(process.openStdin(), process.stdout);
} else {
	process.argv.forEach(function(val, index, array) { // should unzip to files as gzip usually does
		if (index > 1) {
			gzip(fs.ReadStream(val), process.stdout);
		}
	});
}