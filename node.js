// Node.js test file for pngback

// read a PNG file from command line and do some processing

var png = require('./pngback');

var fs = require('fs');

png.test();

console.log();

process.argv.forEach(function(val, index, array) {
	if (index > 1) {
		png.vtest(fs.ReadStream(val));
	}
});

