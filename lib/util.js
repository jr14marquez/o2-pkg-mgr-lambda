const Fs = require('fs') 
const Path = require('path')
const Axios = require('axios')
const Convert = require('xml-js');
// Set xml parser options
const parseOpts = { compact: true, trim: true, textKey: 'text' }

var getConfs = (s3,app) => {

	var files = [
		{ name: `${app.alias}-prod.yml`, prefix: 'static/configs' },
		{ name: `${app.alias}-dev.yml`, prefix: 'static/configs' },
		{ name: `.env`, prefix: 'static/configs' },
		{ name: `omar-systemd.sh`, prefix: 'static/scripts' },
		{ name: `${app.alias}.service`, prefix: 'static/systemd' },
	]

	files.map(file => {
		var stream = Fs.createWriteStream(`/tmp/${file.name}`)
		s3.getObject({Bucket: process.env.BUCKET, Key: `${file.prefix}/${file.name}` })
		.createReadStream()
		.on('error', (e) => onError('e1',e))
		.pipe(stream)
		.on('end', () => { console.log('receiving ended') })
		.on('error', (e) => onError('e2',e))
	})

	// if omar-cmdln or omar-disk-cleanup then add timers
	if(app.alias.match(/^(omar-cmdln|omar-disk-cleanup)$/)) {
		console.log('in if')
		var timerStream = Fs.createWriteStream(`/tmp/${app.alias}.timer`)
		s3.getObject({Bucket: process.env.BUCKET, Key: `static/systemd/${app.alias}.timer` })
		.createReadStream()
		.on('error', (e) => onError('e3',e))
		.pipe(timerStream)
		.on('end', () => { console.log('receiving ended') })
		.on('error', (e) => onError('e4',e))
	} else {
		console.log('in else')
		var httpdConfStream = Fs.createWriteStream(`/tmp/${app.alias}.conf`)
		s3.getObject({Bucket: process.env.BUCKET, Key: `static/configs/${app.alias}.conf` })
		.createReadStream()
		.on('error', (e) => onError('e5',e))
		.pipe(httpdConfStream)
		.on('end', () => { console.log('receiving ended') })
		.on('error', (e) => onError('e6',e))
	}

	
}

var getSnapshotData = (app) => {

	var appBaseUrl = `${process.env.NEXUS_REPO}/${app.groupId}/${app.artifactId}/maven-metadata.xml`
  /* Request to get versions of app and grab the latest. If more than one version exists it'll be in
  ** an array. If single version it'll just be an object with text as the key.
  */
	return Axios.get(appBaseUrl)
  .then(appBaseXml => {
  	console.log('Finished making first axios getUrl')
    var metadata = Convert.xml2js(appBaseXml.data,parseOpts).metadata
  	var versions = metadata.versioning.versions.version
  	var ltsVersion = versions.length != undefined ? versions.pop().text : versions.text
  	var timestamp = metadata.versioning.lastUpdated.text
    var ltsVersionUrl = `https://nexus.ossim.io/nexus/content/repositories/omar-local-release/${app.groupId}/${app.artifactId}/${ltsVersion}/${app.artifactId}-${ltsVersion}.jar`
    console.log('about to get ltsVersion url',ltsVersionUrl)
    var jarFile = `${app.artifactId}-${ltsVersion}-${timestamp}.jar`
		  
    return Promise.resolve({ url: ltsVersionUrl, release: timestamp, version: ltsVersion, jarFile: jarFile})
  })
}

var headObject = (s3, key, data) => {
	console.log('data in headobjecdt: ',data)
	return new Promise((resolve,reject) => {
		 s3.headObject({Bucket: process.env.BUCKET, Key: key })
		.on('success', () => {
			resolve({ found: true, key: key, url: `https://s3.amazonaws.com/${process.env.BUCKET}/${key}` })
		})
		.on('error', (err) => {
			if(err.code == 'NotFound') {
				resolve({ found: false, url: data.url, release: data.release, version: data.version, jarFile: data.jarFile})
			}
			else {
				reject(err)
			}
		}).send()
	})
}

var getSnapshot = (data) => {
	console.log('in getsnapshot with data: ',data)
	return new Promise((resolve,reject) => {
		Axios({ method: 'GET', url: data.url, responseType: 'stream'})
	  .then(response => {
	  	console.log('response: ',response)
	    const path = Path.resolve('/','tmp',data.jarFile)
	    // pipe the result stream into a file
	    response.data.pipe(Fs.createWriteStream(path))
	    response.data.on('error', (err) => {
	    	console.log('error here1: ',err)
	    	reject(`error writing snapshot: ${err}`)
	    }) 
	    response.data.on('end', () => resolve(data)) //return snapshot data
	  })
	  .catch(err => Promise.reject(`error getting snapshot: ${err}`))
	})
}



function onError(msg,error) {
	console.log(`${msg}: ${error}`)
}

module.exports = {
	getConfs: getConfs,
	getSnapshotData: getSnapshotData,
	headObject: headObject,
	getSnapshot: getSnapshot
}
