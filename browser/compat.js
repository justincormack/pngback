// compatibility for node.js vs browser

function require(module) {

	var events = {}; // minimal event interface, just what we use
	events.EventEmitter = function() {
		this._listen = {};
		this.emit = function(ev, data) {
			if (ev in this._listen) {
				for (var i = 0; i < this._listen.length; i++) {
					this._listen[ev][i](data);
				}
			}
		}
		this.on = function(ev, f) {
			if (! ev in this._listen) {
				this._listen[ev] = [];
			}
			this._listen[ev].push(f);
			this.emit('newListener');
		};
		this.removeListener = function(ev, f) {
			if (ev in this._listen) {
				var p = this._listen.indexOf(f);
				if (p !== -1) {
					this._listen.splice(p, 1);
				}
			}
		}
	};




	switch (module) {
		case 'events':
			return events;
		case './checksum/crc':
			return _crc;
		case './parse/parse':
			return _parse;
		case './pngback':
			return _png;
		default:
			throw new Error('unknown module');
	}
}

