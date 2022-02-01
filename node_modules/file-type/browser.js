'use strict';
const {ReadableWebToNodeStream} = require('readable-web-to-node-stream');
const toBuffer = require('typedarray-to-buffer');
const core = require('./core');

async function fromStream(stream) {
	const readableWebToNodeStream = new ReadableWebToNodeStream(stream);
	const fileType = await core.fromStream(readableWebToNodeStream);
	await readableWebToNodeStream.close();
	return fileType;
}

async function fromBlob(blob) {
	const buffer = await convertBlobToBuffer(blob);
	return core.fromBuffer(buffer);
}

/**
Convert Web API File to Node Buffer.
@param {Blob} blob - Web API Blob.
@returns {Promise<Buffer>}
*/
function convertBlobToBuffer(blob) {
	return new Promise((resolve, reject) => {
		const fileReader = new FileReader();
		fileReader.addEventListener('loadend', event => {
			let data = event.target.result;
			if (data instanceof ArrayBuffer) {
				data = toBuffer(new Uint8Array(event.target.result));
			}

			resolve(data);
		});

		fileReader.addEventListener('error', event => {
			reject(new Error(event.message));
		});

		fileReader.addEventListener('abort', event => {
			reject(new Error(event.type));
		});

		fileReader.readAsArrayBuffer(blob);
	});
}

Object.assign(module.exports, core, {
	fromStream,
	fromBlob
});
