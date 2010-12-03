// zlib.js
// A compression/decompression library for Javascript
// (c) 2010 Justin Cormack

var events = require('events');
var adler32 = require('./checksum').adler32;

var emitter = new events.EventEmitter();

// note little-endian unlike PNG
// turn into local functions?
function to32(bytes) {
	var c = (bytes[3] << 24) | (bytes[2] << 16) | (bytes[1] << 8) | bytes [0];
	c = (c < 0) ? 0x100000000 + c: c;
	return c;
}

function to16(bytes) {
	return 256 * bytes[1] + bytes[0];
}

// pull out get functions into parse library, as used in PNG library as well.
// issue is that use state from closure at the moment, would need to move to this.state
var inflate = Object.create(emitter);

inflate.read = function(stream) {
	var z = this;
	var state;
	
	function unlisten() {
		stream.removeListener('data', data);
		stream.removeListener('end', end);	
	}
	
	function data(buf) {		
		while (typeof state == 'function' && buf.length) {
			var ret = state('data', buf);
			
			if (typeof ret == 'string') {
				z.emit('bad', ret);
				state = null;
			}
			
			buf = ret;
		}
		
		if (typeof state !== 'function') {
			unlisten();
		}
	}
	
	function end() {
		var ret = state('end');
			
		if (typeof ret == 'string') {
			z.emit('bad', ret);
			state = null;
		}
		
		unlisten();
		z.emit('end');
	}
	
	function get(len, match, ev, buf, acc) {
		
		function again(ev, buf) {
			return get(len, match, ev, buf, acc);
		}
		
		if (ev != 'data') {
			return 'unexpected end of stream';
		}

		if (typeof acc == 'undefined') {
			acc = [];
		}

		var max = len - acc.length;
		max = (max > buf.length) ? buf.length : max;

		acc = acc.concat(Array.prototype.slice.call(buf, 0, max));
		
		buf = buf.slice(max);
						
		if (acc.length < len) {
			state = again;
			return buf;
		}
		
		var ret = match(acc);
		
		if (typeof ret == 'string') {
			return ret;
		}
		
		state = ret;
		return buf;
	}
	
	function zerot(match, ev, buf) { // zero terminated string; we will need result to check crc
		
		if (ev != 'data') {
			return 'unexpected end of stream';
		}
		
		for (var i = 0; i < buf.length; i++) {
			if (buf[i] === 0) {
				state = match();
				return buf.slice(i + 1);
			}
		}
		return []; // equivalent to an empty buffer; unchanged state
	}
	
	function gunzip(ev, buf) {
		// var ftext; // unused
		var fhcrc;
		var fextra;
		var fname;
		var fcomment;
		
		function compressed(ev, buf) {
			console.log("got to compressed!");
			
			return [];
		}
		
		function hcrc(ev, buf) {
			function checkcrc(bytes) {
				// not yet implementing checks
				return compressed;
			}
			return get(2, checkcrc, ev, buf);
		}
		
		function comment(ev, buf) {
			function next() {
				if (fhcrc) {
					return hcrc;
				}
				return compressed;
			}
			
			return zerot(next, ev, buf);
		}

		function name(ev, buf) {
			function next() {
				if (fcomment) {
					return comment;
				}
				if (fhcrc) {
					return hcrc;
				}
				return compressed;
			}
		
			return zerot(next, ev, buf);
		}
		
		function extra(ev, buf) {
			
			function next(bytes) {
				if (fname) {
					return name;
				}
				if (fcomment) {
					return comment;
				}
				if (fhcrc) {
					return hcrc;
				}
				return compressed;
			}
			
			function xlen(bytes) {
				return get(to16(bytes), next, ev, buf);
			}
			
			return get(2, xlen, ev, buf);
		}
		
		function gunzipMatch(bytes) {
			var id1 = bytes[0];
			var id2 = bytes[1];
			var cm = bytes[2];
			var flg = bytes[3];
			// var mtime = to32(bytes.slice(4)); // unused
			// var xfl = bytes[8]; // unused
			// var os = bytes[9]; // unused
				
			if (id1 !== 31 || id2 !== 139) {
				return "not a gzip file";
			}
		
			if (cm !== 8) {
				return "unknown compression method";
			}
				
			// ftext = flg & 1; // unused
			fhcrc = (flg >>> 1) & 1;
			fextra = (flg >>> 2) & 1;
			fname = (flg >>> 3) & 1;
			fcomment = (flg >>> 4) & 1;
		
			console.log("flags: fhcrc " + fhcrc + " fextra " + fextra + " fname " + fname + " fcomment " + fcomment);
		
			if (fextra) {
				return extra;
			}
			if (fname) {
				return name;
			}
			if (fcomment) {
				return comment;
			}
			if (fhcrc) {
				return hcrc;
			}
			return compressed;
		
		}
				
		return get(10, gunzipMatch, ev, buf);
	}
	
	state = gunzip;
	
	stream.on('data', data);
	stream.on('end', end);
	
	this.pause = stream.pause;
	this.resume = stream.resume;
	
	return this;	
};

(function(exports) {
	exports.inflate = inflate;
})(

  typeof exports === 'object' ? exports : this
);
