// zlib.js
// A compression/decompression library for Javascript
// (c) 2010 Justin Cormack

var crc32 = require('../checksum/crc').crc32;
var parse = require('../parse/parse').parse;

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

// binary pretty print
function binary(n, l) {
	var d = false;
	var s = '';
	if (typeof l === 'undefined') {
		l = 32;
	} else {
		d = true;
	}
	for (i = l - 1; i >= 0; i--) {
		if (i === 0) {
			d = true;
		}
		if ((n >>> i) & 1) {
			d = true;
			s += '1';
		} else if (d) {
			s += '0';
		}
	}
	return s;
}

// Huffman coding functions

var huff = {
	repeat: function(x, c) {
		var a = [];
		for (var i = 0; i < c; i++) {
			a.push(x);
		}
		return a;
	},
	expand: function(a) {
		var ret = [];
		while (a.length) {
			var h = a.shift();
			ret = ret.concat(this.repeat(h.bits, h.length));
		}
		return ret;
	},
	type1: function() {
		return this.expand([
			{bits: 8, length: 143 - 0 + 1},
			{bits: 9, length: 255 - 144 + 1},
			{bits: 7, length: 279 - 256 + 1},
			{bits: 8, length: 287 - 280 + 1}
		]);
	},
	// extra bits and lengths, offset by 257
	exbits: [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0],
	lens: [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258],
	// extra bits for distances
	eebits: [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13],
	dists: [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577],
	init: function(bl) {
		var max = 0;
		var min = 0;
		var i = 0;
		for (i = 0; i < bl.length; i++) {
			max = (bl[i] > max) ? bl[i] : max;
			min = (min === 0 || bl[i] < min) ? bl[i] : min;
		}
		blcount = this.repeat(0, max + 1); // initialize with zeros
		for (i = 0; i < bl.length; i++) { // number of nodes in each code length
			blcount[bl[i]]++;
		}

		/*console.log("blcount");
		for (i = 1; i <= max; i++) {
			console.log(i + "  " + blcount[i]);	
		}*/

		var code = 0;
		var nextcode = [];
		for (i = 1; i <= max; i++) { // smallest code for each length, in binary
			code = (code + blcount[i - 1]) * 2;
			nextcode[i] = code;
		}

		/*console.log("nextcode");
		for (i = 1; i <= max; i++) {
			console.log(i + "  " + nextcode[i]);	
		}*/
	
		var codes = [];
		var len;
		for (i = 0; i < bl.length; i++) {
			len = bl[i];
			if (len !== 0) {
				codes[i] = nextcode[len];
				nextcode[len]++;
			}
		}

		/*console.log("symbol len code");
		for (i = 0; i < bl.length; i++) {
			console.log(i + " " + bl[i] + " " + binary(codes[i], bl[i]));
		}*/

		this.codes = codes; // not how we want to use the data? want indexed by length, prefix?
		this.bl = bl;
		this.shortest = min;
		this.longest = max;
	},
	check: function(n, len) {
		// stupidly inefficient, work out how we need to actually organize codes!!!
		for (var i = 0; i < this.codes.length; i++) {
			if (this.bl[i] == len) {
				if (this.codes[i] == n) {
					return i;
				}
			}
		}
		if (len == max) {
			throw new Error("impossible!");
		}
		return -(len + 1); // actually can return next used code
	}
};

var inflate = Object.create(parse);

inflate.read = function(stream) {
	var z = this;
	var get = function(len, match, ev, buf) {return z.get.call(z, len, match, ev, buf);};
	var getb = function(len, match, ev, buf) {return z.getb.call(z, len, match, ev, buf);};
	var shuf; // standard huffman code

	function zerot(match, ev, buf) { // zero terminated string; we will need result to check crc
		
		if (ev != 'data') {
			return 'unexpected end of stream';
		}
		
		for (var i = 0; i < buf.length; i++) {
			if (buf[i] === 0) {
				z.state = match();
				return buf.slice(i + 1);
			}
		}
		return []; // equivalent to an empty buffer; unchanged state
	}
	
	function atend(ev) {
		if (ev != 'end') {
			return 'expected the end of stream';
		}
		z.emit('end');
		z.unlisten();
	}
	
// it may be more performant to run the main decompress as a loop, without all the function calls, inline everything
// at the moment it gets very indirect. that would mean bringing getb back here for this case
	function uncompress(winSize, next, ev, buf) {
		var bfinal = false;
		
		function again(ev, buf) {
			return uncompress(winSize, next, ev, buf);
		}
		
		// redo to share with user created tables. ie pass huf var to here
		function standard(ev, buf) { // standard Huffman code
			var ex, len, ee, dist;

			function backref(dist, len) {
				console.log("backref: " + dist + " " + len);
			}

			function eebits(ev, buf) {
				function match(n) {
					dist += n;
					backref();
					return standard;
				}

				return getb(ee, match, ev, buf);
			}

			function distance(ev, buf) {
				function match(n) {
					if (n > 29) {
						return 'invalid distance';
					}
					ee = z.eebits[n];
					dist = z.dist[n];
					if (ee > 0) {
						return eebits;
					}
					backref();
					return standard;
				}				

				return getb(5, match, ev, buf);
			}


			function ebits(ev, buf) {
				function match(n) {
					len += n;
					return distance;
				}

				return getb(ex, match, ev, buf);
			}

			function check(n, len) {
				var ret = shuf.check(n, len);
				
				if (ret < 0) { // not enough bits, returns next length
					return -ret;
				}

				if (ret === 256) { // end of block
					return nextblock;
				}
				if (ret > 285) {
					return 'invalid compressed data';
				}

				if (ret > 256) { // back reference
					ex = z.exbits[ret - 257];
					len = z.lens[ret - 257];
					if (ex > 0) {
						return ebits;
					}
					return distance;
				}

				// literal
				console.log("literal: " + ret);
				return standard;
			}

			if (typeof shuf == 'undefined') {
				shuf = Object.create(huff);
				shuf.init(shuf.type1());
			}
			
			return getb(shuf.shortest, check, ev, buf);
		}

		function nocompress(ev, buf) {
			
			function lennlen(ev, buf) {
				
				function check(bytes) {
					var len = to16(bytes);
					var nlen = top16(bytes);
					var nnlen = (~nlen + 0x100000000) & 0xffff;
					
					function udata(ev, buf) { // len bytes uncompressed data

						if (len === 0) {
							z.state = nextblock;
							return buf;
						}
						if (ev != 'data') {
							return 'unexpected end of stream';
						}
						
						if (len >= buf.length) {
							z.emit('data', buf);
							len -= buf.length;
							
							if (len === 0) {
								z.state = nextblock;
							}
							
							return [];
						}
						z.emit('data', buf.slice(0, len));
						z.state = nextblock;
						return buf.slice(len);
					}

					if (len !== nnlen) {
						return 'uncompressed length does not match ones complement ' + len + ' ' + nlen;
					}
					return udata;
				}
				
				return get(4, check, ev, buf);
			}
			
			function skip(ev, buf) {
				if (ev != 'data') {
					return 'unexpected end of stream';
				}
				if (buf.length === 0 && this.b !== 0) {
					return [];
				}
				if (this.b !== 0) { // skip to next byte boundary
					buf = buf.slice(1);
					this.b = 0;
				}
				z.state = lennlen;
				return buf;
			}

			z.state = skip;
			return buf;
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
			if (btype === 1) { // standard table
				return standard;
			}
			return 'code for type ' + btype + ' not written yet';
		}
		
		function block(ev, buf) {
			return getb(3, header, ev, buf);
		}
		
		function nextblock(ev, buf) {
			if (bfinal) {
				z.state = next;
				if (this.b !== 0) { // skip to next byte boundary
					buf = buf.slice(1);
					this.b = 0;
				}
				return buf;
			}
			z.state = block;
			return buf;
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
				return "not a gzip file " + bytes;
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
	
	this.state = gunzip;
	
	this.listen(stream);
	
	return this;	
};

(function(exports) {
	exports.inflate = inflate;
	exports.huff = huff;
})(

  typeof exports === 'object' ? exports : this
);

