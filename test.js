

var events = require('events');
var fs = require('fs');
var png = require('./pngback');
var crc = require('./crc');

function test(filename, stream) {
	var p = Object.create(png.parse);
	
	p.on('bad', function(msg) {console.log(filename + " error: " + msg);});
	p.on('end', function() {console.log(filename + " ok");});

	p.stream(stream);
}

//test1();

function testadler(string) {
	var a = [];
	
	for (var i = 0; i < string.length; i++) {
		a.push(string.charCodeAt(i));
	}
	
	var adler = Object.create(crc.adler32);
	adler.start();
	adler.add(a);
	return adler.finalize();
}

//console.log("adler of Wikipedia is " + testadler("Wikipedia") + " should be 300286872");

process.argv.forEach(function(val, index, array) {
	if (index > 1) {
		test(val, fs.ReadStream(val));
	}
});





