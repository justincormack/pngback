// zlib.js
// A compression/decompression library for Javascript
// (c) 2010 Justin Cormack

var events = require('events');
var adler32 = require('./checksum').adler32;
var crc32 = require('./checksum').crc32;

var emitter = new events.EventEmitter();

// note little-endian unlike PNG
// turn into local functions or library
function to32(bytes) {
	var c = (bytes[3] << 24) | (bytes[2] << 16) | (bytes[1] << 8) | bytes [0];
	c = (c < 0) ? 0x100000000 + c: c;
	return c;
}

function to16(bytes) {
	return 256 * bytes[1] + bytes[0];
}

function top16(bytes) {
	return 256 * bytes[3] + bytes[2];
}

// Huffman coding functions

var huff = {
	repeat: function(x, c, a) {
		if (typeof a == 'undefined') {
			a = [];
		}
		for (var i = 0; i < c; i++) {
				a.push(x);
			}
		return a;
	},
	expand: function(a) {
		var ret = [];
		while (a.length) {
			var h = a.pop();
			this.repeat(h.bits, h.length, ret);
		}
		return ret;
	},
	type1: function() {
		return expand([
			{bits: 8, length: 144},
			{bits: 9, length: 255 - 144},
			{bits: 7, length: 279 - 256},
			{bits: 8, length: 287 - 280}
		]);
	},
	init: function(bl) {
		var max = 0;
		var i = 0;
		for (i = 0; i < bl.length; i++) {
			max = (bl[i] > max) ? bl[i] : max;
		}
		var blcount = this.repeat(0, max + 1); // initialize with zeros
		for (i = 0; i < bl.length; i++) {
			blcount[bl[i]]++;
		}
		var code = 0;
		var nextcode = [];
		for (bits = 1; bits < max; bits++) {
			code = (code + blcount[bits - 1]) << 1;
			nextcode[bits] = code;
		}
	},




};

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
	
	function atend(ev) {
		if (ev != 'end') {
			return 'expected end of stream';
		}
		z.emit('end');
		unlisten();
	}
	
	function uncompress(winSize, next, ev, buf) {
		var b = 0; // bit position
		var bfinal = false;
		
		function again(ev, buf) {
			return uncompress(winSize, next, ev, buf);
		}
	
		function getb(len, match, ev, buf, acc, acclen) {
			
			function again(ev, buf) {
				return getb(len, match, ev, buf, acc, acclen);
			}
			
			function mask(b) {
				return (1 << (b + 1)) - 1;
			}
			
			if (ev != 'data') {
				return 'unexpected end of stream';
			}

			if (typeof acc == 'undefined') {
				acc = 0;
				acclen = 0;
			}
			
			var max = len - acclen;
			var maxb = buf.length * 8 - b;
			max = (max > maxb) ? maxb : max;

			var i = 0;
			
			// first pull the bits out of the first possibly partial byte
			var bs = (max < 8 - b) ? max : 8 - b;
			acc |= ((buf[i] >>> b) & mask(bs)) << acclen;
			acclen += bs;
			b += bs;

			if (b == 8) {
				i++;
				b = 0;
			}
			
			// now get the whole bytes
			while (bs - maxb > 8) {
				acc |= buf[i++] << acclen; // needs sign correction after 31 bits
				acclen += 8;
				bs += 8;
			}
			
			// now the remainder
			var diff = bs - maxb;
			if (diff > 0) {
				acc |= (buf[i] & mask(diff)) << acclen;
				acclen += diff;
				bs += diff;
				b += diff;
			}
			
			if (i > 0) {
				buf = buf.slice(i);
			}

			if (acclen < len) {
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
	
		function nocompress(ev, buf) {
			
			function lennlen(ev, buf) {
				
				function check(bytes) {
										
					var len = to16(bytes);
					var nlen = top16(bytes);
					var nnlen = (~nlen + 0x100000000) & 0xffff;
					
					function udata(ev, buf) { // len bytes uncompressed data

						if (len === 0) {
							state = nextblock;
							return buf;
						}
						if (ev != 'data') {
							return 'unexpected end of stream';
						}
						
						if (len >= buf.length) {
							z.emit('data', buf);
							len -= buf.length;
							
							if (len === 0) {
								state = nextblock;
							}
							
							return [];
						}
						z.emit('data', buf.slice(0, len));
						state = nextblock;
						return buf.slice(len);
					}

					if (len !== nnlen) {
						return 'uncompressed length does not match ones complement ' + len + " " + nlen;
					}
					return udata;
				}
				
				return get(4, check, ev, buf);
			}
			
			function skip(ev, buf) {
				if (ev != 'data') {
					return 'unexpected end of stream';
				}
				if (b !== 0) { // skip to next byte boundary
					buf = buf.slice(1);
					b = 0;
				}
				state = lennlen;
				return buf;
			}

			return skip(ev, buf);
		}
	
		function header(bits) {
			bfinal = bits & 1;
			btype = bits >>> 1;
			if (btype == 3) {
				return 'invalid block type';
			}
			if (btype === 0) { // no compression
				return nocompress;
			}
			return 'code for type ' + btype + ' not written yet';
		}
		
		function block(ev, buf) {
			return getb(3, header, ev, buf);
		}
		
		function nextblock(ev, buf) {
			if (bfinal) {
				state = next;
				return buf;
			}
			return block(ev, buf);
		}
	
		return block(ev, buf);
	}
	
	function gunzip(ev, buf) {
		// var ftext; // unused
		var fhcrc;
		var fextra;
		var fname;
		var fcomment;
		
		function trailer(ev, buf) {
			function check(bytes) { // does not check crc yet
				return atend;
			}
			return get(8, check, ev, buf);
		}
		
		function compressed(ev, buf) {
			return uncompress(32768, trailer, ev, buf);
		}
		
		function hcrc(ev, buf) {
			function check(bytes) {
				// not yet implementing checks
				return compressed;
			}
			return get(2, check, ev, buf);
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
