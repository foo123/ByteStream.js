/**
*   ByteStream.js
*   make reading, writing and parsing binary data easy
*
*   @version 1.0.0
*   https://github.com/foo123/ByteStream.js
*
**/
!function(root, name, factory) {
"use strict";
if (('object' === typeof module) && module.exports) /* CommonJS */
    module.exports = factory.call(root);
else if (('function' === typeof define) && define.amd && ('function' === typeof require) && ('function' === typeof require.specified) && require.specified(name) /*&& !require.defined(name)*/) /* AMD */
    define(name, ['module'], function(module) {return factory.call(root);});
else if (!(name in root)) /* Browser/WebWorker/.. */
    (root[name] = factory.call(root)||1) && ('function' === typeof(define)) && define.amd && define(function() {return root[name];});
}(  /* current root */          'undefined' !== typeof self ? self : this,
    /* module name */           "ByteStream",
    /* module factory */        function ModuleFactory__ByteStream(undef) {
"use strict";

function ByteStream(data)
{
    var self = this;
    if (!self instanceof ByteStream) return new ByteStream(data);

    self.opts = {};
    self.chunks = [];
    self.length = -1;
    self.pos = 0;
    self._chunk = 0;
    self._length = 0;
    self._passed = 0;
    self.option('forget_previous', false);
    if (data) self.add(data).finish();
}
ByteStream.VERSION = "1.0.0";
ByteStream.prototype = {
    constructor: ByteStream,
    opts: null,
    chunks: null,
    length: -1,
    pos: 0,
    _length: 0,
    _passed: 0,
    _chunk: 0,
    _bkup: null,
    _p: null,
    dispose: function() {
        this.chunks = this._bkup = null;
    },
    option: function(key, val) {
        var self = this, nargs = arguments.length;
        if (1 == nargs)
        {
            return Object.prototype.hasOwnProperty.call(self.opts, key) ? self.opts[key] : undef;
        }
        else if (1 < nargs)
        {
            self.opts[key] = val;
        }
        return self;
    },
    add: function(data) {
        var self = this;
        if (data)
        {
            data = ByteStream.toBytes(data);
            self.chunks.push(data);
            self._length += data.length;
        }
        return self;
    },
    finish: function() {
        var self = this;
        self.length = self._length;
        return self;
    },
    clear: function() {
        var self = this;
        self.chunks = [];
        self.length = -1;
        self.pos = 0;
        self._chunk = 0;
        self._length = 0;
        self._passed = 0;
        return self;
    },
    rewind: function() {
        var self = this;
        self.pos = 0;
        self._chunk = 0;
        self._passed = 0;
        return self;
    },
    shift: function(offset) {
        var self = this;
        self.pos += offset;
        if (0 > offset)
        {
            self.pos = stdMath.max(0, self.pos);
            self._chunk = 0;
            self._passed = 0;
        }
        return self;
    },
    eof: function() {
        var self = this;
        return (0 <= self.length) && (self.pos >= self.length);
    },
    block: function(cmd) {
        var self = this, curr, top;
        if ("start" === cmd)
        {
            if (!self._bkup) self._bkup = [];
            self._bkup.push({chunks:self.chunks,length:self._length});
            self.chunks = [];
            self.length = self._length = 0;
            return self;
        }
        else if ("end" === cmd)
        {
            curr = self.bytes();
            top = self._bkup ? self._bkup.pop() : null;
            if (top)
            {
                self.chunks = top.chunks;
                self.length = self._length = top.length;
            }
            else
            {
                self.chunks = [];
                self.length = self._length = 0;
            }
            return curr;
        }
    },
    peek: function(pos) {
        var self = this;
        if (0 > pos) pos = self.pos+pos;
        return new Promise(function(resolve, reject) {
            if (0 > pos)
            {
                resolve(undef);
            }
            else
            {
                var peek_or_wait_for_more = function peek_or_wait_for_more() {
                    var chunks = self.chunks, i = 0, k = 0;
                    while ((i < chunks.length) && (pos >= k+chunks[i].length)) k += chunks[i++].length;
                    if (i >= chunks.length)
                    {
                        if (0 > self.length) setImeout(peek_or_wait_for_more, 20);
                        else resolve(undef);
                    }
                    else
                    {
                        resolve(chunks[i][pos-k]);
                    }
                };
                peek_or_wait_for_more();
            }
        });
    },
    read: function() {
        var self = this, prev = self._p;
        return self._p = new Promise(function(resolve, reject) {
            var do_after_prev = function do_after_prev(action) {
                    if (prev) prev.then(action);
                    else action();
                },
                do_when_available = function do_when_available() {
                    do_after_prev(function() {
                        if (self.eof())
                        {
                            resolve(undef);
                        }
                        else
                        {
                            while ((self._chunk < self.chunks.length) && (self.pos >= self._passed+self.chunks[self._chunk].length))
                            {
                                self._passed += self.chunks[self._chunk].length;
                                ++self._chunk;
                            }
                            if (self._chunk >= self.chunks.length)
                            {
                                setTimeout(do_when_available, 20);
                            }
                            else
                            {
                                if ((0 < self._chunk) && self.option('forget_previous'))
                                {
                                    self.chunks = self.chunks.slice(self._chunk);
                                    self._chunk = 0;
                                }
                                ++self.pos;
                                resolve(self.chunks[self._chunk][self.pos-1-self._passed]);
                            }
                        }
                    });
                }
            ;
            do_when_available();
        });
    },
    readInt: async function(type, endianness) {
        var self = this, bytes, res = 0;

        type = String(type || 'uint8').toLowerCase();

        if (-1 === ['uint8','uint16','uint32','int8','int16','int32'].indexOf(type)) err('Unknown type "'+type+'" in ByteStream.readInt');

        if ('uint8' === type || 'int8' === type)
        {
            res = await self.read();
            if (null == res) return;
            if ('int8' === type) res = (new Int8Array((new Uint8Array([res])).buffer))[0];
            return res;
        }

        // little endian, the least significant byte is stored in the smallest address
        // big endian, the most significant byte is stored in the smallest address
        endianness = String(endianness || 'BE').toUpperCase();
        if ('LE' !== endianness) endianness = 'BE';

        if ('uint16' === type || 'int16' === type)
        {
            bytes = [await self.read(), await self.read()];
            if (null == bytes[0] || null == bytes[1]) return;
            res = 'LE' === endianness ? (bytes[0] | (bytes[1] << 8)) : (bytes[1] | (bytes[0] << 8));
            if ('int16' === type) res = (new Int16Array((new Uint16Array([res])).buffer))[0];
            return res;
        }

        if ('uint32' === type || 'int32' === type)
        {
            bytes = [await self.read(), await self.read(),
                    await self.read(), await self.read()];
            if (null == bytes[0] || null == bytes[1] || null == bytes[2] || null == bytes[3]) return;
            res = 'LE' === endianness ? (bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24)) : (bytes[3] | (bytes[2] << 8) | (bytes[1] << 16) | (bytes[0] << 24));
            if ('int32' === type) res = (new Int32Array((new Uint32Array([res])).buffer))[0];
            return res;
        }
    },
    readBytes: async function(n) {
        var self = this, i = 0, j, b,
            bytes = new Array(stdMath.abs(n));
        if (0 <= n)
        {
            for (i=0; i<n; ++i)
            {
                b = await self.read();
                if (null == b) break;
                bytes[i] = b;
            }
        }
        else
        {
            for (i=0,j=0; j>n; --j,++i)
            {
                b = await self.read();
                if (null == b) break;
                bytes[i] = b;
            }
        }
        if (!i) return;
        if (i < stdMath.abs(n)) bytes.length = i; // truncate
        return bytes;
    },
    readInts: async function(n, type, endianness) {
        var self = this, i = 0, ii, ints = new Array(n);
        for (i=0; i<n; ++i)
        {
            ii = await self.readInt(type, endianness);
            if (null == ii) break;
            ints[i] = ii;
        }
        if (!i) return;
        if (i < n) ints.length = i; // truncate
        return ints;
    },
    readChars: async function(n) {
        var self = this, chars = new Array(n), i = 0, c;
        for (i=0; i<n; ++i)
        {
            c = await self.read();
            if (null == c) break;
            chars[i] = fromCharCode(c);
        }
        if (!i) return;
        if (i < n) chars.length = i; // truncate
        return chars.join('');
    },
    readUtf8: async function(n) {
        var self = this, str = new Array(n), i = 0, c1, c2, c3, c4, u;
        for (i=0; i<n; ++i)
        {
            c1 = await self.read();
            if (null == c1) break;
            if (c1 < 128)
            {
                str[i] = fromCharCode(c1);
            }
            else if (c1 > 191 && c1 < 224)
            {
                c2 = await self.read();
                if (null == c2) break;
                str[i] = fromCharCode(((c1 & 31) << 6) | (c2 & 63));
            }
            else if (c1 > 239 && c1 < 365)
            {
                // Surrogate Pair
                c2 = await self.read();
                c3 = await self.read();
                c4 = await self.read();
                if (null == c2 || null == c3 || null == c4) break;
                u = (((c1 & 7) << 18) | ((c2 & 63) << 12) | ((c3 & 63) << 6) | (c4 & 63)) - 0x10000;
                str[i] = fromCharCode(0xD800 + (u >> 10), 0xDC00 + (u & 1023));
            }
            else
            {
                c2 = await self.read();
                c3 = await self.read();
                if (null == c2 || null == c3) break;
                str[i] = fromCharCode(((c1 & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63));
            }
        }
        if (!i) return;
        if (i < n) str.length = i; // truncate
        return str.join('');
    },
    readStruct: async function(fields) {
        var self = this, i, f, t, k, n, e, v, l = fields.length, struct = {};
        for (i=0; i<l; ++i)
        {
            f = fields[i];
            n = f.length || 1;
            e = f.endian || 'BE';
            k = String(f.name || i);
            t = f.type.toLowerCase();
            switch (t)
            {
                case 'char':
                    v = await self.readChars(n);
                    if (null == v) return;
                    struct[k] = v;
                break;
                case 'byte':
                    v = await self.readBytes(n);
                    if (null == v) return;
                    struct[k] = 1 === n ? v[0] : v;
                break;
                case 'uint8':
                case 'int8':
                case 'uint16':
                case 'int16':
                case 'uint32':
                case 'int32':
                    v = await self.readInts(n, t, e);
                    if (null == v) return;
                    struct[k] = 1 === n ? v[0] : v;
                break;
            }
        }
        return struct;
    },
    readBlock: async function() {
        var self = this, size = await self.readInt('uint16', 'BE');
        if (null == size) return;
        return {
            size: size,
            data: 2 <= size ? await self.readBytes(size-2) : null,
        };
    },
    readChunk: async function() {
        var self = this, size = await self.readInt('uint32', 'BE'), chunk;
        if (null == size) return;
        chunk = {
            type: await self.readChars(4),
            data: 0 < size ? await self.readBytes(size) : null,
            crc: await self.readInt('int32', 'BE')
        };
        if (null == chunk.type) return;
        return chunk;
    },
    write: function(bytes) {
        var self = this;
        self.add(bytes);
        self.length = self._length;
        return self;
    },
    writeInt: function(num, type, endianness) {
        var self = this, bytes = null, nb, nbytes = 1;

        type = String(type || 'uint8').toLowerCase();

        if (-1 === ['uint8','uint16','uint32','int8','int16','int32'].indexOf(type)) err('Unknown type "'+type+'" in ByteStream.writeInt');

        // little endian, the least significant byte is stored in the smallest address
        // big endian, the most significant byte is stored in the smallest address
        endianness = String(endianness || 'BE').toUpperCase();
        if ('LE' !== endianness) endianness = 'BE';

        nb = type.slice(-2);
        if ('16' === nb) nbytes = 2;
        else if ('32' === nb) nbytes = 4;
        bytes = ByteStream.alloc(nbytes);
        if (bytes) self.write(ByteStream.put(bytes, 0, num, type, endianness));
        return self;
    },
    writeUtf8: function(str) {
        // bytes = (new TextEncoder()).encode(str);
        var sl = str.length, bytes = new Array(4*sl), j = 0, i, c;
        for (i=0; i<sl; ++i)
        {
            c = str.charCodeAt(i);
            if (c < 128)
            {
                bytes[j++] = c;
            }
            else if (c < 2048)
            {
                bytes[j++] = (c >> 6) | 192;
                bytes[j++] = (c & 63) | 128;
            }
            else if (((c & 0xFC00) == 0xD800) && (i + 1) < sl && ((str.charCodeAt(i + 1) & 0xFC00) === 0xDC00))
            {
                // Surrogate Pair
                c = 0x10000 + ((c & 0x03FF) << 10) + (str.charCodeAt(++i) & 0x03FF);
                bytes[j++] = (c >> 18) | 240;
                bytes[j++] = ((c >> 12) & 63) | 128;
                bytes[j++] = ((c >> 6) & 63) | 128;
                bytes[j++] = (c & 63) | 128;
            }
            else
            {
                bytes[j++] = (c >> 12) | 224;
                bytes[j++] = ((c >> 6) & 63) | 128;
                bytes[j++] = (c & 63) | 128;
            }
        }
        bytes.length = j; // truncate
        return this.write(bytes);
    },
    writeStruct: function(struct) {
        var self = this, i, d, t, v, e, l = struct.length;
        for (i=0; i<l; ++i)
        {
            d = struct[i];
            e = d.endian || 'BE';
            t = d.type.toLowerCase();
            v = d.value;
            switch (t)
            {
                case 'char':
                case 'byte':
                    self.write(v);
                break;
                case 'uint8':
                case 'int8':
                case 'uint16':
                case 'int16':
                case 'uint32':
                case 'int32':
                    if (v === +v) v = [v];
                    v.forEach(function(vi) {self.writeInt(vi, t, e);});
                break;
            }
        }
        return self;
    },
    writeBlock: function(data) {
        var self = this, size = data ? data.length : 0;
        self.writeInt(size, 'uint16', 'BE');
        if (data) self.write(data);
        return self;
    },
    writeChunk: function(type, rawdata) {
        var self = this,
            data = rawdata ? ByteStream.toBytes(rawdata) : null,
            size = data ? data.length : 0,
            type_and_data = data ? ByteStream.concat([ByteStream.toBytes(type), data]) : ByteStream.toBytes(type);
        self.writeInt(size, 'uint32', 'BE');
        self.write(type_and_data);
        self.writeInt(ByteStream.crc32(type_and_data), 'int32', 'BE');
        return self;
    },
    bytes: function() {
        return ByteStream.concat(this.chunks);
    }
};
ByteStream.prototype.readByte = ByteStream.prototype.read;
ByteStream.prototype.writeChars = ByteStream.prototype.writeBytes = ByteStream.prototype.write;
ByteStream.toBytes = function(data) {
    // return Buffer or Uint8Array
    data = data.split && data.charCodeAt ? data.split('').map(function(c) {return c.charCodeAt(0) & 0xff;}) : data;
    return hasBuffer ? (!(data instanceof Buffer) ? Buffer.from(data) : data) : (!(data instanceof Uint8Array) ? (new Uint8Array(data)) : data);
};
ByteStream.byteToBits = function(byte) {
    byte = ((+byte)||0) & 0xff;
    for (var bits=new Array(8),i=0; i<8; ++i) bits[i] = (byte >> (7-i)) & 0x1;
    return bits;
};
ByteStream.bitsToByte = function(bits, start, end) {
    if (null == start) {start = 0; end = bits.length;}
    for (var byte=0,i=start; i<end; ++i) byte = (byte << 1) + (bits[i]||0);
    return byte;
};
ByteStream.alloc = function(size) {
    // return Buffer or Uint8Array
    var buffer;
    if (hasBuffer)
    {
        buffer = Buffer.alloc(size);
    }
    else
    {
        buffer = new Uint8Array(size);
    }
    return buffer;
};
ByteStream.concat = function(chunks) {
    // return Buffer or Uint8Array
    var bytes, total = 0;
    if (hasBuffer)
    {
        bytes = Buffer.concat(chunks);
    }
    else
    {
        bytes = new Uint8Array(chunks.reduce(function(l, c) {
            return l+c.length;
        }, 0));
        chunks.forEach(function(chunk) {
            bytes.set(chunk, total);
            total += chunk.length;
        });
    }
    return bytes;
};
ByteStream.put = function(buffer, pos, val, type, endianness) {
    var buf;
    pos = pos || 0;
    if (hasBuffer)
    {
        buf = buffer instanceof Buffer ? buffer : Buffer.from(buffer);
        switch (type)
        {
            case 'uint8':
            buf['writeUInt8'](val & 0xff, pos);
            break;
            case 'int8':
            buf['writeInt8'](val, pos);
            break;
            case 'uint16':
            buf['writeUInt16'+endianness](val & 0xffff, pos);
            break;
            case 'int16':
            buf['writeInt16'+endianness](val, pos);
            break;
            case 'uint32':
            buf['writeUInt32'+endianness](val & 0xffffffff, pos);
            break;
            case 'int32':
            buf['writeInt32'+endianness](val, pos);
            break;
        }
    }
    else if (hasArrayBuffer)
    {
        buf = buffer.buffer instanceof ArrayBuffer ? buffer.buffer : buffer;
        switch (type)
        {
            case 'uint8':
            (new DataView(buf)).setUint8(pos, val & 0xff);
            break;
            case 'int8':
            (new DataView(buf)).setInt8(pos, val);
            break;
            case 'uint16':
            (new DataView(buf)).setUint16(pos, val & 0xffff, 'LE' === endianness);
            break;
            case 'int16':
            (new DataView(buf)).setInt16(pos, val, 'LE' === endianness);
            break;
            case 'uint32':
            (new DataView(buf)).setUint32(pos, val & 0xffffffff, 'LE' === endianness);
            break;
            case 'int32':
            (new DataView(buf)).setInt32(pos, val, 'LE' === endianness);
            break;
        }
    }
    return buffer;
};
ByteStream.crc32 = function crc32(bytes, start, end) {
    if (null == start) {start = 0; end = bytes.length;}
    var crcTable = CRCTable(), crc = -1, i, l;
    for (i=start; i<end; ++i) crc = crcTable[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
    return crc ^ (-1);
};
ByteStream.encodeBase64 = function(bytes) {
    if (hasBuffer)
    {
        return Buffer.from(bytes).toString('base64');
    }
    else if ('function' === typeof btoa)
    {
        return btoa(Array.from(bytes, function(byte) {return String.fromCodePoint(byte)}).join(""));
    }
};
ByteStream.decodeBase64 = function(b64str) {
    if (hasBuffer)
    {
        return Buffer.from(b64str, 'base64');
    }
    else if ('function' === typeof atob)
    {
        var binaryString = atob(b64str),
            i, n = binaryString.length,
            bytes = new Uint8Array(n);
        for (i=0; i<n; ++i) bytes[i] = binaryString.charCodeAt(i);
        return bytes.buffer;
    }
};

// utils
var stdMath = Math,
    hasBuffer = "undefined" !== typeof Buffer,
    hasArrayBuffer = "undefined" !== typeof ArrayBuffer,
    fromCharCode = String.fromCharCode, _crcTable = null;

function err(msg)
{
    throw new Error(msg);
}
function CRCTable()
{
    if (null == _crcTable)
    {
        _crcTable = new Int32Array(256);
        var i, j, currentCrc;
        for (i=0; i<256; ++i)
        {
            currentCrc = i;
            for (j=0; j<8; ++j)
            {
                currentCrc = currentCrc & 1 ? (0xedb88320 ^ (currentCrc >>> 1)) : (currentCrc >>> 1);
            }
            _crcTable[i] = currentCrc;
        }
    }
    return _crcTable;
}

// export it
return ByteStream;
});
