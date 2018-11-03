'use strict'

const Fs = require('fs')  
const Path = require('path')  
const Axios = require('axios');
const Convert = require('xml-js');
var rpm = require('./buildRpm');

const nexusUrl = 'https://nexus.ossim.io/nexus/content/repositories/omar-local-snapshot'
const apps = [
	{ artifactId: 'omar-ui-app', groupId: 'io/ossim/omar/apps' },
	{ artifactId: 'omar-services-app', groupId: 'io/ossim/omar/apps' },
	{ artifactId: 'omar-disk-cleanup-app', groupId: 'io/ossim/omar/apps' },
	{ artifactId: 'tlv-app', groupId: 'io/ossim/omar/apps' },
	{ artifactId: 'omar-cmdln-app', groupId: 'omar/cmdln/app' }
]

/// used for testing on just one
const mapps = [
  { artifactId: 'omar-cmdln-app', groupId: 'omar/cmdln/app' }
]

// Set xml parser options
const parseOpts = { compact: true, trim: true, textKey: 'text' }

mapps.map(app => {
  var jarFile, version, timestamp, buildNumber
	var appBaseUrl = `${nexusUrl}/${app.groupId}/${app.artifactId}/maven-metadata.xml`
  /* Request to get versions of app and grab the latest. If more than one version exists it'll be in
  ** an array. If single version it'll just be an object with text as the key.
  */
	Axios.get(appBaseUrl)
  .then(appBaseXml => {
 
  	var versions = Convert.xml2js(appBaseXml.data,parseOpts).metadata.versioning.versions.version
  	var ltsVersion = versions.length != undefined ? versions.pop().text : versions.text
    var ltsVersionUrl = `${nexusUrl}/${app.groupId}/${app.artifactId}/${ltsVersion}/maven-metadata.xml`

    // Request the latest version 
    return Axios.get(ltsVersionUrl)
  })
  .then(ltsVersionXml => {
    // Determine the latest jar file
    var metadata = Convert.xml2js(ltsVersionXml.data,parseOpts).metadata
    var snapshot = metadata.version.text
    version = snapshot.split('-')[0]
    timestamp = metadata.versioning.snapshot.timestamp.text
    buildNumber = metadata.versioning.snapshot.buildNumber.text
    jarFile = `${app.artifactId}-${version}-${timestamp}-${buildNumber}.jar`
    var snapshotUrl = `${nexusUrl}/${app.groupId}/${app.artifactId}/${snapshot}/${jarFile}`

    // Begin downloading the latest(most up to date) jar file via stream
    return Axios({ method: 'GET', url: snapshotUrl, responseType: 'stream'})
  })
  .then(response => {
    const path = Path.resolve(__dirname, 'omar',jarFile)
    // pipe the result stream into a file
    response.data.pipe(Fs.createWriteStream(path))
    response.data.on('end', () => {

      var rpmApp = { name: app.artifactId.replace('-app',''), version: version, release: `${timestamp}-${buildNumber}`, jar: jarFile}
      rpm.build(rpmApp)
    })

    response.data.on('error', () => {
      console.log('error downloading: ',app.artifactId)
    })
  })
  .catch(onError)
})//end loop


function onError(error) {
	console.error(error)
}


