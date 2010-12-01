

var events = require('events');
var fs = require('fs');
var png = require('./pngback');
var crc = require('./crc');

function test5(filename, stream) {
	var pfsm = Object.create(png.pfsm);
	var cfsm = Object.create(png.cfsm);
	
	cfsm.listen(pfsm);
	
	pfsm.filename = filename;
	
	console.log("starting " + filename);
	
	pfsm.init(stream);
	//fsm.on2('finish', sb.finish, sb);
}

function test6(filename, stream) {
	var ping = Object.create(png.png);
	var cfsm = Object.create(png.cfsm);
	
	cfsm.listen(ping);
	cfsm.on('bad', function(msg) {console.log(filename + " error: " + msg);});

	ping.stream(stream);
	

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
		//test2(fs.ReadStream(val));
		//test5(val, fs.ReadStream(val));
		test6(val, fs.ReadStream(val));
	}
});





