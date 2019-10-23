'use strict';

var util = require('util');
var pwabuilderLib = require('pwabuilder-lib');

var webapk = require('./webapks_pb');
var fetch = require('node-fetch');
var URL = require('url').URL;
var path = require('path');
var nodeify = require('nodeify');
var jimp = require('jimp');

var CustomError = pwabuilderLib.CustomError,
  PlatformBase = pwabuilderLib.PlatformBase,
  manifestTools = pwabuilderLib.manifestTools,
  fileTools = pwabuilderLib.fileTools;

var constants = require('./constants');

function Platform(packageName, platforms) {

  var self = this;

  PlatformBase.call(this, constants.platform.id, constants.platform.name, packageName, __dirname);

  // save platform list
  self.platforms = platforms;

  // environment variables
  self.token = process.env.WEBAPKTOKEN;
  self.webapkApiUrl = process.env.WEBAPKAPIURL;	
  self.webapkUrl = process.env.WEBAPKURL;
  self.apkName = process.env.ORIGINAPKNAME;
  

  self.hexToLong = function(value) {
    if (value) {
      return (parseInt(value.replace('#', 'FF'), 16) -4294967296).toString() + 'L';
    }
  }

  self.isValidUrl = function(url) {
    if (url.search('https://') === 0) {
      return true;
    }
    if (url.search('http://') === 0) {
      return true;
    }
    return false;
  }

  self.isValidImage = function(type) {
    var re = new RegExp('apng|bmp|gif|x-icon|jpeg|png|svg+xml|tiff|webp');
    if (re.exec(type)) {
      console.log('valid image');
      return true;
    }
    console.warn('invalid image type: ' + type);
    return false;
  }

  /**
   * returns a url to download a generated webapk
   * @param  {json} manifest        manifest data
   * @param  {string} chromeVersion chrome version from user agent
   * @param  {string} href          location.href of website used in case of empty scope
   * @return {string}               url of generated apk
   */
  
  self.create = function (manifest, rootDir, chromeVersion, href, callback) {
    self.info('Generating the ' + constants.platform.name + 'app...');

    var platformDir = self.getOutputFolder(rootDir);
    var sourceDir = path.join(platformDir, 'source');

    self.info('platformDir', platformDir);
    self.debug('Creating the ' + constants.platform.name + ' app folder...');

    return fileTools.mkdirp(platformDir)
    .then(async function () {
      const origin = (new URL(href)).origin;
      const headers = {
        "Accept": "application/x-protobuf",
        "Content-Type": "application/x-protobuf",
        "X-Api-Key": self.token
      }
  
      var webAppManifest = new webapk.WebAppManifest();
      const primary_icon = 1;
      const name = 'name' in manifest.content ? manifest.content.name : '';
      const short_name = 'short_name' in manifest.content ? manifest.content.short_name : '';
      var start_url = 'start_url' in manifest.content ? manifest.content.start_url : '/';
      if (!self.isValidUrl(start_url)) {
        start_url = origin + start_url;
      }
      var scopes = 'scope' in manifest.content ? manifest.content.scope : '/';

      if (!self.isValidUrl(scopes)) {
        scopes = origin + scopes;
      }

      const orientation = 'orientation' in manifest.content ? manifest.content.orientation : 'portrait';
      const display_mode = 'display' in manifest.content ? manifest.content.display : 'standalone';
      const theme_color = 'theme_color' in manifest.content ? self.hexToLong(manifest.content.theme_color) : '0L';
      const background_color = 'background_color' in manifest.content ? self.hexToLong(manifest.content.background_color) : '0L';

      const icons = manifest.content.icons;
      var imageLink = icons[0]["src"];

      let imageBuffer;

      const response = await fetch(imageLink);
      const images = await response.blob();
      var buffer;
      if (self.isValidImage(images.type)) {
        buffer = await images.arrayBuffer();
        if (images.type != 'image/png') {
          jimp.read(buffer, (err, result) => {
            if (err) {
              console.warn('unable to convert: ' + err);
            } else {
              result.write(__dirname + '/image.png', (err, file)=>{
                if (err) {
                  console.warn('unable to write: ' + err);
                }
                file.getBuffer(jimp.MIME_PNG, (err, imageBuffer) => {
                  if (err) {
                    buffer = false;
                    console.warn('unable to read buffer: ' + err);
                  } else {
                    buffer = imageBuffer;
                  }
                });
              });
            }
          });
        }
      }

      let webApkImage = new webapk.Image();
      webApkImage.setUsagesList(primary_icon);
      webApkImage.setSrc(imageLink);
      if (buffer) {
        webApkImage.setImageData(new Uint8Array(buffer));
      }
  
      webAppManifest.setName(name);
      webAppManifest.setShortName(short_name);
      webAppManifest.setStartUrl(start_url);
      webAppManifest.setScopesList([scopes]);
      webAppManifest.setIconsList([webApkImage]);
      webAppManifest.setOrientation(orientation);
      webAppManifest.setDisplayMode(display_mode);
      webAppManifest.setThemeColor(theme_color);
      webAppManifest.setBackgroundColor(background_color);
  
      // webapk data
      const updateReason = "1";
      var package_name = "";
      if ('default' in manifest && 'short_name' in manifest.default) {
        package_name = manifest.default.short_name;
      }
      if ('short_name' in manifest.content) {
        package_name = manifest.content.short_name;
      }
      const version = manifest.content.version ? manifest.content.version : 1;
      const manifest_url = manifest.generatedUrl;
      const appManifest = webAppManifest;
      const requester_application_version = chromeVersion;
      const requester_application_package = self.apkName;
      const android_abi = "armeabi-v7a";
      const stale_manifest = 0;
  
      var webApkMessage = new webapk.WebApk();
      webApkMessage.setUpdateReason(updateReason);
      webApkMessage.setPackageName(package_name);
      webApkMessage.setVersion(version);
      webApkMessage.setManifestUrl(manifest_url);
      webApkMessage.setManifest(webAppManifest);
      webApkMessage.setRequesterApplicationPackage(requester_application_package);
      webApkMessage.setRequesterApplicationVersion(requester_application_version);
      webApkMessage.setAndroidAbi(android_abi);
      webApkMessage.setStaleManifest(stale_manifest);
  
      var bytes = webApkMessage.serializeBinary();
  
      return fetch(self.webapkApiUrl, {
        method: "POST",
        headers: headers,
        body: bytes
      })
      .then(response =>
        response.arrayBuffer())
      .then(response => {
          var bytes = new Uint8Array(response);
          var res = webapk.WebApkResponse.deserializeBinary(bytes).array;
          var webApkResponse = new webapk.WebApkResponse(res);
          var object = webApkResponse.toObject();
          var objPackageName = object.packageName;
          var version = object.version;
          var token = object.token;

          var link = self.webapkUrl + token + "/" + version + "/" + objPackageName + ".apk";
          return link;
      }).then(async link => {
          console.log('link', link);
          const response = await fetch(link);
          return response;
      }).then(async function(response) {
          const blob = await response.blob();
          const buffer = await blob.arrayBuffer();
          const goodBuff = Buffer.from(buffer);
          return fileTools.writeFile(sourceDir + 'app.apk', goodBuff);
        })
      .then(function () {
          self.debug('Copying the ' + constants.platform.name + ' manifest to the app folder...');
          var manifestFilePath = path.join(platformDir, 'manifest.json');
          return manifestTools.writeToFile(manifest, manifestFilePath);
        })
    })
    .nodeify(callback);
  };
}

util.inherits(Platform, PlatformBase);

module.exports = Platform;