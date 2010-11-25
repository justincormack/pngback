/* adler32.c -- compute the Adler-32 checksum of a data stream
 * Copyright (C) 1995-2007 Mark Adler
 * For conditions of distribution and use, see copyright notice in zlib.h
 */

/* 

#include "zutil.h" // may need some from here

#define local static

local uLong adler32_combine_(uLong adler1, uLong adler2, z_off64_t len2);

*/

var adler32 = {
};

// not 100% convinced that the loop unroll in js is worth it.
// Also NMAX can be increased, as we have more than 32 bits to play with.

adler32.start = function() {
	this.adler = 1;
};

adler32.finalize = function() {
	return this.adler;
};

adler32.add = function(buf) {
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
				console.log("a "+ adler + " s " + sum2);
				n--;
			}
		}
		adler %= BASE;
		sum2 %= BASE;
	}

	this.adler = adler + sum2 * 65536;
};

(function(exports) {
	exports.adler32 = adler32;
})(

  typeof exports === 'object' ? exports : this
);
