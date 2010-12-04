// zlib.js
// A compression/decompression library for Javascript
// (c) 2010 Justin Cormack

// note that so far deflate is just using the uncompressed storage method, which while correct is not useful for anything except testing

var events = require('events');
var adler32 = require('./checksum').adler32;
var crc32 = require('./checksum').crc32;

var emitter = new events.EventEmitter();

function from32(n) {
	return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
}

/*function from16(n) {
	return [n & 255, (n >>> 8) & 255];
}*/

var deflate = Object.create(emitter);

deflate.read = function(stream) {
	var z = this;
	var state;
	var out;
	var prev = [];
	var crc = Object.create(crc32);
	var isize = 0;
	var bfinal = 0;
	
	function unlisten() {
		stream.removeListener('data', data);
		stream.removeListener('end', end);	
	}
	
	function data(buf) {		
		state('data', buf);
	}
	
	function end() {
		state('end');

		unlisten();
		z.emit('end');
	}
	
	function write(buf) {
		// change to have just a queue of unwritten stuff? rather than joining?
		// need to deal with buffers larger than 64k here, or before.
		// needs a large rework
		
		if (typeof buf !== 'undefined') {
			var len = buf.length;
			var nlen = ~len + 0x100000000;
			out.push(bfinal); // other bits are 00 ie uncompressed
			out.push(len & 255, (len >>> 8) & 255);
			out.push(nlen & 255, (nlen >>> 8) & 255);
		} else {
			buf = [];
		}
		
		//console.log("out buf " + buf.length + " " + out);
		
		var ob = new Buffer(out.length + buf.length);
		
		for (var i = 0; i < out.length; i++) {
			ob[i] = out[i];
		}
		buf.copy(ob, out.length, 0);
		
		z.emit('data', ob);
		out = [];
	}
	
	function block(next, ev, buf) {
		if (ev == 'end') {
			bfinal = 1;
			write(prev);
			state = next;
			return;
		}
		if (buf.length === 0) {
			return;
		}
		if (prev.length > 0) {
			write(prev);
			prev = [];
		}
		prev = buf;
	}
	
	function gzip(ev, buf) {
		out = [31, 139, 8, 0, 0, 0, 0, 0, 4, 255]; // minimal header, no flags set, no mtime
		
		function trailer(ev, buf) {
			out.push(from32(crc));
			out.push(from32(isize));
			write();
		}
		
		function next(ev, buf) {
			block(trailer, ev, buf);
		}
		
		state = next;
		next(ev, buf);
	}
	
	
	state = gzip;
	
	stream.on('data', data);
	stream.on('end', end);
	
	this.pause = function() {stream.pause();};
	this.resume = function() {stream.resume();};
	
	return this;
};

(function(exports) {
	exports.deflate = deflate;
})(

  typeof exports === 'object' ? exports : this
);
