
var png = require('./pngback');
var events = require('events');
var fs = require('fs');

function test5(filename, stream) {
	//var fsm = Object.create(png.pfsm);
	var fsm = png.pfsm;
	fsm.filename = filename;
	fsm.stream(stream);
	//fsm.on2('finish', sb.finish, sb);
}

//test1();

process.argv.forEach(function(val, index, array) {
	if (index > 1) {
		//test2(fs.ReadStream(val));
		test5(val, fs.ReadStream(val));
	}
});





