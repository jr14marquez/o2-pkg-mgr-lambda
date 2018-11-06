var buildRpm = require('rpm-builder');

var build = (app) => {
console.log('in rpm build')
	return new Promise((resolve,reject) => {
		var options = {
		  name: app.name,
		  version: app.version, //swapping for rpm naming convention. Package names it backwards
		  release: app.release.replace('-','.'),
		  buildArch: 'noarch',
		  tempDir: '/tmp',
		  rpmDest: '/tmp',
		  requires: ['/usr/sbin/useradd', '/usr/bin/getent','/usr/sbin/userdel','httpd','java-1.8.0'],
		  files: [
		  	{cwd: '/tmp', src: app.jar, dest: `/usr/share/omar/${app.name}`},
		    {cwd: '/tmp', src: `${app.name}-dev.yml`, dest: `/usr/share/omar/${app.name}`, directive: 'config(noreplace)'},
		    {cwd: '/tmp', src: `${app.name}-prod.yml`, dest: `/usr/share/omar/${app.name}`, directive: 'config(noreplace)'},
		    {cwd: '/tmp', src: `${app.name}.service`, dest: '/etc/systemd/system/', directive: 'config(noreplace)'},
		    {cwd: '/tmp', src: 'omar.conf', dest: '/etc/httpd/conf.d', directive: 'config(noreplace)'},
		    {cwd: '/tmp', src: '.env', dest: `/usr/share/omar`, directive: 'config(noreplace)'},	    
		    {cwd: '/tmp', src: 'omar-systemd.sh', dest: `/usr/share/omar`, directive: 'config(noreplace)'}
		  ],
		  preInstallScript: [
		    '/usr/bin/getent group project-omar > /dev/null || /usr/sbin/groupadd -r project-omar',
		    '/usr/bin/getent passwd omar > /dev/null || /usr/sbin/useradd omar -r -d /usr/share/omar -s /bin/bash -g project-omar'
		  ],
		  preUninstallScript: [`if [ "$1" = "0" ]; then systemctl stop ${app.name}; fi; exit 0`],
		  postInstallScript : [
	    	`systemctl enable ${app.name}`,
	    	`mkdir -p /var/log/omar`,
	    	`chown -R omar:project-omar /usr/share/omar /var/log/omar`,
	    	`chmod -R 774 /usr/share/omar`,
	  	],
		  keepTemp: false // true for debugging
		}

		if(app.name == 'omar-cmdln' || app.name == 'omar-disk-cleanup'){
			options.files.push({cwd: '/tmp/omar', src: `${app.name}.timer`, dest: `/etc/systemd/system`, directive: 'config(noreplace)'})
			options.postInstallScript.push(`systemctl enable ${app.name}.timer`)
		}

		buildRpm(options, function(err, rpm) {
		  if (err) {
		    throw err;
		    reject(err)
		  }
		  
		  console.log(rpm);
		  resolve(rpm)
		  // /path/to/my-project-0.0.0-1.noarch.rpm
		});
	})

}
 
module.exports = {
	build: build
}
