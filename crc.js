/* crc checks */

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
			c = (c < 0) ? 0xffffffff + c + 1: c;
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
		c = (c < 0) ? 0xffffffff + c + 1: c;
		this.crc = c;
		return c;
	}
};

crc32.start(); // initialize table on parent object

(function(exports) {
	exports.crc32 = crc32;
})(

  typeof exports === 'object' ? exports : this
);