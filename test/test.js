"use strict";

const ByteStream = ("undefined" !== typeof window) && (window.ByteStream) ? window.ByteStream : require('../src/ByteStream.js');

const stream = new ByteStream();

(async function writer() {
    // can write to byte stream
    const writestream = new ByteStream();
    writestream.writeInt(-512, 'int16', 'BE');
    writestream.writeInt(-512, 'int16', 'LE');
    console.log(await writestream.readInt('int16', 'BE'), -512);
    console.log(await writestream.readInt('int16', 'LE'), -512);
    console.log(writestream.bytes());
    writestream.clear();
    writestream.writeInt(-512, 'int16', 'BE');
    writestream.writeInt(262, 'int16', 'BE');
    writestream.writeUtf8(String.fromCodePoint(0x1f303));
    return writestream.bytes();//"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuvwxyz";
})().then(function(data) {
    function reader()
    {
        if (reader.pos >= data.length) return null;
        const pos = reader.pos, offset = 2;
        reader.pos += offset;
        return data.slice(pos, pos+offset); // simulate data coming in progressively
    }
    reader.pos = 0;
    setTimeout(function read() {
        const chunk = reader();
        if (!chunk)
        {
            // if no more data, signal to the stream that we finished
            stream.finish();
        }
        else
        {
            // as long as reader has new data, add them to the stream
            stream.add(chunk);
            setTimeout(read, 100);
        }
    }, 100);
});

(async function test() {
    // read from byte stream asynchronously, while new data arrive
    console.log(await stream.readInt('int16', 'BE'), -512);
    console.log(await stream.readInt('int16', 'BE'), 262);
    console.log(await stream.readUtf8(1), String.fromCodePoint(0x1f303));
})().then(() => {console.log('--EOF--')});