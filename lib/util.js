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
		console.log('buck: ',process.env.BUCKET)
		console.log('Key: ', `${file.prefix}/${file.name}`)
		s3.getObject({Bucket: process.env.BUCKET, Key: `${file.prefix}/${file.name}` })
		.createReadStream()
		.on('error', (e) => onFsError(e))
		.pipe(stream)
		.on('data', (data) => { console.log('receiving data:', data)})
		.on('end', () => { console.log('receiving ended') })
		.on('error', (e) => onFsError(e))
	})

	// if omar-cmdln or omar-disk-cleanup then add timers
	if(app.alias == ('omar-cmdln' || 'omar-disk-cleanup')) {
		var timerStream = Fs.createWriteStream(`/tmp/${app.alias}.timer`)
		s3.getObject({Bucket: process.env.BUCKET, Key: `static/systemd/${app.alias}.timer` })
		.createReadStream()
		.on('error', (e) => onFsError(e))
		.pipe(timerStream)
		.on('data', (data) => { console.log('receiving data:', data)})
		.on('end', () => { console.log('receiving ended') })
		.on('error', (e) => onFsError(e))
	}

	
}

var getSnapshotUrl = (app) => {

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
    return Promise.resolve({ url: snapshotUrl, timestamp: timestamp, buildNumber: buildNumber, version: version, jarFile: jarFile})
   })
  .catch(err => onError)
}

function onError(error) {
	console.log('error firing here? ',error)
}

function onFsError(error) {
	console.log('fs err: ', error)
}

module.exports = {
	getConfs: getConfs,
	getSnapshotUrl: getSnapshotUrl
}