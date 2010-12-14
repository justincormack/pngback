var events = require('events');
var fs = require('fs');

var inflate = require('./inflate.js').inflate;

function gunzip(stream, out) {
	var g = Object.create(inflate);
	
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

	/*g.on('end', function() {
		console.log("end of stream");
	});*/ // being called twice?

	g.on('bad', function(msg) {
		console.log(msg);
	});	

	g.read(stream);
}

if (process.argv.length == 2) {
	gunzip(process.openStdin(), process.stdout);
} else {
	process.argv.forEach(function(val, index, array) { // should unzip to files as gunzip usually does
		if (index > 1) {
			gunzip(fs.ReadStream(val), process.stdout);
		}
	});
}
