/* crc checks */

(function(exports) {

var crc32 = {
	seed: 0xedb88320,
	crc: 0xffffffff,
	table: [],
	init: function() {
		var c;

		for (var n = 0; n < 256; n++) {
			c = n;
			for (var k = 0; k < 8; k++) {
				if (c & 1) {
					c = this.seed ^ (c >>> 1);
				} else {
					c = c >>> 1;
				}	
			}
			c = (c < 0) ? 0x100000000 + c: c;
			this.table[n] = c;
		}
	},
	start: function() {
		this.crc = 0xffffffff;
		if (this.table.length === 0) {
			this.init();
		}
	},
	add: function(bytes) {
		var c = this.crc;
		var len = bytes.length;

		for (var n = 0; n < len; n++) {
			c = this.table[(c ^ bytes[n]) & 0xff] ^ (c >>> 8);
		}
		this.crc = c;	
	},
	finalize: function() {
		var c = this.crc;
		c = c ^ 0xffffffff;
		c = (c < 0) ? 0x100000000 + c: c;
		this.crc = c;
		return c;
	}
};

crc32.start(); // initialize table on parent object

// adler32 crc implementation
// not 100% convinced that the loop unroll in js is worth it.
// Also NMAX can be increased, as we have more than 32 bits to play with.

var adler32 = {
	start: function() {
		this.adler = 1;
	},
	finalize: function() {
		return this.adler;
	},
	add: function(buf) {
		var adler = this.adler;
		var len = buf.length;
		var offset = 0;
		var BASE = 65521;
		var NMAX = 5552;  // NMAX is the largest n such that 255n(n+1)/2 + (n+1)(BASE-1) <= 2^32-1
		var n;
	
		var sum2 = (adler >>> 16);
		adler &= 0xffff;
	
		while (len) {
			n = (len > NMAX) ? NMAX : len;
			len -= n;
			while (n) {
				if (n > 16) {
					adler += buf[offset++]; sum2 += adler;
					adler += buf[offset++]; sum2 += adler;
					adler += buf[offset++]; sum2 += adler;
					adler += buf[offset++]; sum2 += adler;
					adler += buf[offset++]; sum2 += adler;
					adler += buf[offset++]; sum2 += adler;
					adler += buf[offset++]; sum2 += adler;
					adler += buf[offset++]; sum2 += adler;
					adler += buf[offset++]; sum2 += adler;
					adler += buf[offset++]; sum2 += adler;
					adler += buf[offset++]; sum2 += adler;
					adler += buf[offset++]; sum2 += adler;
					adler += buf[offset++]; sum2 += adler;
					adler += buf[offset++]; sum2 += adler;
					adler += buf[offset++]; sum2 += adler;
					adler += buf[offset++]; sum2 += adler;
					n -= 16;
				} else {
					adler += buf[offset++]; sum2 += adler;
					n--;
				}
			}
			adler %= BASE;
			sum2 %= BASE;
		}

		this.adler = adler + sum2 * 65536;
	}
};



	exports.crc32 = crc32;
	exports.adler32 = adler32;
})(typeof (exports === 'object') ? exports : this._crc = {});

