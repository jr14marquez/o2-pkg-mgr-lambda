const Fs = require('fs') 
const Axios = require('axios')
const Convert = require('xml-js');
// Set xml parser options
const parseOpts = { compact: true, trim: true, textKey: 'text' }

var getConfs = (s3,app) => {

	var files = [
		{ name: `${app.alias}-prod.yml`, prefix: 'static/configs' },
		{ name: `${app.alias}-dev.yml`, prefix: 'static/configs' },
		{ name: `omar.conf`, prefix: 'static/configs' },
		{ name: `.env`, prefix: 'static/configs' },
		{ name: `omar-systemd.sh`, prefix: 'static/scripts' },
		{ name: `${app.alias}.service`, prefix: 'static/systemd' },
	]

	files.map(file => {
		var stream = Fs.createWriteStream(`/tmp/${file.name}`)
		s3.getObject({Bucket: process.env.BUCKET, Key: `${file.prefix}/${file.name}` })
		.createReadStream()
		.on('error', (e) => onError(e))
		.pipe(stream)
		.on('end', () => { console.log('receiving ended') })
		.on('error', (e) => onError(e))
	})

	// if omar-cmdln or omar-disk-cleanup then add timers
	if(app.alias == ('omar-cmdln' || 'omar-disk-cleanup')) {
		var timerStream = Fs.createWriteStream(`/tmp/${app.alias}.timer`)
		s3.getObject({Bucket: process.env.BUCKET, Key: `static/systemd/${app.alias}.timer` })
		.createReadStream()
		.on('error', (e) => onError(e))
		.pipe(timerStream)
		.on('end', () => { console.log('receiving ended') })
		.on('error', (e) => onError(e))
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
 
  	var versions = Convert.xml2js(appBaseXml.data,parseOpts).metadata.versioning.versions.version
  	var ltsVersion = versions.length != undefined ? versions.pop().text : versions.text
    var ltsVersionUrl = `${process.env.NEXUS_REPO}/${app.groupId}/${app.artifactId}/${ltsVersion}/maven-metadata.xml`
    console.log('about to get ltsVersion url',ltsVersionUrl)
    // Request the latest version 
    return Axios.get(ltsVersionUrl)
  })
  .then(ltsVersionXml => {
  	console.log('Finished making second axios getUrl for ltsVersionUrl')
    // Determine the latest jar file
    var metadata = Convert.xml2js(ltsVersionXml.data,parseOpts).metadata
    var snapshot = metadata.version.text
    var version = snapshot.split('-')[0]
    var timestamp = metadata.versioning.snapshot.timestamp.text
    var buildNumber = metadata.versioning.snapshot.buildNumber.text
    var jarFile = `${app.artifactId}-${version}-${timestamp}-${buildNumber}.jar`
    var snapshotUrl = `${process.env.NEXUS_REPO}/${app.groupId}/${app.artifactId}/${snapshot}/${jarFile}`
    console.log('returning snap data')
    return Promise.resolve({ url: snapshotUrl, timestamp: timestamp, buildNumber: buildNumber, version: version, jarFile: jarFile})
   })
  .catch(err => onError)
}

var headObject = (s3, key, data) => {
	return new Promise((resolve,reject) => {
		 s3.headObject({Bucket: process.env.BUCKET, Key: key })
		.on('success', () => {
			resolve({ found: true, key: key, url: `https://s3.amazonaws.com/${process.env.BUCKET}/${key}` })
		})
		.on('error', (err) => {
			if(error.code == 'NotFound') {
				resolve({ found: false, snapdata: data})
			}
			else {
				reject(error)
			}
		}).send()
	})
}

var getSnapshot = (data) => {
	console.log('in getsnapshot')
	return new Promise((resolve,reject) => {
		Axios({ method: 'GET', url: data.url, responseType: 'stream'})
	  .then(response => {
	    const path = Path.resolve('/','tmp',data.jarFile)
	    // pipe the result stream into a file
	    response.data.pipe(Fs.createWriteStream(path))
	    response.data.on('error', (err) => reject(`error writing snapshot: ${err}`)) 
	    response.data.on('end', () => resolve(data)) //return snapshot data
	  })
	  .catch(err => Promise.reject(`error getting snapshot: ${err}`))
	})
}



function onError(error) {
	console.log('error firing here? ',error)
}

module.exports = {
	getConfs: getConfs,
	getSnapshotData: getSnapshotData,
	headObject: headObject,
	getSnapshot: getSnapshot
}